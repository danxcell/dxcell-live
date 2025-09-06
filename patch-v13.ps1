
Param(
  [string]$Root = "."
)
Write-Host "Patching JS endpoints under $Root ..."

$targets = @("pulse.js","feeds.js","app.js","alpha-matrix.js")
foreach($name in $targets){
  $file = Join-Path $Root $name
  if(Test-Path $file){
    $txt = Get-Content $file -Raw

    # CoinGecko -> /api
    $txt = $txt -replace 'https?://api\.coingecko\.com/api/v3/coins/([^/]+)/market_chart\?[^"'' ]+', '/api/cg/market_chart?id=$1&vs=usd&days=1&interval=minute'
    $txt = $txt -replace 'https?://api\.coingecko\.com/api/v3/coins/markets\?[^"'' ]+', '/api/cg/top?vs=usd&limit=20'
    $txt = $txt -replace 'https?://api\.coingecko\.com/api/v3/status_updates[^"'' ]*', '/api/status_updates'

    # News -> /api/news
    $txt = $txt -replace 'https?://cryptopanic\.com/api[^"'' ]*', '/api/news?limit=30'
    $txt = $txt -replace '/api/cryptopanic[^"'' ]*', '/api/news?limit=30'

    # Depth -> /api/depth
    $txt = $txt -replace 'https?://api\.binance\.com/api/v3/depth\?symbol=\$\{?([a-zA-Z0-9_]+)\}?[^"'' ]*', '/api/depth?symbol=${$1}&limit=50&levels=25&venue=binance'

    Set-Content $file $txt -Encoding UTF8
    Write-Host "Patched $name"
  }
}
Write-Host "Done. Review diffs before committing."
