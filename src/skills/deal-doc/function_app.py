from __future__ import annotations

import json

import azure.functions as func

from tools.deal_doc import TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, TOOL_NAME, build_deal_summary

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.function_name(name="deal_doc")
@app.route(route="deal-doc", methods=["POST"])
def deal_doc(req: func.HttpRequest) -> func.HttpResponse:
    try:
        payload = req.get_json()
    except ValueError:
        payload = {}

    result = build_deal_summary(payload)
    return func.HttpResponse(json.dumps(result), mimetype="application/json", status_code=200)


MCP_TOOL_REGISTRY = {
    TOOL_NAME: {
        "description": TOOL_DESCRIPTION,
        "input_schema": TOOL_INPUT_SCHEMA,
        "http_route": "/api/deal-doc",
    }
}
