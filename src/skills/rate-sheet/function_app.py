from __future__ import annotations

import json

import azure.functions as func

from tools.rate_sheet import TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, TOOL_NAME, get_rate_options

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.function_name(name="rate_sheet")
@app.route(route="rate-sheet", methods=["POST"])
def rate_sheet(req: func.HttpRequest) -> func.HttpResponse:
    try:
        payload = req.get_json()
    except ValueError:
        payload = {}

    result = get_rate_options(payload)
    return func.HttpResponse(json.dumps(result), mimetype="application/json", status_code=200)


MCP_TOOL_REGISTRY = {
    TOOL_NAME: {
        "description": TOOL_DESCRIPTION,
        "input_schema": TOOL_INPUT_SCHEMA,
        "http_route": "/api/rate-sheet",
    }
}
