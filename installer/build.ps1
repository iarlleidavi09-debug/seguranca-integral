# Gera o executavel (PyInstaller) e o instalador (Inno Setup 6.3 ou mais novo).
#
# Uso, a partir de qualquer pasta:
#   powershell -NoProfile -ExecutionPolicy Bypass -File installer\build.ps1 [-SemTestes]
#
# Passos, parando no primeiro erro:
#   1. frontend: npm ci, npm run build:aluno, npm run build:coord
#   2. backend: suite completa do pytest (pule com -SemTestes)
#   3. PyInstaller -> dist\SegurancaIntegral\SegurancaIntegral.exe
#   4. Inno Setup  -> dist\SegurancaIntegral-Setup.exe (pulado se o ISCC.exe nao existir)
# Requer backend\.venv com requirements-dev.txt instalado.
# Arquivo so com ASCII: o PowerShell 5.1 le UTF-8 sem BOM como ANSI.
[CmdletBinding()]
param(
    [switch]$SemTestes
)

$ErrorActionPreference = 'Stop'

$Raiz = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Raiz 'frontend'
$Backend = Join-Path $Raiz 'backend'
$Python = Join-Path $Backend '.venv\Scripts\python.exe'
$Dist = Join-Path $Raiz 'dist'
$Trabalho = Join-Path $Raiz 'build'
$Spec = Join-Path $PSScriptRoot 'seguranca.spec'
$Iss = Join-Path $PSScriptRoot 'instalador.iss'

# $ErrorActionPreference nao pega codigo de saida de programa nativo no
# PowerShell 5.1: cada chamada passa por aqui e falha se o codigo nao for 0
function Invoke-Passo {
    param(
        [Parameter(Mandatory = $true)][string]$Titulo,
        [Parameter(Mandatory = $true)][string]$Pasta,
        [Parameter(Mandatory = $true)][string]$Programa,
        [string[]]$Argumentos = @()
    )
    Write-Host ''
    Write-Host "==> $Titulo" -ForegroundColor Cyan
    Push-Location -LiteralPath $Pasta
    try {
        & $Programa @Argumentos
        if ($LASTEXITCODE -ne 0) {
            throw "Falhou: $Titulo (codigo de saida $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
}

function Find-Iscc {
    $comando = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
    if ($null -ne $comando) {
        return $comando.Source
    }
    $candidatos = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    )
    foreach ($caminho in $candidatos) {
        if ($caminho -and (Test-Path -LiteralPath $caminho -PathType Leaf)) {
            return $caminho
        }
    }
    return $null
}

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "Nao achei $Python. Crie o venv e instale backend\requirements-dev.txt."
}

# npm.cmd e nao npm: a politica de execucao pode bloquear o npm.ps1
Invoke-Passo -Titulo 'npm ci' -Pasta $Frontend -Programa 'npm.cmd' -Argumentos @('ci')
Invoke-Passo -Titulo 'build do portal do aluno' -Pasta $Frontend -Programa 'npm.cmd' -Argumentos @('run', 'build:aluno')
Invoke-Passo -Titulo 'build do portal da coordenacao' -Pasta $Frontend -Programa 'npm.cmd' -Argumentos @('run', 'build:coord')

if ($SemTestes) {
    Write-Host ''
    Write-Host '==> testes do backend PULADOS (-SemTestes)' -ForegroundColor Yellow
} else {
    Invoke-Passo -Titulo 'testes do backend (pytest)' -Pasta $Backend -Programa $Python -Argumentos @('-m', 'pytest', '-q')
}

Invoke-Passo -Titulo 'PyInstaller' -Pasta $Raiz -Programa $Python -Argumentos @(
    '-m', 'PyInstaller', $Spec, '--noconfirm', '--clean',
    '--distpath', $Dist, '--workpath', $Trabalho
)

$Exe = Join-Path $Dist 'SegurancaIntegral\SegurancaIntegral.exe'
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) {
    throw "PyInstaller terminou sem gerar $Exe"
}

$Iscc = Find-Iscc
$Setup = Join-Path $Dist 'SegurancaIntegral-Setup.exe'
if ($null -eq $Iscc) {
    Write-Host ''
    Write-Host '==> Inno Setup PULADO: ISCC.exe nao encontrado.' -ForegroundColor Yellow
    Write-Host '    Instale o Inno Setup 6.3 ou mais novo (https://jrsoftware.org/isdl.php)'
    Write-Host '    e rode este script de novo para gerar o instalador.'
    $Setup = $null
} else {
    Invoke-Passo -Titulo 'Inno Setup' -Pasta $PSScriptRoot -Programa $Iscc -Argumentos @($Iss)
    if (-not (Test-Path -LiteralPath $Setup -PathType Leaf)) {
        throw "Inno Setup terminou sem gerar $Setup"
    }
}

Write-Host ''
Write-Host 'Pronto.' -ForegroundColor Green
Write-Host "Executavel: $Exe"
if ($null -ne $Setup) {
    Write-Host "Instalador: $Setup"
}
