# Instala o Setup nesta maquina e abre os dois portais na LAN (so para teste).
# Rode num PowerShell COMO ADMINISTRADOR:
#   powershell -NoProfile -ExecutionPolicy Bypass -File installer\instalar-lan-teste.ps1
# Faz: instala em silencio, grava config.json com host 0.0.0.0 e os IPs da
# maquina em allowed_hosts, abre as portas 3000 e 4000 no Firewall (perfis
# Privado e Dominio) e sobe a tarefa. Desfazer: desinstalar o programa e
# Remove-NetFirewallRule -DisplayName 'SegurancaIntegral LAN teste'.
# Arquivo so com ASCII: o PowerShell 5.1 le UTF-8 sem BOM como ANSI.
$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
$Setup = Join-Path $Raiz 'dist\SegurancaIntegral-Setup.exe'
$Dados = 'C:\ProgramData\SegurancaIntegral'

$ips = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { $_.IPAddress })
if ($ips.Count -eq 0) { throw 'Nenhum IPv4 de LAN encontrado.' }

# config.json antes do Setup: com ele presente o instalador pula a pagina de
# enderecos (que exige nomes de dominio) e nunca o sobrescreve
New-Item -ItemType Directory -Force -Path $Dados | Out-Null
$hosts = ($ips + '127.0.0.1' + 'localhost' | ForEach-Object { '"' + $_ + '"' }) -join ','
$cfg = '{"host":"0.0.0.0","student_port":3000,"coord_port":4000,"allowed_hosts":[' + $hosts + ']}'
[IO.File]::WriteAllText("$Dados\config.json", $cfg, (New-Object Text.UTF8Encoding($false)))

$p = Start-Process -FilePath $Setup -Wait -PassThru -ArgumentList @(
    '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ('/LOG="' + (Join-Path $Raiz 'dist\inno.log') + '"'))
if ($p.ExitCode -ne 0) { throw "Setup saiu com codigo $($p.ExitCode)" }

& schtasks.exe /End /TN SegurancaIntegral | Out-Null

New-NetFirewallRule -DisplayName 'SegurancaIntegral LAN teste' -Direction Inbound -Protocol TCP `
    -LocalPort 3000, 4000 -Profile Private, Domain -Action Allow | Out-Null
& schtasks.exe /Run /TN SegurancaIntegral | Out-Null

Write-Host 'Pronto. Aluno e coordenacao em:'
foreach ($ip in $ips) { Write-Host "  http://${ip}:3000   http://${ip}:4000" }
Write-Host 'Primeiro acesso: abra http://127.0.0.1:4000 NESTA maquina para criar a conta de administrador.'
Write-Host '(pela rede a tela so orienta; a criacao so e aceita no proprio servidor)'
