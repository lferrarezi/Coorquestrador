# Skill: Demand Planning

## Objetivo
Transformar uma demanda livre em um plano executavel: atividades -> tarefas atomicas -> DAG de dependencias, com classe de tamanho por tarefa (para a estimativa de custo).

## Quando usar
- No passo [1]-[2] do pipeline do Coorquestrador, antes de rotear engines.
- Sempre que uma nova demanda entra ou muda de escopo.

## Processo
1. **Entender o objetivo real** da demanda (resultado esperado, nao a tarefa literal).
2. **Identificar o projeto-alvo** dentro da raiz multiprojetos e carregar seu contexto (constitution, specs, docs).
3. **Quebrar em atividades** (blocos logicos de entrega).
4. **Quebrar atividades em tarefas atomicas**: cada tarefa deve ser executavel por 1 engine, em 1 chamada, com criterio de aceite verificavel.
5. **Classificar cada tarefa** por tamanho: `trivial | small | medium | large | xlarge` (alimenta `cost-table.task_size_*`).
6. **Mapear dependencias** entre tarefas -> montar o DAG (o que e sequencial vs paralelo).
7. **Marcar criticidade** por tarefa (afeta a potencia escolhida no roteamento).
8. **Declarar premissas e riscos**.

## Criterios de uma boa tarefa atomica
- Tem um unico objetivo claro.
- Tem criterio de aceite verificavel (teste, output esperado, arquivo gerado).
- Cabe em uma execucao de um engine.
- E reversivel/versionavel.
- Tem entradas conhecidas (ou premissas explicitas).

## Classes de tamanho (heuristica)
| Classe | Exemplo |
|--------|---------|
| trivial | rename, fix de 1 linha, ajuste de config |
| small | funcao isolada, teste unitario, doc curto |
| medium | feature pequena multi-arquivo |
| large | feature completa, refactor amplo |
| xlarge | modulo inteiro, migracao |

## DAG de dependencias
- Liste cada tarefa com seus predecessores (`depends_on`).
- Tarefas sem predecessor pendente podem rodar em **paralelo** (respeitando `max_parallel`).
- Tarefas com predecessor so iniciam apos o aceite do predecessor.

## Formato de saida
```markdown
## Resumo
<objetivo real + projeto-alvo>

## Atividades
- A1: ...
- A2: ...

## Tarefas (DAG)
| id | atividade | descricao | classe | criticidade | depends_on | criterio_aceite |
|----|-----------|-----------|--------|-------------|------------|-----------------|
| T1 | A1 | ... | medium | alta | - | ... |
| T2 | A1 | ... | small  | baixa | T1 | ... |

## Paralelismo possivel
<grupos de tarefas independentes>

## Premissas
## Riscos
## Proximo handoff
-> engine-routing
```

## Checklist
- [ ] Objetivo real compreendido (nao so a tarefa literal).
- [ ] Projeto-alvo identificado e contexto carregado.
- [ ] Tarefas atomicas com criterio de aceite.
- [ ] Classe de tamanho por tarefa.
- [ ] DAG de dependencias montado.
- [ ] Paralelismo identificado.
- [ ] Premissas e riscos explicitos.
