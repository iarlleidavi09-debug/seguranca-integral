# -*- mode: python ; coding: utf-8 -*-
# PyInstaller: executável de console em pasta única (onedir).
# Uso (o build.ps1 faz isto):
#   python -m PyInstaller installer\seguranca.spec --noconfirm --distpath dist --workpath build
# Saída: dist\SegurancaIntegral\SegurancaIntegral.exe e dist\SegurancaIntegral\_internal\
import os

BACKEND = os.path.abspath(os.path.join(SPECPATH, '..', 'backend'))
APP = os.path.join(BACKEND, 'app')

# sem os portais compilados o exe sobe, mas serve 404 em tudo: melhor parar aqui
for portal in ('aluno', 'coordenacao'):
    indice = os.path.join(APP, 'static', portal, 'index.html')
    if not os.path.isfile(indice):
        raise SystemExit(
            'Falta ' + indice + '. Rode antes: npm run build:aluno e npm run build:coord'
        )

# destino "app/...": o app acha os arquivos por Path(__file__).parent,
# que no executável é _internal/app
dados = [
    (os.path.join(APP, 'static'), 'app/static'),
    (os.path.join(APP, 'risk_terms.json'), 'app'),
    (os.path.join(APP, 'questionario.json'), 'app'),
]

a = Analysis(
    [os.path.join(BACKEND, 'entrada.py')],
    pathex=[BACKEND],
    binaries=[],
    datas=dados,
    # gevent e flask têm hooks no pyinstaller-hooks-contrib
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'pytest'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SegurancaIntegral',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='SegurancaIntegral',
)
