$ErrorActionPreference = "SilentlyContinue"

$inputText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputText)) {
  $inputText = "{}"
}

$payload = $inputText | ConvertFrom-Json
$projectId = "$($payload.project_id)"
$databaseName = "$($payload.firestore_database_name)"
$topicName = "$($payload.request_topic_name)"

$firestoreExists = $false
$topicExists = $false

if (-not [string]::IsNullOrWhiteSpace($projectId) -and -not [string]::IsNullOrWhiteSpace($databaseName)) {
  gcloud firestore databases describe $databaseName --project $projectId --format "value(name)" *> $null
  if ($LASTEXITCODE -eq 0) {
    $firestoreExists = $true
  }
}

if (-not [string]::IsNullOrWhiteSpace($projectId) -and -not [string]::IsNullOrWhiteSpace($topicName)) {
  gcloud pubsub topics describe $topicName --project $projectId --format "value(name)" *> $null
  if ($LASTEXITCODE -eq 0) {
    $topicExists = $true
  }
}

@{
  firestore_exists = $firestoreExists.ToString().ToLowerInvariant()
  topic_exists     = $topicExists.ToString().ToLowerInvariant()
} | ConvertTo-Json -Compress
