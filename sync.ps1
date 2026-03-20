param(
  # Source of truth (editable)
  [string]$AppPath = ".\\app.jsx",

  # Runnable file (contains the inlined <script type=""text/babel"">)
  [string]$IndexPath = ".\\index.html",

  # Reverse direction: extract <script type=""text/babel""> back into app.jsx
  [switch]$FromIndex,

  # Don't write files; just print what would happen
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Read-FileRaw([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "File not found: $path"
  }
  return Get-Content -LiteralPath $path -Raw
}

function Write-Utf8([string]$path, [string]$content) {
  if ($DryRun) {
    Write-Host "[DryRun] Would write: $path" -ForegroundColor Yellow
    return
  }
  Set-Content -LiteralPath $path -Value $content -Encoding UTF8
}

function Backup-File([string]$path) {
  $dir = Split-Path -Parent $path
  $name = Split-Path -Leaf $path
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $bak = Join-Path $dir "$name.bak.$ts"
  if ($DryRun) {
    Write-Host "[DryRun] Would backup: $path -> $bak" -ForegroundColor Yellow
    return $bak
  }
  Copy-Item -LiteralPath $path -Destination $bak -Force
  return $bak
}

$pattern = '(?is)<script\s+type=("|\x27)text/babel\1\s*>\s*(?<code>.*?)\s*</script>'

if ($FromIndex) {
  $index = Read-FileRaw $IndexPath
  $m = [regex]::Match($index, $pattern)
  if (-not $m.Success) {
    throw "Cannot find <script type=""text/babel""> block in $IndexPath"
  }
  $code = $m.Groups["code"].Value.Trim()
  Write-Host "Extracted $($code.Length) chars from $IndexPath" -ForegroundColor Green
  Write-Utf8 $AppPath ($code + "`r`n")
  Write-Host "Wrote: $AppPath" -ForegroundColor Green
  exit 0
}

$app = Read-FileRaw $AppPath
$index = Read-FileRaw $IndexPath

$m = [regex]::Match($index, $pattern)
if (-not $m.Success) {
  throw "Cannot find <script type=""text/babel""> block in $IndexPath"
}

if ($app -match '\\\\r\\\\n') {
  Write-Host "Warning: app.jsx contains literal \\r\\n sequences. This can break Babel parsing." -ForegroundColor Yellow
}

$bak = Backup-File $IndexPath

$codeGroup = $m.Groups["code"]
$before = $index.Substring(0, $codeGroup.Index)
$after = $index.Substring($codeGroup.Index + $codeGroup.Length)

$newIndex = $before + "`r`n" + $app.Trim() + "`r`n" + $after
Write-Utf8 $IndexPath $newIndex

Write-Host "Updated: $IndexPath" -ForegroundColor Green
Write-Host "Backup:  $bak" -ForegroundColor DarkGray

