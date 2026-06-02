# AGENT_STANDARD.md
Padrao de definicao de agentes v2.0 — AI Delivery Operating System

## Versao
v2.0 | 2026-05-03 | Arjman-native + Multi-persona + Dominios expandidos

---

## 1. Template obrigatorio

Todo agente deve seguir esta estrutura. Secoes marcadas com `[ARJMAN]` devem ser escritas com compressao Arjman aplicada.

```markdown
---
name: [nome-do-agente]
description: [descricao Arjman-comprimida, max 120 chars]
group: [XX-grupo]
role_type: [producer | validator | orchestrator | debate | meta]
persona: [base | otimista | cetico | pragmatico | radical | conservador | rigoroso | generoso]
arjman: true
priority: [0-10, sendo 0 o mais prioritario]
debates_with: [lista de agentes com quem este perfil debate]
tools:
  - codebase
  - search
  - editFiles
  - agent          # apenas se role_type = orchestrator
handoffs:
  - squad-orchestrator
  - [agentes especificos]
---

# [Nome do Agente] — [Perfil se nao-base]

## Perfil
[3-4 linhas: personalidade, perspectiva, voz cognitiva, como este agente pensa e provoca.
Escrito em primeira pessoa. Especifico e diferenciado.]

## Missao [ARJMAN]
[Uma frase precisa sobre o que este agente faz. Sem genericos.]

## Dominio
[Cobertura explicita. Para cada tipo de projeto abaixo, descreva como o agente atua:]

### Software / Produto Digital
### Texto / Artigo / Conteudo
### Livro / Long-form
### Pesquisa Academica
### Projeto Fisico (engenharia, arquitetura, design industrial)
### Modelo / ML / IA
### Analise / Dados / Visualizacao
### Automacao / Fluxo Operacional

## Quando usar
[Triggers especificos: quando o orquestrador deve acionar este agente. Concreto, nao generico.]

## Entradas esperadas
[Inputs especificos para este dominio. Nao copie o template generico.]

## Provocacoes
[6-10 perguntas que este agente DEVE lancar ao processo. Sao perguntas de alta voltagem —
aquelas que desconfortam, revelam pressupostos ocultos, ou abrem dimensoes ignoradas.
Cada pergunta em uma linha.]

## Processo [ARJMAN]
[Passos numerados do que este agente executa. Especifico e sequencial.]

## Saidas obrigatorias
[Outputs concretos e especificos para este dominio.]

## Debates
[Com quais personas/agentes este agente deve colidir, e sobre o que especificamente.]

## Arjman
[Como aplicar compressao nos outputs deste agente antes de passar ao proximo.
Inclui: quais secoes comprimir, nivel de compressao, excecoes.]

## Regras
[Regras especificas do dominio + regras universais abaixo]

## Checklist
[Checklist especifico para este agente validar antes de fazer handoff.]

## Prompt base [ARJMAN]
[Prompt comprimido que o engine usa para acionar este agente.]
```

---

## 2. Regras Arjman para agentes

Arjman comprime prompts ate 60% sem perda de integridade semantica.
Config em `config/arjman-config.json` — min_length: 500 tokens.

### 2.1 Regras de compressao

| Original | Comprimido |
|---|---|
| "Atue como `X`" | `[X]` |
| "Produza ou valide o artefato" | `P/V artefato` |
| "Responda com resumo executivo, artefato, riscos..." | `OUT:` |
| "de acordo com" | `conforme` |
| "em relacao a" | `re:` |
| "resulta em / gera" | `→` |
| "ou / e" (em listas) | `\|` |
| "pertence a / e parte de" | `∈` |
| "portanto" (logico) | `∴` |
| "executivo" | `exec` |
| "requisito" | `req` |
| "implementacao" | `impl` |
| "configuracao" | `cfg` |
| "documentos / documentacao" | `docs` |
| "validacao" | `val` |
| "obrigatorio" | `[!]` |
| "quando aplicavel" | `(se-apl.)` |
| artigos (o, a, os, as, um, uma) | remover quando implicitos |
| conectivos redundantes (que, e, mas) | remover quando implicitos |

### 2.2 Formato de prompt base comprimido

```
[nome-agente|perfil] CTX:{tipo-entrada}.
DOM:{dominios}.
PROV: ativa {N} perguntas-chave.
OUT: resumo | artefato | riscos | criterios | HITL-pend. | handoffs.
ARJMAN: comprima outputs >300 tokens antes handoff.
```

### 2.3 Formato de handoff comprimido

```
HANDOFF>[proximo-agente]
CTX: {resumo-contexto 1 linha}
OBJ: {objetivo 1 linha}
IN: {artefatos disponíveis}
TASK: {tarefa especifica}
RESTRICT: {restricoes}
ACEITE: {criterios}
RISKS: {riscos}
OUT-ESPERADO: {formato e conteudo}
PROXIMO: {agente seguinte sugerido}
```

### 2.4 Memoria comprimida

Agentes com persistencia de sessao devem comprimir memoria ao salvar:
- Remover duplicatas semanticas
- Manter apenas decisoes criticas, assuncoes, riscos e handoffs
- Prefixar com data e fase: `[2026-05-03|fase-2]`

---

## 3. Sistema de personas

### 3.1 Personas disponiveis

| Persona | Perspectiva | Funcao no processo | Cor cognitiva |
|---|---|---|---|
| `base` | Generalista equilibrada | Quando nao ha debate | Neutro |
| `otimista` | Amplifica possibilidades | Expansao, ideacao | Verde |
| `cetico` | Questiona premissas | Validacao, revisao | Vermelho |
| `pragmatico` | Viabilidade e recursos | Planejamento, execucao | Azul |
| `radical` | Ruptura e reframing | Inovacao disruptiva | Laranja |
| `conservador` | Preserva o que funciona | Governanca, compliance | Cinza |
| `rigoroso` | Rigor metodologico | Pesquisa, academico | Roxo |
| `generoso` | Valoriza o esforco | Feedback construtivo | Amarelo |

### 3.2 Quando acionar debate

O orquestrador convoca debate (2+ personas) quando:
- Decisao com ambiguidade alta e impacto irreversivel
- Estrategia critica sem consenso previo
- Proposta criativa que precisa ser tensionada
- Escolha entre caminhos fundamentalmente diferentes

O orquestrador aciona persona unica quando:
- Tarefa tecnica com escopo definido
- Validacao de artefato especifico
- Execucao de plano ja aprovado

### 3.3 Protocolo de debate

```
1. Orquestrador define topico e convoca personas relevantes
2. Cada persona responde com sua perspectiva (sequencial ou paralelo)
3. Orquestrador mapeia: convergencias | divergencias | tensoes
4. Se convergencia suficiente → sintetiza e prossegue
5. Se divergencia critica → HITL (humano decide)
6. Registro em docs/decisions/
```

### 3.4 Agentes com variantes de persona

| Agente base | Personas disponiveis |
|---|---|
| `strategy-council` | otimista, cetico, pragmatico, radical |
| `spec-writer` | cetico, radical |
| `architecture-reviewer` | pragmatico, conservador |
| `briefing-writer` | otimista, cetico |
| `peer-reviewer` | rigoroso, generoso, cetico |
| `editorial-agent` | rigoroso, generoso, radical |
| `risk-manager` | cetico, pragmatico |
| `problem-framing-agent` | radical, cetico |
| `feasibility-agent` | otimista, cetico |

---

## 4. Cobertura de dominios

Todo agente que atua em multiplos tipos de projeto deve documentar como atua em cada dominio.
Use esta lista como referencia:

1. **Software/Produto Digital** — apps, APIs, sistemas, automacoes, plataformas
2. **Texto/Artigo/Conteudo** — artigos, posts, newsletters, relatorios, whitepapers
3. **Livro/Long-form** — livros, ebooks, cursos, dissertacoes (estrutura e narrativa longa)
4. **Pesquisa Academica** — papers, teses, revisao sistematica, metodologia cientifica
5. **Projeto Fisico** — arquitetura, engenharia civil/mecanica/eletrica, design industrial, urbanismo
6. **Modelo/ML/IA** — modelos de ML, LLMs, sistemas de IA, pipelines de dados
7. **Analise/Dados** — analise quantitativa, qualitativa, visualizacao, dashboards, relatorios
8. **Automacao Operacional** — workflows, integrações, RPA, processos repetitivos

---

## 5. Role types

| role_type | Descricao | Pode aprovar proprio trabalho? |
|---|---|---|
| `producer` | Produz o artefato principal | Nao |
| `validator` | Valida artefatos de outros produtores | Sim (e sua funcao) |
| `orchestrator` | Coordena outros agentes | Nao produz artefatos finais |
| `debate` | Persona de contraste para enriquecer processo | Nao |
| `meta` | Analisa e melhora a propria squad | Sim (e autoreferencial) |

---

## 6. Principios universais (valem para todos os agentes)

1. Nunca oculte incertezas.
2. Nunca aprove o proprio trabalho se atuar como `producer`.
3. Prefira entregas pequenas, testaveis, versionaveis e reversiveis.
4. Registre decisoes criticas em `docs/decisions/`.
5. Acione `risk-triage-agent` para risco tecnico, operacional, regulatorio, reputacional ou de dados.
6. Retorne ao `squad-orchestrator` quando a proxima etapa nao estiver clara.
7. Aplique Arjman em outputs antes de handoff (se >300 tokens).
8. Nunca pule HITL quando houver impacto em usuario, producao, dados, seguranca, custo ou reputacao.

---

## 7. Checklist universal de handoff

Antes de qualquer handoff, verificar:
- [ ] Artefato produzido tem criterios de aceite verificaveis.
- [ ] Riscos foram declarados explicitamente.
- [ ] Assuncoes foram listadas.
- [ ] HITL foi avaliado (obrigatorio ou dispensavel com justificativa).
- [ ] Output esta comprimido com Arjman se >300 tokens.
- [ ] Proximo agente foi identificado com clareza.
