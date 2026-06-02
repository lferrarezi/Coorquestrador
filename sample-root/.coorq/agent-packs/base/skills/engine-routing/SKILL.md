# Skill: Engine Routing

## Objetivo
Para cada tarefa do plano, escolher **engine + modelo + potencia**, respeitando capacidade (disponibilidade + credito), adequacao, custo, criticidade e localidade.

## Quando usar
- No passo [3]-[4] do pipeline, apos `demand-planning` e o probe de engines.

## Entradas
- Lista de tarefas (com classe e criticidade) da `demand-planning`.
- Snapshot do probe: para cada engine, estado (`disponivel|sem-credito|offline|nao-autenticado`) e credito restante.
- `config/engines.yaml` (best_for, models, powers, location).

## Ordem de decisao (funil)
1. **Capacidade (filtro duro)**: descarta engines que nao estao `disponivel` ou cujo credito < `min_credit_threshold`.
2. **Adequacao**: cruzar o tipo da tarefa com `best_for` do engine.
   - Tarefa agentica longa / end-to-end -> `devin-cli`, `claude-code`, `codex`.
   - Spec-driven / SDD estruturado -> `kiro`, `claude-code`.
   - Edicao inline / fix pequeno -> `github-copilot-cli`, `codex`.
   - Contexto enorme / analise / docs -> `gemini-cli`.
3. **Custo-beneficio**: entre os adequados, preferir o de menor custo estimado que ainda atinge o nivel de qualidade exigido pela criticidade.
4. **Potencia**: escalar conforme criticidade x complexidade:
   - trivial/baixa -> `low`
   - small/normal -> `normal`
   - medium/alta -> `medium`
   - large-xlarge/critica -> `high`
   - Nunca `high` em tarefa trivial.
5. **Localidade**: respeitar `location/host` designado ao projeto/tarefa.

## Modelo por engine
- Escolher o modelo dentro de `engines.<engine>.models` que melhor casa com a potencia/criticidade.
- Critica + orcamento ok -> modelo top (opus-4.8, gpt-5.5, gemini-3.5).
- Rotina/barato -> modelo economico (sonnet-4.6, gpt-5.3, gemini-3.1).

## Regras
- Nunca rotear para engine fora do snapshot mais recente.
- Se nenhum engine adequado tiver capacidade -> marcar tarefa `bloqueada` e escalar (nao forcar engine inadequado).
- Empate de custo -> preferir engine local sobre servidor (menor latencia/risco).
- Registrar a justificativa de cada escolha (entra em `docs/decisions/` se critica).

## Formato de saida
```markdown
## Matriz de roteamento
| tarefa | engine | modelo | potencia | local | justificativa | alternativa |
|--------|--------|--------|----------|-------|---------------|-------------|
| T1 | claude-code | opus-4.8 | high | local | refactor repo-wide critico | codex/gpt-5.5 |
| T2 | gemini-cli | gemini-3.1 | low | local | doc curto, barato | - |

## Tarefas bloqueadas (sem engine)
| tarefa | motivo |

## Proximo handoff
-> cost-estimation
```

## Checklist
- [ ] Snapshot de probe usado (capacidade real).
- [ ] Adequacao tarefa x engine avaliada.
- [ ] Custo-beneficio considerado.
- [ ] Potencia proporcional a criticidade.
- [ ] Localidade respeitada.
- [ ] Justificativa + alternativa por tarefa.
- [ ] Bloqueios escalados.
