# Entrega e verificação — Segurança Integral 3.0.0

Verificação local em 16/10/2026, no checkout `feature/v1`. Alterações mantidas no working tree para revisão, sem commits automáticos.

## Resultado

Portal do aluno com oito categorias recolhíveis, 29 opções e 20 perguntas compartilhadas, organizadas em quatro etapas. Seleção múltipla, limpeza de bifurcações ocultas, anonimato padrão, rascunho de 24 horas, revisão, imagens e recuperação de envio sem duplicação. A coordenação usa o catálogo editável para filtros e os rótulos históricos de cada caso para exibição.

Colaboração por SSE com presença temporária, atualização de conversa/estado, revisão de concorrência e preservação de formulários em conflitos. Reiniciar o servidor requer novo login da equipe; o acompanhamento do aluno reconecta com seu código mantido apenas em memória.

Operação LAN com instalador padrão, diagnóstico local e CLI somente leitura (registro da implantação anterior em rede local, 16/10/2026). Consulte [Operação LAN (histórico)](operacao-lan.md) para configuração, backup, recuperação e comandos daquela implantação; o contexto atual é hospedado para uma única escola, sem procedimento documentado ainda.

## Evidência

| Verificação | Resultado |
| --- | --- |
| Backend consolidado | 943 testes passaram em 1013,75 s; saída 0. |
| CLI após ajustes finais de timeout/protocolo | 40 testes passaram, incluindo gotejamento de cabeçalhos/corpo e resposta SSH. A suíte consolidada havia sido iniciada antes desses ajustes isolados; os demais módulos permaneceram sem alterações. |
| Frontend consolidado após último ajuste | 251 testes aluno + 167 coordenação = 418; saída 0. |
| TypeScript e builds | Dois builds Vite com `tsc --noEmit`, seguidos de PyInstaller e Inno Setup; saída 0. |
| Contraste | 534 medições, zero falhas. |
| Chrome, interface | 375/768/1280 px, claro e escuro, 60 capturas; fonte local, teclado/foco, ausência de overflow e violações CSP. Giro real de imagem 32×20 para 20×32. |
| Chrome, recuperação | Perguntas indisponíveis, timeout, confirmação perdida após commit sem duplicação e fallback apenas após confirmação explícita. |
| HTTP, tempo real | Sete verificações: invalidação mínima, isolamento entre casos, atualização em 303 ms, CAS409, presença consolidada, mensagens simultâneas, privacidade das notas e revogação de sessão. |
| Chrome, colaboração | Duas sessões de coordenação e um aluno; conflito com texto/foco preservados, mensagens, queda/reinício real, reconexão, novo login da equipe, resolução, melhorou, recorrência e revisão. Recaptura após o último ajuste confirmou ausência do aviso falso. |
| Executável gerado | Sete verificações isoladas; monitor real com Ctrl+C encerrou somente o monitor e o servidor continuou saudável. |
| Verificação independente do executável | `--status --json` saudável nos dois portais; pasta ausente retornou 1 sem criar arquivos. PE e produto versão 3.0.0. |
| Revisão independente | Disposição `ship` no escopo código/interface, sem achados materiais residuais. Seis avisos visuais do detector foram avaliados como sinais semânticos não bloqueantes. |

Comandos principais usados:

```powershell
# backend, com pasta temporária de testes
backend\.venv\Scripts\python.exe -m pytest -q --basetemp=PASTA_TEMPORARIA --tb=short

# dentro de frontend
npm.cmd test
npm.cmd run contraste
npm.cmd run build:aluno
npm.cmd run build:coord

# pacote: testes executados separadamente e registrados
powershell -NoProfile -ExecutionPolicy Bypass -File installer\build.ps1 -SemTestes
```

Logs e capturas locais estão em `.superpowers/sdd/2026-10-16-v3-lan/`: `final-backend.log`, `final-frontend-reviewed.log`, relatórios/revisões das fases, resultados HTTP/Chrome, `task-2-capturas` e `task-5-capturas`. Essa pasta também contém a prévia com dados fictícios e não faz parte do pacote.

## Artefatos

- `dist/SegurancaIntegral-Setup-LAN.exe`: instalador LAN, 15.607.570 bytes.
- `dist/SegurancaIntegral/`: executável e dependências, mantendo a pasta completa.
- `dist/SHA256SUMS-v3.txt`: hashes dos artefatos.

SHA256:

```text
9FDD6AF1C1CBA38A7F736EF1E08AA12BAE02274364E5CBC6C5418D2E46B008F6  SegurancaIntegral.exe
3DE47DC908B1DBE8B0C1A77019EDE7AE45629E6EC5831CE2E311739C94C9A96C  SegurancaIntegral-Setup-LAN.exe
```

## Limites da verificação

Os servidores e relatos de teste usaram somente dados fictícios em loopback. O instalador foi gerado, mas não executado; instalação/atualização em máquina limpa e acesso a partir de outro aparelho na LAN não foram testados. Nenhum helper de instalação, regra de firewall, tarefa agendada ou configuração do roteador foi aplicado nesta máquina.
