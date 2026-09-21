param([switch]$Reload)
$ErrorActionPreference = 'Stop'

function Invoke-Mihomo([string]$Method, [string]$Api, [string]$Body = '') {
    $pipe = [IO.Pipes.NamedPipeClientStream]::new('.', 'verge-mihomo', [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::Asynchronous)
    try {
        $pipe.Connect(3000)
        $request = "$Method $Api HTTP/1.1`r`nHost: localhost`r`nConnection: close`r`nContent-Type: application/json`r`nContent-Length: $([Text.Encoding]::UTF8.GetByteCount($Body))`r`n`r`n$Body"
        $bytes = [Text.Encoding]::UTF8.GetBytes($request)
        $pipe.Write($bytes, 0, $bytes.Length)
        $reader = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8)
        $read = $reader.ReadToEndAsync()
        if (-not $read.Wait(10000)) { throw 'Mihomo response timed out' }
        $raw = $read.Result
        $split = $raw.IndexOf("`r`n`r`n")
        if ($split -lt 0) { throw 'Invalid Mihomo response' }
        $header = $raw.Substring(0, $split)
        if ($header -notmatch '^HTTP/1.1 2\d\d') { throw $header.Split("`r`n")[0] }
        $data = [Text.Encoding]::UTF8.GetBytes($raw.Substring($split + 4))
        if ($header -match '(?i)Transfer-Encoding: chunked') {
            $stream = [IO.MemoryStream]::new()
            try {
                $offset = 0
                while ($offset -lt $data.Length) {
                    $end = $offset
                    while ($end + 1 -lt $data.Length -and -not ($data[$end] -eq 13 -and $data[$end + 1] -eq 10)) { $end++ }
                    if ($end + 1 -ge $data.Length) { throw 'Truncated chunk header' }
                    $length = [Convert]::ToInt32([Text.Encoding]::ASCII.GetString($data, $offset, $end - $offset).Split(';')[0], 16)
                    if ($length -eq 0) { break }
                    $offset = $end + 2
                    if ($length -lt 0 -or $offset + $length + 2 -gt $data.Length) { throw 'Truncated chunk body' }
                    $stream.Write($data, $offset, $length)
                    $offset += $length + 2
                }
                $data = $stream.ToArray()
            } finally { $stream.Dispose() }
        }
        if ($data.Length) { [Text.Encoding]::UTF8.GetString($data) | ConvertFrom-Json }
    } finally { $pipe.Dispose() }
}

if ($Reload) {
    $configPath = Join-Path $env:APPDATA 'io.github.clash-verge-rev.clash-verge-rev\clash-verge.yaml'
    Invoke-Mihomo PUT '/configs?force=true' (@{path = $configPath} | ConvertTo-Json -Compress) | Out-Null
}
$config = Invoke-Mihomo GET '/configs'
$rules = Invoke-Mihomo GET '/rules'
$connections = Invoke-Mihomo GET '/connections'
$hostPattern = '^(openspeech\.bytedance\.com|ark\.cn-beijing\.volces\.com|docs\.volcengine\.com)$'
[pscustomobject]@{
    Mode = $config.mode
    MixedPort = $config.'mixed-port'
    TunEnabled = $config.tun.enable
    Rules = @($rules.rules | Where-Object { $_.payload -match 'opentypeless' -or $_.payload -match $hostPattern } | Select-Object type,payload,proxy)
    Connections = @($connections.connections | Where-Object { $_.metadata.processPath -match '\\opentypeless\\' -or $_.metadata.host -match $hostPattern } | Select-Object rule,rulePayload,chains,@{n='process';e={$_.metadata.process}},@{n='host';e={$_.metadata.host}})
} | ConvertTo-Json -Depth 6
