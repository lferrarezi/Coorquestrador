# Coorquestrador (VSCode)

Meta-orquestrador de runtime: planeja demandas, escolhe engines de IA (CLI),
estima consumo de cota, executa com gates HITL e acompanha o projeto aberto no VS Code.

Veja o README da raiz do projeto para arquitetura, instalação e uso.

## Comandos

- **Coorquestrador: Probe de engines** — disponibilidade + crédito por CLI.
- **Coorquestrador: Planejar demanda** — análise + roteamento + cota estimada.
- **Coorquestrador: Executar plano aprovado** — Gate 1 (HITL) e execução por DAG.
- **Coorquestrador: Lista de demandas** — status e cota estimada vs real.

Logs de execução são gravados em `.coorq/logs/<demanda>/<tarefa>.log`.
A view **Tarefas (por projeto)** expande demandas em etapas; tarefas com log podem ser abertas diretamente pelo menu de contexto ou clique no item.

> Build de teste **0.1.3**.

## Versionamento

- Minor impar: pre-release (`0.1.x`, `0.3.x`).
- Minor par: release final (`0.2.x`, `0.4.x`).
- Correcoes menores incrementam patch dentro da mesma trilha.

## Release local

- `npm test` compila e roda testes de core.
- `npm run bundle` gera `dist/extension.js` empacotado via esbuild.
- `npm run release:check` valida versao, compila, testa, gera bundle, empacota VSIX temporario e valida o zip.
