# Copilot Instructions

## Entrada obrigatoria
Toda nova demanda deve iniciar no `squad-orchestrator`.

## Operating model
- Primeiro entender e classificar.
- Depois rotear agentes.
- Depois produzir artefatos.
- Depois validar.
- Depois acionar HITL.
- Depois executar.

## Regras
- Nao acione todos os agentes simultaneamente.
- Nao avance sem criterios de aceite.
- Nao use o mesmo agente para produzir e aprovar.
- Registre decisoes criticas em `docs/decisions/`.
- Consulte `AGENTS.md`, `SQUAD.md`, `HITL_GATES.md` e `ENGINE_ROUTING.md`.
