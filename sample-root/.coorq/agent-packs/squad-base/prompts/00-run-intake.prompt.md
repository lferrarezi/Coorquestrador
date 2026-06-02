---
description: 00 run intake pelo squad orchestrator
mode: agent
---

# 00-run-intake

## Objetivo

Iniciar qualquer demanda pelo `squad-orchestrator`, o agente inicial obrigatorio da squad.

## Instrucao

Use o agente `squad-orchestrator` para entender o que sera feito e orquestrar a entrada dos demais agentes.

O orquestrador deve primeiro produzir:

1. Diagnostico da demanda.
2. Classificacao do tipo de entrega.
3. Rota recomendada de agentes.
4. Agentes acionados agora.
5. Agentes que entram depois.
6. Artefatos esperados.
7. Gates HITL.
8. Handoff para o primeiro agente especialista.

## Entrada

```text
<cole aqui a ideia, problema, app, produto, artigo, texto, automacao, tarefa ou iniciativa>
```

## Restricoes

- Nao implemente codigo nesta etapa.
- Nao escreva artefato final nesta etapa.
- Nao acione todos os agentes ao mesmo tempo.
- Nao pule validadores ou gates HITL.

## Formato de saida

```markdown
## Diagnostico

## Rota recomendada

## Agentes acionados agora

## Agentes que entram depois

## Artefatos que serao criados

## Gates HITL

## Handoff para o proximo agente

## Proximo comando sugerido
```
