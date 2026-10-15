# Registra (ou remove) a tarefa agendada que sobe o Seguranca Integral.
#
# Uso (como Administrador):
#   tarefas.ps1 -Exe "C:\Program Files\SegurancaIntegral\SegurancaIntegral.exe" [-DataDir PASTA] [-Iniciar]
#   tarefas.ps1 -Remover
# -Simular mostra o que seria feito sem registrar nada (roda sem admin).
#
# A tarefa roda como SYSTEM na inicializacao do Windows, sem limite de tempo,
# e e reiniciada em caso de falha (a cada 1 minuto, ate 3 vezes). Um segundo
# gatilho repete a cada 5 minutos: se o processo cair, volta sozinho
# (MultipleInstances IgnoreNew impede uma segunda copia rodando).
# Rodar de novo substitui a tarefa existente.
# Arquivo so com ASCII: o PowerShell 5.1 le UTF-8 sem BOM como ANSI.
[CmdletBinding()]
param(
    [string]$Exe,
    [string]$DataDir = 'C:\ProgramData\SegurancaIntegral',
    [switch]$Remover,
    [switch]$Iniciar,
    [switch]$Simular
)

$ErrorActionPreference = 'Stop'
$NomeTarefa = 'SegurancaIntegral'
$Descricao = 'Portais do aluno (127.0.0.1:3000) e da coordenacao (127.0.0.1:4000).'

function Escrever([string]$Texto) {
    Write-Output $Texto
}

function Remover-Tarefa {
    $existente = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    if ($null -eq $existente) {
        return $false
    }
    # encerra o processo iniciado pela tarefa antes de apagar o registro
    Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
    return $true
}

try {
    if ($Simular) {
        Escrever 'SIMULACAO: nada sera registrado nem removido.'
    }

    if ($Remover) {
        Escrever "Remover tarefa: $NomeTarefa"
        if (-not $Simular) {
            if (Remover-Tarefa) {
                Escrever 'Tarefa removida.'
            } else {
                Escrever 'Tarefa nao existia.'
            }
        }
        exit 0
    }

    if ([string]::IsNullOrWhiteSpace($Exe)) {
        throw 'Informe -Exe com o caminho do SegurancaIntegral.exe.'
    }
    if (-not $Simular -and -not (Test-Path -LiteralPath $Exe -PathType Leaf)) {
        throw "Executavel nao encontrado: $Exe"
    }

    # sem barra final: "C:\pasta\" escaparia a aspa de fechamento
    $pasta = $DataDir.TrimEnd('\')
    $argumentos = '--data-dir "' + $pasta + '"'
    $trabalho = Split-Path -Parent $Exe

    $acao = New-ScheduledTaskAction -Execute $Exe -Argument $argumentos -WorkingDirectory $trabalho
    $inicio = New-ScheduledTaskTrigger -AtStartup
    $vigia = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) `
        -RepetitionInterval (New-TimeSpan -Minutes 5)
    # SID do SYSTEM: o nome muda com o idioma do Windows ("SISTEMA" em pt-BR)
    $sidSystem = 'S-1-5-18'
    $principal = New-ScheduledTaskPrincipal -UserId $sidSystem -LogonType ServiceAccount -RunLevel Highest
    $ajustes = New-ScheduledTaskSettingsSet `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -DontStopOnIdleEnd

    Escrever "Tarefa: $NomeTarefa"
    Escrever "Executavel: $Exe"
    Escrever "Argumentos: $argumentos"
    Escrever "Pasta de trabalho: $trabalho"
    Escrever "Usuario: $sidSystem (SYSTEM, aqui '$($principal.UserId)'), LogonType: $($principal.LogonType), RunLevel: $($principal.RunLevel)"
    Escrever 'Gatilho: AtStartup'
    Escrever "Gatilho: repetir a cada $($vigia.Repetition.Interval)"
    Escrever "RestartCount: $($ajustes.RestartCount)"
    Escrever "RestartInterval: $($ajustes.RestartInterval)"
    Escrever "ExecutionTimeLimit: $($ajustes.ExecutionTimeLimit)"
    Escrever "MultipleInstances: $($ajustes.MultipleInstances)"
    if ($Iniciar) { Escrever 'Iniciar agora: sim' } else { Escrever 'Iniciar agora: nao' }

    if ($Simular) {
        exit 0
    }

    if (Remover-Tarefa) {
        Escrever 'Tarefa anterior substituida.'
    }
    $tarefa = New-ScheduledTask -Action $acao -Trigger @($inicio, $vigia) -Principal $principal `
        -Settings $ajustes -Description $Descricao
    Register-ScheduledTask -TaskName $NomeTarefa -InputObject $tarefa | Out-Null
    Escrever 'Tarefa registrada.'

    if ($Iniciar) {
        Start-ScheduledTask -TaskName $NomeTarefa
        Escrever 'Tarefa iniciada.'
    }
    exit 0
} catch {
    [Console]::Error.WriteLine("ERRO: $($_.Exception.Message)")
    exit 1
}
