# ASCII para Windows PowerShell 5.1. Atualizacao explicita, sem mudar perfil de rede.
[CmdletBinding()]
param([switch]$AbrirCoordenacao)
$ErrorActionPreference = 'Stop'

function Atualizar-Rede {
    param([string]$PastaPrograma, [string]$DataDir, [string]$SaidaEnderecos)
    $nome = 'SegurancaIntegral'
    $null = Get-ScheduledTask -TaskName $nome -ErrorAction Stop
    & (Join-Path $PastaPrograma 'lan.ps1') -DataDir $DataDir -SaidaEnderecos $SaidaEnderecos -ExigirRede
    $config = Get-Content -LiteralPath (Join-Path $DataDir 'config.json') -Raw | ConvertFrom-Json
    Stop-ScheduledTask -TaskName $nome -ErrorAction Stop
    for ($i = 0; $i -lt 20; $i++) {
        if ((Get-ScheduledTask -TaskName $nome -ErrorAction Stop).State -ne 'Running') { break }
        Start-Sleep -Milliseconds 500
    }
    if ((Get-ScheduledTask -TaskName $nome -ErrorAction Stop).State -eq 'Running') {
        throw 'O servidor nao encerrou. Tente novamente antes de compartilhar o endereco.'
    }
    Start-ScheduledTask -TaskName $nome -ErrorAction Stop
    foreach ($portal in @(@{nome='aluno';porta=$config.student_port}, @{nome='coordenacao';porta=$config.coord_port})) {
        $ok = $false
        for ($i = 0; $i -lt 15; $i++) {
            try {
                $estado = Invoke-RestMethod -Uri "http://127.0.0.1:$($portal.porta)/api/servidor" -TimeoutSec 2
                $ok = ($estado.produto -eq 'seguranca-integral' -and $estado.versao -eq '3.1.0' -and $estado.portal -eq $portal.nome -and $estado.banco.ok -eq $true)
            } catch { $ok = $false }
            if ($ok) { break }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ok) { throw "Portal $($portal.nome) nao confirmou funcionamento local na porta $($portal.porta)." }
    }
    return [int]$config.coord_port
}

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidade)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try {
        $argumentos = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
        if ($AbrirCoordenacao) { $argumentos += ' -AbrirCoordenacao' }
        $elevado = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList $argumentos -PassThru -Wait
        exit $elevado.ExitCode
    } catch {
        $mensagem = New-Object -ComObject WScript.Shell
        $null = $mensagem.Popup('A atualizacao da rede precisa da permissao de administrador. Nenhuma atualizacao foi confirmada.', 0, 'TETRA-GUARD', 48)
        exit 1
    }
}

$dados = Join-Path $env:ProgramData 'SegurancaIntegral'
$saida = Join-Path $PSScriptRoot 'Enderecos-da-rede.txt'
try {
    $porta = Atualizar-Rede -PastaPrograma $PSScriptRoot -DataDir $dados -SaidaEnderecos $saida
    [IO.File]::AppendAllText($saida, [Environment]::NewLine + 'VERIFICACAO: os dois portais responderam neste notebook. Teste o endereco acima no celular; o teste local nao comprova acesso entre aparelhos.' + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    Invoke-Item -LiteralPath $saida
    if ($AbrirCoordenacao) { Start-Process "http://127.0.0.1:$porta" }
} catch {
    $mensagem = New-Object -ComObject WScript.Shell
    $null = $mensagem.Popup(('Nao foi possivel confirmar a atualizacao: ' + $_.Exception.Message + [Environment]::NewLine + 'Nao compartilhe enderecos antigos. Confira a conexao e tente novamente.'), 0, 'TETRA-GUARD', 16)
    exit 1
}
