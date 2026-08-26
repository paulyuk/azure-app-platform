from __future__ import annotations

import json

import azure.functions as func

from tools.inventory_search import TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, TOOL_NAME, run_inventory_search

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.function_name(name="inventory_search")
@app.route(route="inventory-search", methods=["POST"])
def inventory_search(req: func.HttpRequest) -> func.HttpResponse:
    try:
        payload = req.get_json()
    except ValueError:
        payload = {}

    result = run_inventory_search(payload)
    return func.HttpResponse(json.dumps(result), mimetype="application/json", status_code=200)


# Best-effort registration metadata for serverless agents runtime / MCP hosting.
MCP_TOOL_REGISTRY = {
    TOOL_NAME: {
        "description": TOOL_DESCRIPTION,
        "input_schema": TOOL_INPUT_SCHEMA,
        "http_route": "/api/inventory-search",
    }
}
