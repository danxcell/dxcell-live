powershell -ExecutionPolicy Bypass -Command "
$files = Get-ChildItem -Path . -Filter *.html -File
foreach ($f in $files) {
  $html = Get-Content $f.FullName -Raw

  # Insert DeFi button right AFTER the Wealth button in the same <nav> group
  $patternBtn = '(?<wealth><button\s+class=""nav-btn""\s+data-route=""wealth"".*?</button>)'
  if ($html -match $patternBtn -and $html -notmatch 'data-route=""defi""') {
    $html = [regex]::Replace(
      $html,
      $patternBtn,
      '${wealth}`r`n      <button class=""nav-btn"" data-route=""defi""><span class=""i"">🏦</span><span class=""t"">DeFi</span></button>'
    )
  }

  # Add defi:'defi.html' to the routes object
  $patternRoutes = 'const\s+routes\s*=\s*{\s*([^}]+)\s*}'
  if ($html -match $patternRoutes -and $html -notmatch 'defi\s*:\s*''defi\.html''') {
    $html = [regex]::Replace(
      $html,
      $patternRoutes,
      { param($m)
        $body = $m.Groups[1].Value.Trim()
        'const routes = {' + $body + ', defi:''defi.html'' }'
      }
    )
  }

  Set-Content -Path $f.FullName -Value $html -Encoding utf8
}
Write-Host 'DeFi button + route added where missing.'"
