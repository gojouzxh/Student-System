param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 24 is required. Install it from https://nodejs.org/ and run this launcher again."
}

Set-Location $root
$env:PORT = [string]$Port
$serverJob = Start-Job -ArgumentList $root, $Port -ScriptBlock {
  param($ProjectRoot, $ServerPort)
  Set-Location $ProjectRoot
  $env:PORT = [string]$ServerPort
  npm start
}

try {
  $url = "http://127.0.0.1:$Port"
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($serverJob.State -ne "Running") {
      Receive-Job -Job $serverJob
      throw "The application server stopped before it became ready."
    }
    try {
      $health = Invoke-RestMethod -Uri "$url/api/v1/health" -TimeoutSec 1
      if ($health.status -eq "ok") {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $ready) {
    throw "The application server did not become ready at $url."
  }

  Start-Process "$url/"
  Write-Host "Coursework is running at $url. Press Ctrl+C to stop it."
  while ($serverJob.State -eq "Running") {
    Receive-Job -Job $serverJob -Wait -AutoRemoveJob
  }
} finally {
  if ($serverJob -and $serverJob.State -eq "Running") {
    Stop-Job -Job $serverJob
  }
  if ($serverJob) {
    Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
  }
}
