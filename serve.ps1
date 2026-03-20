param(
  [int]$Port = 5173,
  [string]$Root = (Get-Location).Path
)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.jsx'  = 'text/plain; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.txt'  = 'text/plain; charset=utf-8'
}

function Get-ContentType([string]$path) {
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($mime.ContainsKey($ext)) { return $mime[$ext] }
  return 'application/octet-stream'
}

# Prefer dual-stack listener if supported (IPv6 + IPv4).
$listener = $null
try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Any, $Port)
  try { $listener.Server.DualMode = $true } catch {}
  $listener.Start()
} catch {
  $listener = $null
}

if (-not $listener) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
  try {
    $listener.Start()
  } catch {
    Write-Host "Failed to bind on port $Port" -ForegroundColor Red
    Write-Host "Try a different port: powershell -ExecutionPolicy Bypass -File .\\serve.ps1 -Port 8080" -ForegroundColor Yellow
    throw
  }
}

Write-Host "Serving $Root" -ForegroundColor Green
Write-Host "Open: http://localhost:$Port/" -ForegroundColor Green
Write-Host "If localhost fails, try: http://127.0.0.1:$Port/ or http://[::1]:$Port/" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()

    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)

    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) {
      $client.Close()
      continue
    }

    # Drain headers
    while ($true) {
      $line = $reader.ReadLine()
      if ($line -eq $null -or $line -eq '') { break }
    }

    $parts = $requestLine.Split(' ')
    $method = $parts[0]
    $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { '/' }

    if ($method -ne 'GET') {
      $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
      $headers = "HTTP/1.1 405 Method Not Allowed`r`nConnection: close`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $client.Close()
      continue
    }

    # Strip query string
    $pathOnly = $rawPath.Split('?')[0]
    if ([string]::IsNullOrWhiteSpace($pathOnly) -or $pathOnly -eq '/') { $pathOnly = '/index.html' }

    $relative = $pathOnly.TrimStart('/') -replace '/', '\\'
    $filePath = Join-Path $Root $relative

    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
      $headers = "HTTP/1.1 404 Not Found`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $client.Close()
      continue
    }

    $data = [System.IO.File]::ReadAllBytes($filePath)
    $ct = Get-ContentType $filePath

    $headers = "HTTP/1.1 200 OK`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`nContent-Type: $ct`r`nContent-Length: $($data.Length)`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($data, 0, $data.Length)
    $client.Close()
  } catch {
    try { if ($client) { $client.Close() } } catch {}
  }
}
