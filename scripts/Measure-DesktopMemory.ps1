param([string]$ExecutablePath = (Join-Path $PSScriptRoot '../src-tauri/target/debug/nontype.exe'))
$ErrorActionPreference = 'Stop'
$expected = [IO.Path]::GetFullPath($ExecutablePath)
$all = @(Get-CimInstance Win32_Process)
$roots = @($all | Where-Object { $_.ExecutablePath -eq $expected })
if (-not $roots.Count) { throw 'Desktop app is not running' }
$ids = [Collections.Generic.HashSet[int]]::new()
foreach ($root in $roots) { [void]$ids.Add([int]$root.ProcessId) }
do {
    $previous = $ids.Count
    foreach ($process in $all) {
        if ($ids.Contains([int]$process.ParentProcessId)) { [void]$ids.Add([int]$process.ProcessId) }
    }
} while ($ids.Count -ne $previous)
$rows = @(foreach ($id in $ids) {
    $process = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($process) { [pscustomobject]@{ name=$process.ProcessName; working_set_bytes=$process.WorkingSet64; private_bytes=$process.PrivateMemorySize64 } }
})
[pscustomobject]@{ time=(Get-Date -Format o); processes=$rows.Count; working_set_mb=[math]::Round(($rows | Measure-Object working_set_bytes -Sum).Sum/1MB,2); private_mb=[math]::Round(($rows | Measure-Object private_bytes -Sum).Sum/1MB,2); details=$rows } | ConvertTo-Json -Depth 4
