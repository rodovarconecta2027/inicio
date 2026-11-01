$ErrorActionPreference = 'Stop'
$rodovarRuleName = 'RODOVAR-Conecta-LAN-3000'
$rodovarResult = Join-Path $PSScriptRoot 'firewall-result.json'
try {
    $existing = Get-NetFirewallRule -Name $rodovarRuleName -ErrorAction SilentlyContinue
    if ($existing) {
        Set-NetFirewallRule -Name $rodovarRuleName -Enabled True -Action Allow -Direction Inbound -Profile Any | Out-Null
        $existing | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -LocalAddress '192.168.100.7' -RemoteAddress LocalSubnet | Out-Null
        $existing | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 3000 | Out-Null
        $existing | Get-NetFirewallApplicationFilter | Set-NetFirewallApplicationFilter -Program 'C:\Program Files\nodejs\node.exe' | Out-Null
    } else {
        New-NetFirewallRule -Name $rodovarRuleName -DisplayName 'RODOVAR CONECTA - Rede Local TCP 3000' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -LocalAddress '192.168.100.7' -RemoteAddress LocalSubnet -Profile Any -Program 'C:\Program Files\nodejs\node.exe' -Enabled True | Out-Null
    }
    @{ok = $true; rule = $rodovarRuleName; address = '192.168.100.7'; remoteAddress = 'LocalSubnet'; port = 3000} | ConvertTo-Json | Set-Content -LiteralPath $rodovarResult -Encoding UTF8
} catch {
    @{ok = $false; error = $_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $rodovarResult -Encoding UTF8
    exit 1
}
