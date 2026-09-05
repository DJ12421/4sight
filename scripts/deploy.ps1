param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$RuntimeServiceAccount,
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+$')][string]$SecretVersion,
  [string]$Region = 'us-central1',
  [string]$ServiceName = 'foresight',
  [string]$SecretName = 'GEMINI_API_KEY',
  [string]$Model = 'gemini-3.6-flash'
)
$ErrorActionPreference = 'Stop'
# This script publishes a public service. Run only after deployment/IAM approval.
$projectRoot = Split-Path $PSScriptRoot -Parent
$clientConfig = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'firebase-applet-config.json') | ConvertFrom-Json
$rulesConfig = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'firebase.json') | ConvertFrom-Json
if ($clientConfig.projectId -ne $ProjectId) { throw 'ProjectId must match the reviewed Firebase browser configuration.' }
if ($rulesConfig.firestore[0].database -ne $clientConfig.firestoreDatabaseId) { throw 'Client and rules database IDs do not match.' }
if ($RuntimeServiceAccount -notlike "*@$ProjectId.iam.gserviceaccount.com") { throw 'Use an approved runtime service account in this project.' }
$deployArgs = @(
  'run', 'deploy', $ServiceName,
  '--project', $ProjectId,
  '--region', $Region,
  '--source', $projectRoot,
  '--service-account', $RuntimeServiceAccount,
  '--allow-unauthenticated',
  '--set-secrets', "GEMINI_API_KEY=${SecretName}:${SecretVersion}",
  '--set-env-vars', "NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$ProjectId,FIRESTORE_DATABASE_ID=$($clientConfig.firestoreDatabaseId),GEMINI_MODEL=$Model",
  '--labels', 'dev-tutorial=cloud-run-ai-challenge',
  '--port', '8080',
  '--min-instances', '0',
  '--max-instances', '3',
  '--concurrency', '20',
  '--timeout', '60',
  '--memory', '512Mi',
  '--cpu', '1'
)
& gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { throw 'Cloud Run deployment failed. No success is claimed.' }
& gcloud run services describe $ServiceName --project $ProjectId --region $Region '--format=yaml(status.url,metadata.labels,spec.template.spec.serviceAccountName)'
if ($LASTEXITCODE -ne 0) { throw 'Service verification failed. Inspect the deployment before sharing a URL.' }
