# daidoko flyers - headless launcher (subscription auth, fresh context per run)
# Invoked by Windows Task Scheduler: daidoko-flyers, weekly on Friday 20:00.
# Stop:  Unregister-ScheduledTask -TaskName 'daidoko-flyers' -Confirm:$false
# Steps: 1) python fetch_flyers.py downloads this weekend's flyers from tokubai into work/flyers/latest
#        2) claude -p (sonnet) reads the images, writes data/flyers.json, commits and pushes (Pages deploy)
# RULES: keep this file ASCII-only. Japanese prompt lives in flyers-prompt.txt (UTF-8).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$base       = 'C:\Users\kanedomi\Desktop\Claude\daidoko'
$log        = Join-Path $base 'scripts\flyers.log'
$promptFile = Join-Path $base 'scripts\flyers-prompt.txt'
Set-Location $base

$prompt = Get-Content -Raw -Encoding UTF8 $promptFile

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') START ====" | Out-File -FilePath $log -Append -Encoding utf8
$ErrorActionPreference = 'Continue'
& python (Join-Path $base 'scripts\fetch_flyers.py') 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"fetch exit=$LASTEXITCODE" | Out-File -FilePath $log -Append -Encoding utf8
# EAP=Continue around the claude call: PS 5.1 wraps native stderr as ErrorRecords
# under 2>&1, which EAP=Stop turns fatal. $null| closes stdin (skips the 3s wait).
$null | & claude -p $prompt --model sonnet --permission-mode acceptEdits `
  --allowedTools 'Read' 'Write' 'Bash(git:*)' `
  --output-format text 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
$claudeExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') END (exit=$claudeExit) ====" | Out-File -FilePath $log -Append -Encoding utf8
