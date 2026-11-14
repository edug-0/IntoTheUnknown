# Azure deployment

The production Dockerfile builds React and runs FastAPI on port 8000. The default host is one Azure Container App serving the UI, `/api`, `/frames` and bundled `/golden` snapshots from the same origin. Live core provisioning was completed on 2026-11-14: `rg-planetx`, storage, monitoring, ACR and the Container Apps environment exist in westus. Application deployment is tracked separately below; offline script tests alone do not prove a live deployment. See [BLOB-HANDOFF.md](BLOB-HANDOFF.md) for the tested cache endpoint and access requirements.

## Resources and limits

| Resource | Purpose | Integration |
|---|---|---|
| ACR + Container Apps environment + app | Build and host the combined app | Registry/environment created; ACR Tasks denied; GitHub build fallback prepared |
| System-assigned identity | Pull private images with registry-scoped AcrPull | Configured by `30-app.sh`; no registry password |
| Log Analytics | Container platform logs | Workspace created and linked to the environment |
| Application Insights | Future application telemetry | Resource created; Python instrumentation pending |
| Blob Storage | Persistent render cache and watcher state | Live account and containers verified; backend integration belongs to #12 |
| Functions | Future catalog watcher | Deployment and refresh API integration pending |
| Blob website / Static Web Apps | Alternative frontend hosts | Off by default; SWA blocked by recorded region policy |

Cosmos DB and Front Door are outside this deployment. Golden snapshots let presets render when API requests fail **while the web host remains reachable**. They do not cover host outages or cold starts. Measurements require the API. Maximum replicas stays at one while jobs live in process memory. Local render cache can disappear on restart.

## Prerequisites

Use Git Bash or Cloud Shell with Git, tar, curl and Azure CLI; GitHub CLI is optional for OIDC. ACR builds remotely, so local Docker is unnecessary. Authenticate with `az login`. Put these IDs in ignored `infra/.env.local`:

```text
AZ_SUBSCRIPTION_ID=<guid>
AZ_TENANT_ID=<guid>
```

Never post that file, tokens, connection strings or keys. Every script verifies subscription ID, tenant and the name `Azure for Students`; calls are explicitly pinned. Never use the university-managed subscription. `env.sh` disables MSYS argument conversion for resource IDs and explicitly converts local file paths for Windows Azure CLI.

## Execution order

Have another teammate review and merge the Azure and integrated-validation PRs, then fetch `origin/main`. Deployment requires the selected commit to contain `.dockerignore` and the Barnard golden manifest.

```bash
bash infra/check-scripts.sh
bash infra/tests/run.sh
bash infra/30-app.sh --plan          # default; no Azure calls
bash infra/00-preflight.sh           # provider registration; otherwise read-only
export LOC=westus SWA_LOC=none FRONTEND_HOST=container  # confirm fresh preflight
bash infra/10-core.sh                # creates billable core resources
ALERT_EMAIL=you@example.com bash infra/20-cost-alert.sh
SOURCE_REF=origin/main bash infra/30-app.sh --apply
```

The recorded 2026-11-14 preflight allowed westus, northcentralus, norwayeast, belgiumcentral and francecentral. Container Apps and Functions Flex were available; no SWA region overlapped. Rerun before creation. Core verifies region policy at subscription and resource-group scopes and checks existing locations, SKUs, TLS, HTTPS, CORS and workspace links. An unreadable policy blocks creation unless a human explicitly sets `ALLOW_UNVERIFIED_REGION=1` after checking it.

`30-app.sh --apply` checks core resources and ACR ARM-token authentication, archives a resolved Git commit, and submits tracked files to ACR. `.dockerignore` additionally permits only Dockerfile/backend/frontend/demo inputs and excludes private or generated files inside them. The archive is removed; the extracted local context remains for inspection. Image tags use the source commit. The app is bootstrapped without public ingress, assigned AcrPull only on the registry, switched to the private image, then exposed on port 8000. This follows [Microsoft's managed-identity image-pull flow](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull). RBAC propagation can delay pulls; rerunning the same commit is safe.

After deployment, check revision readiness, `/api/health`, all five presets and spectrum/brightness at the public URL. HTTP 200 health does not establish that IRSA is up or science is validated. Save the source SHA and verification results without secrets. Return minimum replicas to zero after judging; cold starts are expected.

## Optional CI and alternative hosts

`05-oidc-test.sh` creates or reuses only its saved, owned app registration, verifies federation for this repository's main branch, and grants registry-scoped AcrPush once ACR exists. It can save the three Azure IDs as GitHub Actions secrets. Permission denial exits 2 with a public-GHCR fallback; network errors exit 1. OIDC and an automatic workflow are unnecessary for the manual build above. A later deploy workflow needs permission scoped to this Container App; avoid resource-group Contributor.

Set `FRONTEND_HOST=blob` explicitly to enable the storage static website, or `FRONTEND_HOST=swa SWA_LOC=<allowed-region>` if policy permits. These need a separate frontend deployment and API-origin configuration; `30-app.sh` deploys the combined container only. The build context is the repository root, so an old backend-only workflow is unsuitable.

## Cost and checks

ACR, builds, monitoring, storage, network and compute can incur charges. The $20 budget is an email alert, not a spending cap. Azure for Students may reject the budget API; exit 3 requires checking the Azure Sponsorships credit portal instead. No live cost or remaining-credit estimate is claimed.

The live budget API accepted `budget-planetx` on 2026-11-14: $20 monthly on `rg-planetx`, actual-cost email alerts at 50/80/100 percent to the requested address. Amount, period and enabled recipients/thresholds were verified in the API response. Cost reporting can lag; this does not measure remaining student credit.

## ACR Tasks restriction and approved build fallback

The first live `az acr build` failed with `TasksOperationsNotAllowed`. No app revision was deployed. No local Docker/Podman builder is installed. The human approved `.github/workflows/build-image.yml` as a fallback: manually dispatch it with a full reviewed main SHA; it validates that the commit is on main, builds the root Dockerfile on a GitHub runner and pushes the commit-tagged image to the private registry. Repository permissions are `contents: read`; it has no Azure deployment step.

Just before dispatch, an authorized operator obtains a short-lived registry token using `az acr login --expose-token` and passes it **directly through stdin** to `gh secret set ACR_BUILD_TOKEN`. Never print the token, put it in a body/argument/file, or use the ACR admin password. Remove the GitHub secret after the run, including a failed run. Tokens expire after about three hours; this is a manual bootstrap route, not unattended CI authentication. [Microsoft's token login documentation](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-authentication#use-az-acr-login-without-docker-daemon).

After a successful workflow, `SOURCE_REF=<same-full-sha> bash infra/30-app.sh --deploy-only` checks the existing image digest and deploys with the original managed-identity flow, without requesting another ACR build. The workflow must be merged before its manual dispatch is available. OIDC remains a separate automation improvement.

`check-scripts.sh` checks syntax, subscription/ARM URL scoping and workspace-key avoidance. `tests/run.sh` uses fake Azure/GitHub commands and fixture identities only, checking wrong-subscription/tenant refusal, policy, configuration, OIDC and budget behavior. Exit codes: 0 success, 1 error, 2 OIDC permission denial, 3 budget refusal, 4 unconfirmed policy.
