param(
    [Parameter(Mandatory)][ValidateSet('volc.bigasr.sauc.duration','volc.seedasr.sauc.duration')][string]$ResourceId,
    [ValidateRange(1,10)][int]$Count = 3,
    [switch]$UseEnvKey,
    [switch]$TestHotwords,
    [switch]$SaveConfig
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$route = (& "$PSScriptRoot/Check-ClashRoute.ps1") | ConvertFrom-Json
if ($route.Mode -ne 'rule' -or -not $route.TunEnabled -or -not ($route.Rules | Where-Object { $_.payload -eq 'openspeech.bytedance.com' -and $_.proxy -eq 'DIRECT' })) {
    throw 'Clash rule/TUN/DIRECT preflight failed; refusing live test'
}
Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$pcm = [IO.MemoryStream]::new()
try {
    $synth.SelectVoice('Microsoft Huihui Desktop')
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.SetOutputToAudioStream($pcm, $format)
    $synth.Speak('今天测试语音输入。请保留数字一二三四五。')
    $audio = $pcm.ToArray()
} finally { $synth.Dispose(); $pcm.Dispose() }
$results = @()
for ($test = 1; $test -le $Count; $test++) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $projectRoot 'src-tauri/target/debug/examples/asr_probe.exe'
    $start.Arguments = "--resource $ResourceId --pcm-stdin"
    if ($UseEnvKey) { $start.Arguments += ' --env-key' }
    if ($TestHotwords) { $start.Arguments += ' --test-hotwords' }
    if ($SaveConfig -and $test -eq $Count) { $start.Arguments += ' --save-config' }
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.StandardOutputEncoding = [Text.Encoding]::UTF8
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'Probe did not start' }
        $output = $process.StandardOutput.ReadToEndAsync()
        $process.StandardInput.BaseStream.Write($audio,0,$audio.Length)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(35000)) { $process.Kill(); throw 'Probe exceeded 35-second budget' }
        if ($process.ExitCode -ne 0) { throw "Probe failed: $($output.Result)" }
        $results += ($output.Result | ConvertFrom-Json)
    } finally { $process.Dispose() }
}
$results | ConvertTo-Json -Depth 5
# Audio was synthetic and never written to a file. Check routing logs after the run.
