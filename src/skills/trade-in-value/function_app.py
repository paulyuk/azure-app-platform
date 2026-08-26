from __future__ import annotations

import json

import azure.functions as func

from tools.trade_in_value import (
    TOOL_DESCRIPTION,
    TOOL_INPUT_SCHEMA,
    TOOL_NAME,
    estimate_trade_in_value,
)

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.function_name(name="trade_in_value")
@app.route(route="trade-in-value", methods=["POST"])
def trade_in_value(req: func.HttpRequest) -> func.HttpResponse:
    try:
        payload = req.get_json()
    except ValueError:
        payload = {}

    result = estimate_trade_in_value(payload)
    return func.HttpResponse(json.dumps(result), mimetype="application/json", status_code=200)


MCP_TOOL_REGISTRY = {
    TOOL_NAME: {
        "description": TOOL_DESCRIPTION,
        "input_schema": TOOL_INPUT_SCHEMA,
        "http_route": "/api/trade-in-value",
    }
}
