"""In-process local bridge for the Hosted Skills tools.

The real deployment routes tool calls through Foundry Toolbox -> AI Gateway MCP
toolservers (see `_foundry_toolbox()` in `main.py`), which requires deploying
each skill as its own Flex Consumption Functions app and registering it in
Foundry Toolbox (see `src/skills/README.md` "Hosted registration pattern").

For **local dev/demo/e2e-test** runs before a Foundry Toolbox is provisioned,
that's slow to stand up and not free. This module gives the agent the same
four tools by importing each skill's pure-logic `tools/*.py` module directly
out of `src/skills/` and wrapping it as an `agent_framework` `FunctionTool` -
no network hop, no Functions host, no Azure resources required.

`main.py` uses this automatically whenever `TOOLBOX_ENDPOINT` is not set in
the environment - no explicit mode switch needed. Once a real Foundry
Toolbox is provisioned and `TOOLBOX_ENDPOINT` is set, the agent uses it
instead and this module is not used.

This is a dev/demo convenience only. It does not exercise the real Hosted
Skills deployment path (Functions app, `mcp.json`, Foundry Toolbox
registration) — that must still be validated separately before relying on it
for production behavior.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable

from agent_framework import FunctionTool, tool

SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills"

# (skill folder name, tool module filename, tool module's callable name)
_SKILL_MODULES = [
    ("inventory-search", "inventory_search", "inventory_search_tool"),
    ("trade-in-value", "trade_in_value", "trade_in_value_tool"),
    ("rate-sheet", "rate_sheet", "rate_sheet_tool"),
    ("deal-doc", "deal_doc", "deal_doc_tool"),
]


def _load_tool_module(skill_folder: str, module_filename: str):
    module_path = SKILLS_ROOT / skill_folder / "tools" / f"{module_filename}.py"
    if not module_path.exists():
        raise FileNotFoundError(f"Hosted skill module not found: {module_path}")

    module_name = f"unity_local_skill_{module_filename}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _make_wrapper(tool_fn: Callable[[dict[str, Any]], dict[str, Any]], tool_name: str) -> Callable[..., dict[str, Any]]:
    def wrapper(**kwargs: Any) -> dict[str, Any]:
        return tool_fn(kwargs)

    wrapper.__name__ = tool_name.replace("-", "_")
    return wrapper


def load_local_skill_tools() -> list[FunctionTool]:
    """Import every Hosted Skill's pure-logic tool and wrap it for direct agent use.

    Raises if any skill module can't be imported/found, so a broken local dev
    setup fails loudly instead of silently running with fewer tools than expected.
    """
    tools: list[FunctionTool] = []
    for skill_folder, module_filename, tool_fn_name in _SKILL_MODULES:
        module = _load_tool_module(skill_folder, module_filename)
        tool_fn = getattr(module, tool_fn_name)
        tool_name = getattr(module, "TOOL_NAME", skill_folder)
        tool_description = getattr(module, "TOOL_DESCRIPTION", f"{tool_name} hosted skill")
        tool_schema = getattr(module, "TOOL_INPUT_SCHEMA", None)

        wrapped = _make_wrapper(tool_fn, tool_name)
        tools.append(
            tool(
                wrapped,
                name=tool_name,
                description=tool_description,
                schema=tool_schema,
            )
        )
    return tools
