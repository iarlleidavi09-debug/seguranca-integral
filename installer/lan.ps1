# Configura a instalacao "so LAN" (sem tunel): config.json, firewall e lista de enderecos.
# Chamado pelo instalador (SegurancaIntegral-Setup-LAN.exe) e na desinstalacao com -Remover.
# Arquivo so com ASCII: o PowerShell 5.1 le UTF-8 sem BOM como ANSI. Os textos com
# acento saem de U('...\uXXXX...').
[CmdletBinding()]
param(
    [string]$DataDir,
    [string]$SaidaEnderecos,
    [switch]$Remover,
    [switch]$SemFirewall
)
$ErrorActionPreference = 'Stop'
$RegraNova = 'SegurancaIntegral LAN'
$RegraAntiga = 'SegurancaIntegral LAN teste'

function U([string]$texto) { [regex]::Unescape($texto) }

function Remover-Regras {
    foreach ($nome in @($RegraNova, $RegraAntiga)) {
        Get-NetFirewallRule -DisplayName $nome -ErrorAction SilentlyContinue |
            Remove-NetFirewallRule -ErrorAction SilentlyContinue
    }
}

if ($Remover) { Remover-Regras; exit 0 }
if (-not $DataDir -or -not $SaidaEnderecos) { throw 'Informe -DataDir e -SaidaEnderecos.' }

# enderecos IPv4 da rede: so adaptadores ligados; os virtuais (VM, VPN, WSL) ficam
# em allowed_hosts para acesso, mas nao entram na lista para os alunos
$adaptadores = @{}
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } |
    ForEach-Object { $adaptadores[[int]$_.ifIndex] = $_ }
$todos = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $adaptadores.ContainsKey([int]$_.InterfaceIndex) })
$fisicos = @($todos | Where-Object {
    $d = $adaptadores[[int]$_.InterfaceIndex].InterfaceDescription
    $d -notmatch 'Virtual|VMware|Hyper-V|TAP|Loopback|VPN|WSL|Bluetooth'
} | ForEach-Object { $_.IPAddress } | Select-Object -Unique)
$ips = @($todos | ForEach-Object { $_.IPAddress } | Select-Object -Unique)
$nome = $env:COMPUTERNAME.ToLower()

# config.json: preserva o que ja existe (limites, portas) e atualiza host e enderecos
$arquivo = Join-Path $DataDir 'config.json'
$atual = [ordered]@{}
if (Test-Path $arquivo) {
    $texto = [IO.File]::ReadAllText($arquivo)
    if ($texto.Trim()) {
        $obj = $texto | ConvertFrom-Json
        foreach ($p in $obj.PSObject.Properties) { $atual[$p.Name] = $p.Value }
    }
    Copy-Item $arquivo "$arquivo.bak" -Force
}
$hosts = New-Object System.Collections.Generic.List[string]
foreach ($h in @($atual['allowed_hosts']) + $ips + @($nome, 'localhost', '127.0.0.1')) {
    if ($h -and -not $hosts.Contains([string]$h)) { $hosts.Add([string]$h) }
}
$atual['host'] = '0.0.0.0'
if (-not $atual.Contains('student_port')) { $atual['student_port'] = 3000 }
if (-not $atual.Contains('coord_port')) { $atual['coord_port'] = 4000 }
$atual['allowed_hosts'] = @($hosts)
$json = $atual | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($arquivo, $json, (New-Object Text.UTF8Encoding($false)))
$pAluno = [int]$atual['student_port']
$pCoord = [int]$atual['coord_port']

# firewall: so redes Privada e de Dominio (nunca Publica)
if (-not $SemFirewall) {
    Remover-Regras
    New-NetFirewallRule -DisplayName $RegraNova -Direction Inbound -Protocol TCP -LocalPort $pAluno, $pCoord `
        -Profile Private, Domain -Action Allow | Out-Null
}

# lista de enderecos para mostrar ao final e guardar
$enderecoIp = if ($fisicos.Count -gt 0) { $fisicos } else { $ips }
$linhas = New-Object System.Collections.Generic.List[string]
$linhas.Add((U 'Seguran\u00e7a Integral - endere\u00e7os na rede da escola'))
$linhas.Add('')
$linhas.Add((U 'Portal do ALUNO (compartilhe este endere\u00e7o com os alunos):'))
foreach ($ip in $enderecoIp) { $linhas.Add("  http://${ip}:$pAluno") }
$linhas.Add("  http://${nome}:$pAluno   " + (U '(pelo nome do computador, se a rede resolver nomes)'))
$linhas.Add('')
$linhas.Add((U 'Portal da COORDENA\u00c7\u00c3O (s\u00f3 para a equipe):'))
foreach ($ip in $enderecoIp) { $linhas.Add("  http://${ip}:$pCoord") }
$linhas.Add("  http://${nome}:$pCoord")
$linhas.Add('')
$linhas.Add((U 'Neste computador: http://127.0.0.1:') + $pCoord + (U ' (coordena\u00e7\u00e3o) e http://127.0.0.1:') + $pAluno + ' (aluno).')
$linhas.Add('')
$linhas.Add((U 'IMPORTANTE'))
$linhas.Add((U '- Este computador precisa ficar ligado e na mesma rede dos alunos.'))
$linhas.Add((U '- O endere\u00e7o por n\u00famero (IP) muda se o roteador der outro n\u00famero. Pe\u00e7a ao respons\u00e1vel pela rede para reservar um IP fixo para este computador.'))
$linhas.Add((U '- O acesso \u00e9 liberado no firewall s\u00f3 nas redes classificadas como Privada ou de Dom\u00ednio.'))
$publicas = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
if ($publicas.Count -gt 0) {
    $linhas.Add('')
    $linhas.Add((U 'ATEN\u00c7\u00c3O: a rede atual est\u00e1 classificada como P\u00fablica (') + (($publicas | ForEach-Object { $_.Name }) -join ', ') + (U '). Nela o acesso fica bloqueado. Em Configura\u00e7\u00f5es > Rede, mude para Privada.'))
}
$linhas.Add((U '- A conex\u00e3o \u00e9 HTTP (sem criptografia), pr\u00f3pria para rede local interna. N\u00e3o publique estas portas na internet.'))
[IO.File]::WriteAllLines($SaidaEnderecos, $linhas, (New-Object Text.UTF8Encoding($true)))
exit 0
