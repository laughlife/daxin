# 需在管理员 PowerShell 中执行；只放行网站的私有局域网预览。
$ErrorActionPreference = 'Stop'
Start-Transcript -Path (Join-Path $PSScriptRoot '../tmp/legacy-preview/lan-firewall.log') -Force | Out-Null
$nodePath = (Get-Command node.exe).Source
$tcpBlocks = Get-NetFirewallApplicationFilter |
    Where-Object { $_.Program -ieq $nodePath } |
    Get-NetFirewallRule |
    Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' -and $_.Enabled -eq 'True' -and $_.Profile -eq 'Private' }

foreach ($rule in $tcpBlocks) {
    $port = $rule | Get-NetFirewallPortFilter
    if ($port.Protocol -eq 'TCP' -and $port.LocalPort -eq 'Any') {
        # 保留原阻止规则，仅为 TCP 3002 留出例外。
        $port | Set-NetFirewallPortFilter -LocalPort @('1-3001', '3003-65535') -ErrorAction Stop
    }
}

$name = 'Daxin-LAN-Preview-3002'
$existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if (!$existing) {
    New-NetFirewallRule -Name $name -DisplayName '大信网站局域网预览 TCP 3002' `
        -Direction Inbound -Action Allow -Enabled True -Profile Private `
        -Program $nodePath -Protocol TCP -LocalPort 3002 `
        -LocalAddress 192.168.100.242 -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
}
Write-Output '私有局域网 TCP 3002 预览规则已配置。'
Stop-Transcript | Out-Null
