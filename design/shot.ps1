# design/shot.ps1 <name> : render design/<name>.html at 390x844 to design/<name>.png (render-check rules: unique profile, cleanup)
param([string]$name)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$html = (Join-Path $here ($name + ".html")) -replace '\\','/'
$wrap = Join-Path $here ("wrap-" + $name + ".html")
Set-Content -Path $wrap -Encoding UTF8 -Value ('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#777}iframe{display:block;border:0;width:390px;height:844px}</style></head><body><iframe src="file:///' + $html + '"></iframe></body></html>')
$png = Join-Path $here ($name + ".png")
$udd = Join-Path $env:TEMP ("rcheck_" + [guid]::NewGuid().ToString("N").Substring(0,8))
Start-Process -FilePath $chrome -NoNewWindow -Wait -ArgumentList @("--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars","--user-data-dir=$udd","--force-device-scale-factor=2","--virtual-time-budget=6000","--run-all-compositor-stages-before-draw","--window-size=410,864","--screenshot=$png",("file:///" + ($wrap -replace '\\','/')))
if (Test-Path $udd) { Remove-Item $udd -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $png) { "OK $png" } else { "FAILED $png" }

