# Unity POC Infrastructure Deployment Plan

**Status:** Validation Complete (scaffold only; Azure preflight deferred)

## Scope

- Scaffold an Azure Developer CLI project and subscription-scoped Bicep infrastructure.
- Model the Unity web, agent, skills, sandbox, workflows, gateway, connectors, and SRE tiers.
- Add keyless GitHub Actions deployment using workload identity federation.

## Architecture Decisions

- Use `azd` with Bicep and the `microsoft.foundry` extension.
- Use a subscription-scoped entry point that creates one POC resource group.
- Keep tier modules resource-group scoped and independently replaceable.
- Represent the hosted agent with Foundry account/project prerequisites; `azd` deploys the hosted-agent workload.
- Use Flex Consumption (`FC1`) and managed identities for Functions tiers.
- Use Durable Task Scheduler Consumption for the workflow tier.
- Use workload identity federation and repository variables in CI; do not use credential secrets.

## Constraints

- Default resources to East US 2.
- Pin Connector Namespace to West Central US.
- Reuse the AI Gateway design from `Azure-Samples/simple-foundry-hosted-agent-python-aigateway` in a later implementation pass.
- Preserve the API Management soft-delete/purge lifecycle warning.
- Keep this POC as the precursor to the Phase 6 `unity/platform/` and `unity/verticals/car-buying/` extraction.

## Planned Artifacts

- `azure.yaml`
- `infra/main.bicep`
- `infra/main.parameters.json`
- `infra/abbreviations.json`
- `infra/modules/*.bicep`
- `infra/README.md`
- `.github/workflows/azd-ci.yml`

## Validation

- [x] Azure Developer CLI installation and project-schema check.
- [x] Bicep build and lint.
- [x] YAML/JSON parsing and whitespace checks.
- [x] Static key/secret and RBAC review.
- [ ] Live `azd provision --preview`, policy evaluation, packaging, and app builds
      are deferred until the referenced application directories and placeholder
      platform TODOs are implemented.

## Execution Checklist

- [x] Read Unity plan sections 5.1, 5.3, and 5.4.
- [x] Inspect current tier directory availability.
- [x] Review the reference hosted-agent/AI-Gateway sample contracts.
- [x] Generate azd and Bicep artifacts.
- [x] Validate Bicep.
- [x] Mark ready for validation.

## Role Assignment Verification

- Status: Verified for the resources implemented by this scaffold.
- Skills identity: Storage Blob Data Owner, Storage Queue Data Contributor, and
  Storage Table Data Contributor, scoped to its storage account.
- Workflows identity: the same storage data roles plus Durable Task Data
  Contributor, scoped to its scheduler.
- Gateway/Foundry, sandbox egress, and SRE Agent access remain explicit TODOs;
  those placeholder identities have no configured cross-resource data access.

## Section 7: Validation Proof

- `azd version` → PASS (`1.28.1`).
- `azd auth login --check-status` → PASS.
- `azd show --no-prompt` → PASS; all five azd services were parsed.
- `az bicep build --file infra/main.bicep` → PASS with only BCP081 warnings for
  the two preview types absent from Bicep CLI `0.44.1`:
  `Microsoft.App/sandboxGroups@2026-02-01-preview` and
  `Microsoft.Web/connectorGateways@2026-05-01-preview`.
- `az bicep lint --file infra/main.bicep` → PASS with the same preview warnings.
- Ruby YAML parsing, Python JSON parsing, and `git diff --check` → PASS.
