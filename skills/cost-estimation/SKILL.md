# Skill: Cost Estimation

## Objetivo
Estimar o custo de execucao por tarefa e o total da demanda, antes de gastar credito, e comparar com o custo real ao final.

## Quando usar
- No passo [5] do pipeline, apos `engine-routing`.
- Ao final, para registrar custo real vs estimado.

## Entradas
- Matriz de roteamento (tarefa -> engine, modelo, potencia).
- `config/cost-table.yaml` (precos, multiplicadores de potencia, tamanhos por classe).
- Classe de tamanho de cada tarefa (da `demand-planning`).

## Formula
Para cada tarefa:

```
unidade = cost-table.models[modelo].unit   # token | acu

se unidade == token:
  tokens_base   = cost-table.task_size_tokens[classe]
  tokens_aj     = tokens_base * power_multiplier[potencia]
  preco_milhao  = cost-table.models[modelo].price_per_million
  custo_tarefa  = (tokens_aj / 1_000_000) * preco_milhao

se unidade == acu:
  acu_base      = cost-table.task_size_acu[classe]
  acu_aj        = acu_base * power_multiplier[potencia]
  preco_acu     = cost-table.models[modelo].price_per_acu
  custo_tarefa  = acu_aj * preco_acu
```

Custo total = soma dos custos das tarefas. Tarefas paralelas **somam** no custo (paralelismo afeta tempo, nao custo).

## Exemplo
Tarefa T1: refactor `large`, claude-code, opus-4.8, potencia high.
- tokens_base (large) = 400.000
- power_multiplier[high] = 3.0 -> tokens_aj = 1.200.000
- price_per_million (opus-4.8) = 18.00
- custo_tarefa = (1.200.000 / 1.000.000) * 18.00 = **USD 21.60**

Tarefa T2: doc `small`, gemini-3.1, low.
- 30.000 * 0.5 = 15.000 tokens
- (15.000/1.000.000) * 2.00 = **USD 0.03**

## Saidas
```markdown
## Estimativa de custo
| tarefa | engine | modelo | potencia | classe | unidade | qtd_ajustada | custo |
|--------|--------|--------|----------|--------|---------|--------------|-------|
| T1 | claude-code | opus-4.8 | high | large | token | 1.200.000 | 21.60 |
| T2 | gemini-cli | gemini-3.1 | low | small | token | 15.000 | 0.03 |

**Total estimado: USD 21.63**

> Se total >= cost_gate2_threshold => Gate 2 sera exigido na entrega.

## Custo real (preenchido pos-execucao)
| tarefa | custo_estimado | custo_real | desvio |
```

## Regras
- Sempre apresentar estimativa **antes** do Gate 1.
- Sinalizar quando o total cruzar `cost_gate2_threshold`.
- Ao final, registrar custo real (lido do engine quando houver `credit_probe`, senao do uso reportado).
- Desvio relevante (>30%) entre estimado e real -> registrar em `docs/decisions/` para calibrar heuristicas.

## Checklist
- [ ] Unidade correta por modelo (token/acu).
- [ ] Multiplicador de potencia aplicado.
- [ ] Custo por tarefa e total calculados.
- [ ] Cruzamento com teto do Gate 2 verificado.
- [ ] Custo real registrado pos-execucao.
