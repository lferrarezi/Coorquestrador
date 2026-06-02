# Runbook: Speckit

## Objetivo
Usar `speckit` como engine operacional da AI Delivery Squad.

## Fluxo recomendado
1. Comece pelo `squad-orchestrator`.
2. Cole a demanda no prompt `00-run-intake`.
3. Execute somente os agentes indicados na rota.
4. Use validadores antes de aprovar.
5. Registre decisoes em `docs/decisions/`.
6. Mantenha artefatos em `docs/`.

## Regras
- Nao pular HITL em risco alto.
- Nao misturar producao e validacao no mesmo agente.
- Nao implantar sem rollback ou plano de reversao.
- Nao criar codigo sem spec ou assuncoes explicitas.
