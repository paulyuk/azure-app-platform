"""Durable Functions human-in-the-loop loan approval scaffold."""

from __future__ import annotations

from datetime import timedelta

import azure.durable_functions as df
import azure.functions as func

from orchestrator_logic import resolve_decision

DEMO_TIMEOUT_SECONDS = 90
DECISION_EVENT = "LoanApprovalDecision"

app = df.DFApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.function_name(name="LoanApprovalOrchestrator")
@app.orchestration_trigger(context_name="context")
def loan_approval_orchestrator(context: df.DurableOrchestrationContext):
    request = context.get_input() or {}
    yield context.call_activity("PostTeamsAdaptiveCard", request)

    deadline = context.current_utc_datetime + timedelta(seconds=DEMO_TIMEOUT_SECONDS)
    timeout_task = context.create_timer(deadline)
    decision_task = context.wait_for_external_event(DECISION_EVENT)
    winner = yield context.task_any([decision_task, timeout_task])

    if winner == decision_task:
        timeout_task.cancel()
        decision = resolve_decision(decision_task.result)
    else:
        decision = resolve_decision(None, timed_out=True)

    activities = {
        "approve": "ApproveLoan",
        "decline": "DeclineLoan",
        "escalate": "EscalateLoan",
    }
    result = yield context.call_activity(
        activities[decision],
        {"dealId": request.get("dealId"), "decision": decision},
    )
    return result


@app.function_name(name="PostTeamsAdaptiveCard")
@app.activity_trigger(input_name="request")
def post_teams_adaptive_card(request: dict) -> dict:
    """Stub the Connector Namespace call without sending customer data."""
    return {
        "status": "stubbed",
        "dealId": request.get("dealId"),
        "message": "Synthetic approval card would be posted to Teams.",
    }


@app.function_name(name="ApproveLoan")
@app.activity_trigger(input_name="request")
def approve_loan(request: dict) -> dict:
    return {"dealId": request.get("dealId"), "status": "approved"}


@app.function_name(name="DeclineLoan")
@app.activity_trigger(input_name="request")
def decline_loan(request: dict) -> dict:
    return {"dealId": request.get("dealId"), "status": "declined"}


@app.function_name(name="EscalateLoan")
@app.activity_trigger(input_name="request")
def escalate_loan(request: dict) -> dict:
    return {"dealId": request.get("dealId"), "status": "escalated"}


@app.function_name(name="StartLoanApproval")
@app.route(route="loan-approval/start", methods=["POST"])
@app.durable_client_input(client_name="client")
async def start_loan_approval(
    req: func.HttpRequest, client: df.DurableOrchestrationClient
) -> func.HttpResponse:
    payload = req.get_json()
    instance_id = await client.start_new("LoanApprovalOrchestrator", None, payload)
    return client.create_check_status_response(req, instance_id)


@app.function_name(name="SubmitLoanApprovalDecision")
@app.route(route="loan-approval/{instanceId}/decision", methods=["POST"])
@app.durable_client_input(client_name="client")
async def submit_loan_approval_decision(
    req: func.HttpRequest, client: df.DurableOrchestrationClient
) -> func.HttpResponse:
    instance_id = req.route_params["instanceId"]
    decision = resolve_decision(req.get_json())
    await client.raise_event(instance_id, DECISION_EVENT, {"decision": decision})
    return func.HttpResponse(status_code=202)
