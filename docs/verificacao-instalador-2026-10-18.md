# Instalador LAN regenerado em 18/10/2026

Gerado a partir do código local atual pelo installer/build.ps1, mantendo a versão 3.0.0. PyInstaller e Inno Setup concluíram com saída 0.

## Validação

- Backend: 1060 testes aprovados.
- Portal do aluno: 281 testes aprovados.
- Coordenação: 209 testes aprovados.
- Corrigido seletor desatualizado em frontend/src/coord/mapa/AppMapa.test.tsx: nome acessível do ambiente inclui tipo e contagem de casos. Apenas o teste mudou.
- Builds TypeScript/Vite dos dois portais aprovados.
- 16 arquivos web e três arquivos JSON do pacote conferidos por SHA-256 contra as fontes.
- Executável iniciado com base temporária em loopback: dois portais HTTP 200, versão 3.0.0 e banco disponível nos dois diagnósticos. Processo encerrado após a verificação.
- Não foi realizada instalação no Windows; validada a compilação do Setup e a execução do programa empacotado.

## Entrega

Arquivo: dist/SegurancaIntegral-Setup-LAN.exe
Tamanho: 15662667 bytes
SHA-256: 6791E61B40B52629482476D4A6B1BCF11FE69B07C4B8C7AC8B67A8F9E7B4212F
Checksums atualizados: dist/SegurancaIntegral-Setup-LAN.sha256 e dist/SHA256SUMS-v3.txt.
O Setup sem LAN no nome é um artefato antigo; a entrega desta rodada é o Setup-LAN.