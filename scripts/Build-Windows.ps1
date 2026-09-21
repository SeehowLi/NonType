param(
    [switch]$CheckEnvironment,
    [switch]$SkipChecks,
    [switch]$Release
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# Only change this process's environment; do not overwrite the user's PATH.
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath (Join-Path $cargoBin 'cargo.exe')) {
    $env:PATH = "$cargoBin;$env:PATH"
}
$missing = [System.Collections.Generic.List[string]]::new()
foreach ($tool in @('cargo', 'rustc', 'npm.cmd', 'cmake')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { $missing.Add($tool) }
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = $null
if (Test-Path -LiteralPath $vswhere) {
    $vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vsPath -or -not (Test-Path -LiteralPath (Join-Path $vsPath 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll'))) {
        # Some installations are marked incomplete despite usable compiler files.
        $vsPath = & $vswhere -all -products '*' -property installationPath |
            Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll') } |
            Select-Object -First 1
    }
}
if (-not $vsPath) { $missing.Add('Visual Studio C++ x64/x86 tools and Windows SDK') }
if ($missing.Count -gt 0) {
    Write-Host ('Missing: ' + ($missing -join ', '))
    Write-Host 'Install Visual Studio 2022 Build Tools with Desktop development with C++, then rerun this script.'
    exit 1
}

$devShell = Join-Path $vsPath 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll'
Import-Module $devShell
Enter-VsDevShell -VsInstallPath $vsPath -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw 'MSVC cl.exe is missing.' }
if (-not $env:WindowsSdkDir) { throw 'Windows SDK was not initialized.' }
if (-not (Get-Command rc.exe -ErrorAction SilentlyContinue)) { throw 'Windows SDK resource compiler is missing.' }
# The machine-wide CMake 4.0.1 crashed configuring Opus; use VS's native CMake.
$vsCmake = Join-Path $vsPath 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
if (Test-Path -LiteralPath $vsCmake) { $env:CMAKE = $vsCmake }

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

Invoke-Checked cargo @('--version')
Invoke-Checked rustc @('--version')
Write-Host "Visual Studio: $vsPath"
Write-Host "Windows SDK: $env:WindowsSDKVersion"
if ($CheckEnvironment) { exit 0 }

# Keep one target directory; avoid a second release build until needed.
if (-not (Test-Path -LiteralPath 'node_modules/.bin/tauri.cmd')) {
    Invoke-Checked npm.cmd @('ci', '--no-audit', '--no-fund')
}
if (-not $SkipChecks) {
    Invoke-Checked cargo @('fmt', '--check', '--manifest-path', 'src-tauri/Cargo.toml')
    Invoke-Checked cargo @('clippy', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--', '-D', 'warnings')
    Invoke-Checked cargo @('test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml')
    Invoke-Checked npm.cmd @('run', 'lint')
    Invoke-Checked npm.cmd @('test')
}
$buildArguments = @('run', 'tauri', '--', 'build', '--no-bundle')
if (-not $Release) { $buildArguments += '--debug' }
Invoke-Checked npm.cmd $buildArguments
Write-Host 'Desktop build completed. This does not validate live ASR or text insertion.'
