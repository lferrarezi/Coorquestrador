# AGENTS.md
v2.0 | 2026-05-03

## Missao
Transformar ideias em aplicacoes, textos, artigos, livros, pesquisas, produtos, modelos, analises, projetos fisicos e automacoes — com qualidade, governanca, rastreabilidade e economia de tokens (Arjman).

## Entrada obrigatoria
Toda demanda nova deve iniciar com o agente `squad-orchestrator`.

Arquivo principal:
```text
00-squad-orchestrator.agent.md
```

## Padrao de agentes
Todos os agentes seguem o template definido em:
```text
AGENT_STANDARD.md
```
Inclui: Perfil, Missao, Dominio (8 tipos), Provocacoes, Processo, Debates, Arjman, Checklist, Prompt base comprimido.

## Papel do orquestrador
1. Entender o que sera feito — objetivo real, nao declarado.
2. Classificar a demanda — dominio, tipo de entrega, maturidade da ideia.
3. Definir a rota de trabalho — agentes em sequencia, nao todos ao mesmo tempo.
4. Decidir: debate de personas necessario ou agente unico suficiente?
5. Acionar os agentes adequados — com handoffs comprimidos (Arjman).
6. Separar produtor, validador e decisor humano.
7. Declarar artefatos esperados por fase.
8. Declarar gates HITL obrigatorios.
9. Manter rastreabilidade entre ideia, artefatos, execucao e aprendizado.

## Dominios cobertos
1. Software / Produto Digital
2. Texto / Artigo / Conteudo
3. Livro / Long-form
4. Pesquisa Academica
5. Projeto Fisico (engenharia, arquitetura, design industrial)
6. Modelo / ML / IA
7. Analise / Dados / Visualizacao
8. Automacao Operacional

## Sistema de personas
Agentes-chave tem variantes de persona (arquivos separados, gerenciados pelo orquestrador):
- `strategy-council-otimista` | `strategy-council-cetico` | `strategy-council-pragmatico` | `strategy-council-radical`
- Outras personas: ver AGENT_STANDARD.md secao 3.

O orquestrador convoca debate (2+ personas) em decisoes com ambiguidade alta e impacto irreversivel.

## Arjman (economia de tokens)
Todos os agentes aplicam compressao Arjman em:
- Handoffs (formato HANDOFF> comprimido)
- Outputs intermediarios >300 tokens
- Memoria entre sessoes

Config: `config/arjman-config.json` | Regras: `AGENT_STANDARD.md` secao 2.

## Principios
1. Um agente produtor nunca aprova o proprio trabalho.
2. Decisoes criticas devem gerar registro em `docs/decisions/`.
3. Nenhum artefato avanca sem criterios de aceite verificaveis.
4. Toda entrega com risco real deve ter ponto HITL explicito.
5. Toda implantacao deve ter rollback ou reversao.
6. Todo uso de dados deve declarar classificacao, ownership, contrato, qualidade e retencao.
7. Toda solucao com IA deve ter avaliacao, guardrails, observabilidade e modo de falha seguro.
8. Arjman e obrigatorio em outputs >300 tokens antes de handoff.
9. Nenhum agente e acionado sem handoff estruturado do orquestrador.
10. A squad avalia sua propria performance (grupo 22) e se autoevolui.

## Agentes-chave novos (v2.0)
- `discovery-agent` — para ideias vagas/embrionarias (grupo 02)
- `feasibility-agent` — analise de viabilidade multidimensional (grupo 02)
- `budget-controller` — monitoramento orcamentario ativo (grupo 21)
- `agent-roster-agent` — composicao da squad: contratar/reconfigurar/aposentar (grupo 22)
- `strategy-council-*` — 4 personas de debate estrategico (grupo 02)

## Formato de resposta dos agentes
1. Status (o que foi produzido).
2. Artefatos alterados ou propostos.
3. Riscos e mitigacoes.
4. Criterios de aceite.
5. Pendencias HITL.
6. Proximos handoffs (formato comprimido Arjman).

## Catalogo
Total de agentes: ~230 | Ver SQUAD_REGISTRY.md para lista completa.
