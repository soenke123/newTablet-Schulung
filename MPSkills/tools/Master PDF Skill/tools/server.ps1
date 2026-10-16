# Small local web server for Master PDF Skill (development only).
# Serves the project folder on http://localhost:<port>/ and opens the browser.
# Needs only Windows PowerShell 5.1, no Node.js. PDFs are never sent here:
# the app reads them in the browser; this server only delivers the app files.
param([int]$Port = 5173, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.wasm' = 'application/wasm'
  '.pdf'  = 'application/pdf'
  '.bcmap' = 'application/octet-stream'
  '.pfb'  = 'application/octet-stream'
  '.ttf'  = 'font/ttf'
  '.woff2' = 'font/woff2'
  '.icc'  = 'application/vnd.iccprofile'
}

# Find a free port, starting at $Port.
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  $candidate = New-Object System.Net.HttpListener
  $candidate.Prefixes.Add("http://localhost:$p/")
  try { $candidate.Start(); $listener = $candidate; $Port = $p; break } catch { $candidate.Close() }
}
if (-not $listener) { Write-Host 'Kein freier Port gefunden.'; Read-Host 'Enter zum Beenden'; exit 1 }

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host '  Master PDF Skill laeuft:' $url
Write-Host '  Dieses Fenster offen lassen. Schliessen beendet die App.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    # Only files inside the project folder; never node_modules or hidden folders.
    $inside = $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
    $blocked = $rel -match '(^|[\\/])(node_modules|\.[^\\/]+)([\\/]|$)'
    if ($inside -and -not $blocked -and [IO.File]::Exists($full)) {
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    try { $res.Close() } catch {}
  }
}
