$base   = "c:\Users\admin\Desktop\all\Leakifyweb\Leakify-music-src"
$jwRoot = "$base\JuiceWrld"
$leaked = "$base\JuiceWrld\LEAKED"

# Step 1 — Remove non-JuiceWrld artist folders from git index
$artists = @("D4vd","Destroy Lonely","EsdeeKid","Ken Carson")
foreach ($a in $artists) {
    $path = "$base\$a"
    if (Test-Path $path) {
        Write-Host "Removing $a from git..." -ForegroundColor Yellow
        git rm -r --cached "$path" 2>&1 | Out-Null
        Remove-Item $path -Recurse -Force
        Write-Host "  Done." -ForegroundColor Green
    }
}

# Step 2 — Identify root track names (normalised)
$rootNames = Get-ChildItem $jwRoot -File |
    ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.Name).Trim().ToLower() }

# Step 3 — Remove LEAKED duplicates (same name as root)
$dupes = Get-ChildItem $leaked -File |
    Where-Object { $rootNames -contains [System.IO.Path]::GetFileNameWithoutExtension($_.Name).Trim().ToLower() }
Write-Host "`nRemoving $($dupes.Count) LEAKED duplicates..." -ForegroundColor Yellow
foreach ($f in $dupes) {
    git rm --cached $f.FullName 2>&1 | Out-Null
    Remove-Item $f.FullName -Force
}
Write-Host "  Done." -ForegroundColor Green

# Step 4 — From remaining unique LEAKED tracks, keep smallest that fit in 48 MB
$uniqueLeaked = Get-ChildItem $leaked -File | Sort-Object Length |
    Where-Object { $rootNames -notcontains [System.IO.Path]::GetFileNameWithoutExtension($_.Name).Trim().ToLower() }

$budgetBytes = 48MB; $sum = 0; $keep = @(); $drop = @()
foreach ($f in $uniqueLeaked) {
    if ($sum + $f.Length -le $budgetBytes) { $keep += $f; $sum += $f.Length }
    else { $drop += $f }
}
Write-Host "`nKeeping $($keep.Count) unique LEAKED tracks ({0:N1} MB)" -f ($sum/1MB) -ForegroundColor Cyan
Write-Host "Removing $($drop.Count) oversized unique LEAKED tracks..." -ForegroundColor Yellow
foreach ($f in $drop) {
    git rm --cached $f.FullName 2>&1 | Out-Null
    Remove-Item $f.FullName -Force
}
Write-Host "  Done." -ForegroundColor Green

# Step 5 — Summary
$rootMB  = (Get-ChildItem $jwRoot -File | Measure-Object -Property Length -Sum).Sum / 1MB
$lkMB    = if (Test-Path $leaked) { (Get-ChildItem $leaked -File | Measure-Object -Property Length -Sum).Sum / 1MB } else { 0 }
$totalMB = $rootMB + $lkMB
Write-Host ("`nFinal: JuiceWrld root {0:N1} MB + LEAKED {1:N1} MB = {2:N1} MB total" -f $rootMB, $lkMB, $totalMB) -ForegroundColor Green
Write-Host "Root tracks: $(( Get-ChildItem $jwRoot -File ).Count)" -ForegroundColor Green
Write-Host "LEAKED tracks: $(if (Test-Path $leaked) { (Get-ChildItem $leaked -File).Count } else { 0 })" -ForegroundColor Green
