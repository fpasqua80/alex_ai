\
<#
Vercel Infra Setup (PowerShell)
- Links project
- Sets env vars (interactive)
- Notes for Vercel Postgres + Cron
#>

param(
  [switch]$Preview
)

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $name. Install it and re-run."
  }
}

Require-Cmd vercel

Write-Host "== Vercel: login status ==" -ForegroundColor Cyan
vercel whoami | Out-Host

Write-Host "== Linking project (creates .vercel/ metadata) ==" -ForegroundColor Cyan
vercel link

Write-Host "== Setting environment variables ==" -ForegroundColor Cyan
Write-Host "You will be prompted for values. Leave blank to skip a variable."

$envNames = @(
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "EMBEDDINGS_MODEL",
  "EMBEDDING_DIM",
  "RESEARCH_TARGET_URL"
)

foreach ($n in $envNames) {
  $val = Read-Host "Value for $n"
  if ($val -ne "") {
    $targets = @("production")
    if ($Preview) { $targets = @("preview") }
    foreach ($t in $targets) {
      # vercel env add <name> <target>
      $tmp = New-TemporaryFile
      Set-Content -Path $tmp -Value $val -NoNewline
      vercel env add $n $t < $tmp
      Remove-Item $tmp -Force
    }
  }
}

Write-Host "== Deploying ==" -ForegroundColor Cyan
if ($Preview) {
  vercel deploy
} else {
  vercel deploy --prod
}

Write-Host "Done. Verify Cron in Vercel Dashboard (Project -> Cron Jobs)." -ForegroundColor Green
