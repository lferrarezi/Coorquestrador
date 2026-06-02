# Skill: Quota Estimation

## Objetivo
Estimar o consumo de cota por tarefa e o total da demanda, antes de gastar credito, e comparar com o consumo real ao final.

## Quando usar
- No passo [5] do pipeline, apos `engine-routing`.
- Ao final, para registrar cota real vs estimada.

## Entradas
- Matriz de roteamento (tarefa -> engine, modelo, potencia).
- `config/cost-table.yaml` (unidades, multiplicadores de potencia, tamanhos por classe).
- Classe de tamanho de cada tarefa (da `demand-planning`).

## Formula
Para cada tarefa:

```
unidade = cost-table.models[modelo].unit   # token | acu

se unidade == token:
  tokens_base   = cost-table.task_size_tokens[classe]
  tokens_aj     = tokens_base * power_multiplier[potencia]
  cota_tarefa   = tokens_aj

se unidade == acu:
  acu_base      = cost-table.task_size_acu[classe]
  acu_aj        = acu_base * power_multiplier[potencia]
  cota_tarefa   = acu_aj
```

Cota total = soma das cotas das tarefas. Tarefas paralelas **somam** no consumo (paralelismo afeta tempo, nao consumo).

## Exemplo
Tarefa T1: refactor `large`, claude-code, opus-4.8, potencia high.
- tokens_base (large) = 400.000
- power_multiplier[high] = 3.0 -> tokens_aj = 1.200.000
- cota_tarefa = **1.200.000 tokens**

Tarefa T2: doc `small`, gemini-3.1, low.
- 30.000 * 0.5 = 15.000 tokens
- cota_tarefa = **15.000 tokens**

## Saidas
```markdown
## Estimativa de cota
| tarefa | engine | modelo | potencia | classe | unidade | qtd_ajustada |
|--------|--------|--------|----------|--------|---------|--------------|-------|
| T1 | claude-code | opus-4.8 | high | large | token | 1.200.000 |
| T2 | gemini-cli | gemini-3.1 | low | small | token | 15.000 |

**Total estimado: 1.215.000 tokens**

> Se total >= quota_gate2_threshold => Gate 2 sera exigido na entrega.

## Cota real (preenchida pos-execucao)
| tarefa | cota_estimada | cota_real | desvio |
```

## Regras
- Sempre apresentar estimativa **antes** do Gate 1.
- Sinalizar quando o total cruzar `quota_gate2_threshold`.
- Ao final, registrar cota real (lida do engine quando houver telemetria, senao do uso reportado).
- Desvio relevante (>30%) entre estimado e real -> registrar em `docs/decisions/` para calibrar heuristicas.

## Checklist
- [ ] Unidade correta por modelo (token/acu).
- [ ] Multiplicador de potencia aplicado.
- [ ] Cota por tarefa e total calculadas.
- [ ] Cruzamento com teto do Gate 2 verificado.
- [ ] Cota real registrada pos-execucao.
