# SQUAD.md

## Visao
AI Delivery Operating System para conduzir ideias ate entrega, publicacao, implantacao ou aprendizado validado.

## Entrada operacional
O `squad-orchestrator` e o agente inicial obrigatorio. Ele entende a demanda e orquestra a entrada dos demais agentes conforme tipo de entrega, fase, risco e artefatos existentes.

## Catalogo
Total de agentes nesta configuracao: 220 + entrada destacada.

Agente inicial destacado:

```text
.github/agents/00-squad-orchestrator.agent.md
```

## Fases
| Ordem | Fase | Objetivo | Gate |
|---:|---|---|---|
| 0 | Intake pelo orquestrador | Entender a demanda, classificar e definir rota de agentes | Rota aprovada |
| 1 | Brainstorm | Gerar opcoes, riscos e teses | Direcao escolhida |
| 2 | Briefing | Consolidar problema, publico, objetivos e sucesso | Briefing aprovado |
| 3 | Constitution | Definir principios, limites e governanca | Constitution aprovada |
| 4 | Spec | Detalhar requisitos e criterios | Spec aprovada |
| 5 | Plano | Definir execucao, arquitetura, dados e riscos | Plano aprovado |
| 6 | HITL | Mapear decisoes humanas obrigatorias | HITL aprovado |
| 7 | Backlog | Criar epicos, historias e tasks | Backlog pronto |
| 8 | Desenvolvimento ou escrita | Produzir entrega | PR ou draft pronto |
| 9 | Validacao | Revisar qualidade e aderencia | Evidencias aprovadas |
| 10 | Homologacao | Validar com negocio/usuarios | Sign-off |
| 11 | Implantacao/Publicacao | Colocar em producao ou publicar | Go-live |
| 12 | Pos-implantacao | Medir, aprender e evoluir | PIR concluido |

## Principio operacional
```text
Orquestrar antes de produzir.
Validar antes de aprovar.
Aprovar antes de implantar.
Aprender antes de escalar.
```
