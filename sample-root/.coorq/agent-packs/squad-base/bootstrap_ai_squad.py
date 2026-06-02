from pathlib import Path
import json
import os

ROOT = Path.cwd()

AGENTS_BY_GROUP = {
    "01-orchestration": {
        "domain": "orquestracao, contexto, decisoes, gates, risco e memoria operacional",
        "agents": [
            "context-librarian", "decision-recorder", "memory-curator", "quality-gate-controller",
            "risk-triage-agent", "squad-orchestrator", "workflow-router"
        ],
    },
    "02-brainstorm-strategy": {
        "domain": "brainstorming, estrategia, inovacao, teses, oportunidades e premissas",
        "agents": [
            "assumption-mapper", "business-case-agent", "competitive-intelligence-agent",
            "customer-advocate", "futurist-agent", "innovation-scout", "opportunity-mapper",
            "problem-framing-agent", "skeptic-red-team", "strategy-council"
        ],
    },
    "03-briefing": {
        "domain": "briefing, escopo, stakeholders, metricas e alinhamento executivo",
        "agents": [
            "briefing-validator", "briefing-writer", "clarification-agent", "executive-summary-writer",
            "problem-solution-fit-agent", "scope-boundary-agent", "stakeholder-mapper", "success-metrics-agent"
        ],
    },
    "04-constitution-governance": {
        "domain": "constitution, governanca, principios, politicas, etica, privacidade e auditabilidade",
        "agents": [
            "auditability-agent", "compliance-reviewer", "constitution-architect", "definition-of-done-agent",
            "definition-of-ready-agent", "ethics-reviewer", "governance-validator", "policy-as-code-agent",
            "privacy-reviewer", "security-governance-agent"
        ],
    },
    "05-specification": {
        "domain": "especificacao funcional, requisitos, jornadas, personas, criterios e casos limite",
        "agents": [
            "acceptance-criteria-agent", "accessibility-agent", "edge-case-agent", "journey-mapper",
            "localization-agent", "non-functional-requirements-agent", "persona-agent", "requirements-engineer",
            "spec-reviewer", "spec-writer", "ux-spec-agent"
        ],
    },
    "06-planning": {
        "domain": "planejamento, roadmap, marcos, capacidade, dependencias, custos, riscos e trade-offs",
        "agents": [
            "capacity-planner", "cost-agent", "delivery-planner", "dependency-manager", "milestone-agent",
            "plan-validator", "prioritization-agent", "risk-manager", "roadmap-agent", "tradeoff-agent"
        ],
    },
    "07-hitl": {
        "domain": "human-in-the-loop, gates, aprovacoes, escalonamento, overrides e seguranca operacional",
        "agents": [
            "accountability-agent", "approval-gate-agent", "escalation-agent", "exception-handling-agent",
            "hitl-designer", "human-feedback-agent", "manual-override-agent", "safety-checkpoint-agent"
        ],
    },
    "08-backlog": {
        "domain": "backlog, epicos, historias, tarefas, estimativas, testabilidade e rastreabilidade",
        "agents": [
            "backlog-engineer", "definition-checker", "estimation-agent", "github-issues-agent", "sprint-planning-agent",
            "story-writer", "task-breakdown-agent", "testability-agent", "traceability-agent"
        ],
    },
    "09-architecture": {
        "domain": "arquitetura de solucao, corporativa, integracoes, cloud, APIs, eventos, resiliencia e performance",
        "agents": [
            "api-architect", "architecture-reviewer", "cloud-architect", "enterprise-architect", "event-driven-architect",
            "integration-architect", "performance-architect", "platform-engineer", "resilience-architect", "solution-architect"
        ],
    },
    "10-data": {
        "domain": "dados, contratos, governanca, modelagem, qualidade, lineage, metadados e camada semantica",
        "agents": [
            "analytics-engineer", "data-architect", "data-contract-agent", "data-governance-reviewer", "data-modeler",
            "data-quality-agent", "feature-store-agent", "lineage-agent", "metadata-agent", "observability-data-agent",
            "privacy-data-agent", "semantic-layer-agent"
        ],
    },
    "11-ai-agents-automation": {
        "domain": "IA, agentes, automacao, prompts, RAG, avaliacao, guardrails, memoria e observabilidade de agentes",
        "agents": [
            "agent-architect", "agent-observability-agent", "ai-solution-architect", "evaluation-agent", "guardrail-agent",
            "memory-design-agent", "model-selection-agent", "prompt-engineer", "prompt-regression-agent", "rag-architect",
            "simulation-agent", "tooling-agent"
        ],
    },
    "12-development": {
        "domain": "desenvolvimento, frontend, backend, APIs, banco, IaC, refatoracao, dependencias e code review",
        "agents": [
            "api-agent", "backend-agent", "code-reviewer", "database-agent", "dependency-update-agent", "devex-agent",
            "frontend-agent", "iac-agent", "implementation-agent", "legacy-modernization-agent", "performance-code-reviewer",
            "refactoring-agent", "secure-code-reviewer"
        ],
    },
    "13-qa-tests": {
        "domain": "QA, testes unitarios, integracao, E2E, regressao, contrato, carga, seguranca e evidencias",
        "agents": [
            "accessibility-test-agent", "contract-test-agent", "defect-triage-agent", "e2e-test-agent", "integration-test-agent",
            "load-test-agent", "qa-agent", "quality-evidence-agent", "regression-test-agent", "security-test-agent",
            "test-data-agent", "test-plan-agent", "unit-test-agent"
        ],
    },
    "14-homologation": {
        "domain": "homologacao, UAT, aceite de negocio, evidencias, defeitos, go/no-go e sign-off",
        "agents": [
            "business-acceptance-agent", "defect-resolution-agent", "go-no-go-agent", "homologation-agent",
            "homologation-evidence-agent", "signoff-agent", "uat-coordinator"
        ],
    },
    "15-release-deployment": {
        "domain": "release, deploy, rollback, mudanca, runbooks, readiness, incidentes e hypercare",
        "agents": [
            "change-management-agent", "deployment-planner", "hypercare-agent", "incident-preparedness-agent",
            "observability-readiness-agent", "production-readiness-agent", "release-manager", "release-notes-agent",
            "rollback-reviewer", "runbook-agent"
        ],
    },
    "16-operations-post-implementation": {
        "domain": "operacao, observabilidade, SRE, suporte, incidentes, aprendizados, valor, adocao e melhoria continua",
        "agents": [
            "adoption-agent", "continuous-improvement-agent", "incident-reviewer", "lessons-learned-agent",
            "observability-agent", "post-implementation-reviewer", "sre-agent", "sunset-agent",
            "support-readiness-agent", "value-realization-agent"
        ],
    },
    "17-documentation": {
        "domain": "documentacao tecnica, funcional, arquitetura, APIs, dados, guias, FAQs, KB e diagramas",
        "agents": [
            "admin-guide-agent", "api-doc-agent", "architecture-doc-agent", "data-dictionary-agent", "diagram-agent",
            "documentation-agent", "faq-agent", "knowledge-base-agent", "onboarding-doc-agent", "user-guide-agent"
        ],
    },
    "18-content-publication": {
        "domain": "conteudo, artigos, escrita tecnica, ghostwriting executivo, edicao, checagem, storytelling e publicacao",
        "agents": [
            "article-writer", "content-strategist", "editor-agent", "executive-ghostwriter", "fact-checker",
            "linkedin-agent", "narrative-architect", "presentation-agent", "publication-readiness-agent",
            "technical-writer", "thought-leadership-agent", "tone-of-voice-agent"
        ],
    },
    "19-product-growth": {
        "domain": "produto, PMF, MVP, experimentos, growth, GTM, sucesso do cliente, feedback e roadmap evolutivo",
        "agents": [
            "customer-success-agent", "experiment-design-agent", "feedback-synthesis-agent", "growth-agent", "gtm-agent",
            "mvp-scope-agent", "pricing-agent", "product-manager-agent", "product-market-fit-agent", "roadmap-evolution-agent"
        ],
    },
    "20-security-risk-compliance": {
        "domain": "seguranca, risco, compliance, controle de acesso, logs, retencao, privacidade, modelo e terceiros",
        "agents": [
            "access-control-agent", "appsec-agent", "audit-log-agent", "data-retention-agent", "model-risk-agent",
            "privacy-impact-agent", "regulatory-risk-agent", "secrets-reviewer", "third-party-risk-agent", "threat-modeling-agent"
        ],
    },
    "21-finance-management": {
        "domain": "financas, orcamento, otimizacao de custo, portfolio, beneficios, OKRs e reporte executivo",
        "agents": [
            "benefits-realization-agent", "budget-agent", "cost-optimization-agent", "executive-reporting-agent",
            "financial-impact-agent", "okr-agent", "portfolio-agent", "steering-committee-agent"
        ],
    },
    "22-meta-squad-improvement": {
        "domain": "melhoria da propria squad, desempenho de agentes, prompts, workflows, benchmarks, ferramentas e falhas",
        "agents": [
            "agent-performance-reviewer", "agent-registry-maintainer", "automation-candidate-agent", "benchmark-agent",
            "failure-analysis-agent", "prompt-quality-agent", "rubric-designer", "skill-registry-maintainer",
            "tool-selection-agent", "workflow-optimizer"
        ],
    },
}

PROMPTS = [
    "00-run-intake", "01-brainstorm", "02-create-briefing", "03-validate-briefing", "04-create-constitution",
    "05-validate-constitution", "06-create-spec", "07-validate-spec", "08-create-plan", "09-validate-plan",
    "10-create-hitl-map", "11-create-backlog", "12-create-data-contract", "13-architecture-review",
    "14-implementation-review", "15-qa-plan", "16-homologation-readiness", "17-release-readiness",
    "18-post-implementation-review", "19-article-outline", "20-article-review", "21-executive-summary",
    "22-agent-benchmark", "23-squad-retrospective"
]

SKILLS = [
    "agent-design", "architecture-review", "article-writing", "backlog-generation", "brainstorming", "briefing",
    "code-review", "constitution", "data-contract", "decision-log", "executive-writing", "hitl-design",
    "homologation", "plan-validation", "post-implementation-review", "prompt-evaluation", "rag-design",
    "release-readiness", "rubric-design", "spec-validation", "spec-writing", "squad-optimization",
    "test-plan", "threat-modeling"
]

TEMPLATES = [
    "agent-review", "api-contract", "architecture-decision-record", "article-brief", "backlog", "briefing",
    "constitution", "data-contract", "data-dictionary", "executive-summary", "hitl-map", "homologation-evidence",
    "idea-canvas", "plan", "post-implementation-review", "qa-plan", "release-plan", "risk-register", "spec"
]

RUNBOOKS = ["vscode-copilot", "claude-code", "codex", "devin", "speckit", "crewai-autogen"]

ORCHESTRATOR_HANDOFFS = [
    "workflow-router", "context-librarian", "quality-gate-controller", "risk-triage-agent", "decision-recorder",
    "strategy-council", "problem-framing-agent", "assumption-mapper", "opportunity-mapper", "briefing-writer",
    "briefing-validator", "constitution-architect", "governance-validator", "spec-writer", "spec-reviewer",
    "delivery-planner", "plan-validator", "hitl-designer", "backlog-engineer", "solution-architect",
    "data-architect", "ai-solution-architect", "agent-architect", "prompt-engineer", "evaluation-agent",
    "implementation-agent", "code-reviewer", "qa-agent", "homologation-agent", "release-manager",
    "observability-agent", "post-implementation-reviewer"
]

VALIDATOR_KEYWORDS = (
    "validator", "reviewer", "checker", "audit", "qa", "test", "security", "compliance", "risk", "triage",
    "quality", "readiness", "signoff", "go-no-go", "evidence", "acceptance", "fact-checker"
)
ORCHESTRATOR_KEYWORDS = ("orchestrator", "router", "controller", "manager", "coordinator", "maintainer", "optimizer")


def titleize(name: str) -> str:
    return " ".join(
        part.upper() if part in {"api", "qa", "uat", "sre", "iac", "rag", "okr", "e2e", "gtm"} else part.capitalize()
        for part in name.split("-")
    )


def infer_role(name: str) -> str:
    if any(k in name for k in ORCHESTRATOR_KEYWORDS):
        return "orchestrator"
    if any(k in name for k in VALIDATOR_KEYWORDS):
        return "validator"
    return "producer"


def write(path: str, content: str):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + "\n", encoding="utf-8")


def yaml_list(items, indent=""):
    return "\n".join(f"{indent}- {item}" for item in items)


def orchestrator_content() -> str:
    handoffs = yaml_list(ORCHESTRATOR_HANDOFFS, "  ")
    return f"""
---
name: squad-orchestrator
description: Agente inicial obrigatorio. Entende o que sera feito, classifica a demanda e orquestra a entrada dos demais agentes.
group: 00-entrypoint
role_type: orchestrator
entrypoint: true
priority: 0
tools:
  - codebase
  - search
  - editFiles
  - agent
handoffs:
{handoffs}
---

# Squad Orchestrator

## Mandato

Voce e o agente inicial da squad. Sua primeira responsabilidade e entender o que sera feito e orquestrar a entrada dos demais agentes.

Voce nao e o executor principal. Voce e o intake, roteador, chief of staff, controller de gates e guardiao de rastreabilidade da squad.

## O que voce deve fazer primeiro

Sempre que uma nova demanda chegar:

1. Entender o objetivo real da demanda.
2. Classificar o tipo de entrega.
3. Identificar contexto, publico, restricoes, riscos e resultado esperado.
4. Verificar artefatos existentes antes de criar novos.
5. Definir quais agentes entram agora, quais entram depois e quais nao sao necessarios.
6. Separar agentes produtores, validadores e gates humanos.
7. Gerar o handoff para o primeiro agente especialista.

## O que voce nao deve fazer

- Nao implementar codigo diretamente.
- Nao escrever sozinho a versao final de briefing, spec, plano, artigo ou codigo quando houver agentes especialistas para isso.
- Nao validar o proprio output.
- Nao acionar todos os agentes ao mesmo tempo.
- Nao pular HITL quando houver impacto em usuario, producao, dados, seguranca, compliance, custo ou reputacao.
- Nao tratar ambiguidade como bloqueio se for possivel seguir com assuncoes explicitas.

## Processo de intake

Produza sempre este diagnostico antes de qualquer handoff:

```markdown
# Intake da demanda

## 1. Diagnostico inicial
- Tipo de entrega:
- Objetivo principal:
- Resultado esperado:
- Publico/usuario:
- Contexto conhecido:
- Restricoes:
- Riscos iniciais:
- Nivel de incerteza:

## 2. Classificacao
- Dominio principal:
- Dominio secundario:
- Criticidade:
- Envolve dados sensiveis?
- Envolve IA/agentes?
- Envolve desenvolvimento?
- Envolve publicacao externa?
- Envolve producao?

## 3. Rota de agentes
- Agentes acionados agora:
- Agentes de validacao:
- Agentes que entram depois:
- Agentes descartados por enquanto:

## 4. Artefatos esperados
- Artefatos da fase atual:
- Artefatos futuros:

## 5. Gates HITL
- Gate 1:
- Gate 2:
- Gate 3:

## 6. Handoff inicial
- Proximo agente:
- Tarefa:
- Criterios de aceite:
- Output esperado:
```

## Roteamento padrao

### Ideia aberta ou ambigua

```text
strategy-council -> problem-framing-agent -> assumption-mapper -> opportunity-mapper -> briefing-writer -> briefing-validator
```

### Aplicacao ou produto digital

```text
strategy-council -> briefing-writer -> briefing-validator -> constitution-architect -> spec-writer -> spec-reviewer -> solution-architect -> data-architect -> delivery-planner -> plan-validator -> hitl-designer -> backlog-engineer -> implementation-agent -> code-reviewer -> qa-agent -> homologation-agent -> release-manager -> observability-agent -> post-implementation-reviewer
```

### Produto com IA ou agentes

```text
ai-solution-architect -> agent-architect -> prompt-engineer -> rag-architect -> evaluation-agent -> guardrail-agent -> model-risk-agent -> hitl-designer -> agent-observability-agent
```

### Produto de dados ou analytics

```text
data-architect -> data-modeler -> data-contract-agent -> data-governance-reviewer -> data-quality-agent -> lineage-agent -> analytics-engineer -> semantic-layer-agent -> observability-data-agent
```

### Texto, artigo ou publicacao executiva

```text
content-strategist -> narrative-architect -> article-writer -> editor-agent -> fact-checker -> tone-of-voice-agent -> publication-readiness-agent
```

### Automacao operacional

```text
workflow-router -> risk-triage-agent -> automation-candidate-agent -> hitl-designer -> implementation-agent -> qa-agent -> release-manager
```

### Tarefa tecnica pontual

```text
context-librarian -> task-breakdown-agent -> implementation-agent -> code-reviewer -> unit-test-agent
```

## Regras de acionamento

- Acione `briefing-writer` quando houver problema, publico e objetivo minimamente claros.
- Acione `briefing-validator` sempre apos `briefing-writer`.
- Acione `constitution-architect` quando houver produto, app, automacao, agente ou iniciativa recorrente.
- Acione `spec-writer` somente apos briefing aprovado ou com assuncoes declaradas.
- Acione `delivery-planner` somente apos spec inicial.
- Acione `hitl-designer` quando houver risco, dados, producao, impacto em usuario ou decisao irreversivel.
- Acione `data-architect` quando a solucao criar, ler, transformar, expor ou consumir dados.
- Acione `security-governance-agent` quando houver autenticacao, autorizacao, APIs, dados sensiveis ou producao.
- Acione `qa-agent` antes de homologacao.
- Acione `release-manager` antes de deploy, publicacao ou go-live.
- Acione `post-implementation-reviewer` depois de release, publicacao ou entrega final.

## Formato de handoff

```markdown
# Handoff para <agente>

## Contexto

## Objetivo

## Entrada disponivel

## Tarefa do agente

## Restricoes

## Criterios de aceite

## Riscos conhecidos

## Output esperado

## Proximo agente sugerido
```

## Saida padrao do orquestrador

Use sempre a estrutura:

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

## Definition of Done do orquestrador

O trabalho do orquestrador esta completo quando:

- A demanda foi entendida e classificada.
- A rota de agentes foi definida.
- A primeira fase foi delimitada.
- O proximo agente recebeu um handoff claro.
- Os principais riscos e gates HITL foram declarados.
- O usuario tem um proximo passo executavel.
"""


def agent_content(name: str, group: str, domain: str) -> str:
    if name == "squad-orchestrator":
        return orchestrator_content().replace("group: 00-entrypoint", f"group: {group}")

    role = infer_role(name)
    title = titleize(name)
    tools = ["codebase", "search", "editFiles"]
    if role == "orchestrator":
        tools.append("agent")

    handoffs = ["squad-orchestrator", "quality-gate-controller", "risk-triage-agent"]
    if role == "producer":
        handoffs.append("appropriate-validator")
    elif role == "validator":
        handoffs.extend(["decision-recorder", "hitl-designer"])
    else:
        handoffs.append("decision-recorder")

    return f"""
---
name: {name}
description: Atua como {title} no dominio de {domain}.
group: {group}
role_type: {role}
tools:
{yaml_list(tools, '  ')}
handoffs:
{yaml_list(handoffs, '  ')}
---

# {title}

## Missao
Atua como `{name}` no dominio de {domain}.

## Quando usar
- Use quando a demanda envolver {domain}.
- Use quando o `squad-orchestrator` encaminhar uma tarefa para `{name}`.
- Use quando existir artefato em criacao, revisao ou decisao relacionado a esta especialidade.

## Entradas esperadas
- Ideia, briefing, constitution, spec, plano, issue, PR, artigo ou documento existente.
- Contexto em `AGENTS.md`, `SQUAD.md`, `.specify/memory/constitution.md`, `docs/` e `.github/prompts/`.
- Restricoes de dados, seguranca, compliance, prazo, custo, qualidade e operacao.

## Saidas obrigatorias
1. Resumo executivo.
2. Artefato produzido ou validado.
3. Riscos, premissas e dependencias.
4. Criterios de aceite ou rubrica.
5. Pendencias HITL.
6. Proximos handoffs.

## Regras
- Nunca oculte incertezas.
- Nunca aprove o proprio trabalho se atuar como produtor.
- Prefira entregas pequenas, testaveis, versionaveis e reversiveis.
- Registre decisoes criticas em `docs/decisions/`.
- Acione `risk-triage-agent` para risco tecnico, operacional, regulatorio, reputacional ou de dados.
- Retorne ao `squad-orchestrator` quando a proxima etapa nao estiver clara.

## Checklist
- [ ] Escopo claro.
- [ ] Criterios verificaveis.
- [ ] Riscos explicitos.
- [ ] Dependencias identificadas.
- [ ] HITL mapeado.
- [ ] Handoff recomendado.

## Prompt base
Atue como `{name}`. Produza ou valide o artefato solicitado com foco em {domain}. Responda com resumo executivo, artefato, riscos, criterios de aceite, pendencias HITL e proximos handoffs.
"""


def prompt_content(slug: str) -> str:
    if slug == "00-run-intake":
        return """
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
"""

    title = titleize(slug)
    return f"""
---
description: {slug.replace('-', ' ')}
mode: agent
---

# {title}

## Objetivo
Executar o ritual `{slug}` usando a AI Delivery Squad.

## Instrucao
1. Comece pelo contexto existente no repo.
2. Use o `squad-orchestrator` se a rota ainda nao estiver definida.
3. Produza o artefato solicitado com secoes claras, criterios de aceite e pendencias HITL.
4. Acione validador quando o artefato tiver impacto em produto, dados, seguranca, operacao, publicacao ou producao.

## Entrada
```text
<cole aqui o contexto da demanda>
```

## Saida esperada
- Resumo executivo.
- Artefato ou revisao.
- Riscos e mitigacoes.
- Criterios de aceite.
- Pendencias HITL.
- Proximo handoff.
"""


def skill_content(skill: str) -> str:
    title = titleize(skill)
    return f"""
# Skill: {title}

## Objetivo
Fornecer uma capacidade reutilizavel para `{skill}` dentro da AI Delivery Squad.

## Quando usar
- Quando o agente precisar executar `{skill}` com padrao consistente.
- Quando houver necessidade de checklist, rubrica, evidencia ou output versionavel.

## Processo
1. Entender contexto e objetivo.
2. Identificar entradas existentes no repo.
3. Declarar premissas, riscos e restricoes.
4. Produzir o artefato ou validacao.
5. Gerar criterios de aceite.
6. Sinalizar pendencias HITL.
7. Recomendar proximo handoff.

## Checklist
- [ ] Contexto compreendido.
- [ ] Entradas mapeadas.
- [ ] Output estruturado.
- [ ] Riscos explicitos.
- [ ] Criterios verificaveis.
- [ ] Decisoes registradas quando necessario.

## Formato de saida
```markdown
## Resumo
## Artefato
## Riscos
## Criterios de aceite
## Pendencias HITL
## Proximo handoff
```
"""


def template_content(name: str) -> str:
    title = titleize(name)
    return f"""
# {title}

## 1. Contexto

## 2. Objetivo

## 3. Escopo

### Inclui

### Nao inclui

## 4. Publico ou usuario

## 5. Requisitos ou conteudo principal

## 6. Dados envolvidos

## 7. Riscos e premissas

## 8. Criterios de aceite

## 9. Evidencias obrigatorias

## 10. Gates HITL

## 11. Decisoes registradas

## 12. Proximos passos
"""


def runbook_content(name: str) -> str:
    title = titleize(name)
    return f"""
# Runbook: {title}

## Objetivo
Usar `{name}` como engine operacional da AI Delivery Squad.

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
"""


def top_level_files():
    all_agents = [a for g in AGENTS_BY_GROUP.values() for a in g["agents"]]
    files = {}

    files["AGENTS.md"] = """
# AGENTS.md

## Missao
Transformar ideias em aplicacoes, textos, artigos, produtos e automacoes com qualidade, velocidade, governanca e rastreabilidade.

## Entrada obrigatoria
Toda demanda nova deve iniciar com o agente `squad-orchestrator`.

Arquivo principal:

```text
.github/agents/00-squad-orchestrator.agent.md
```

Espelhos:

```text
.github/agents/01-orchestration/squad-orchestrator.agent.md
.claude/agents/00-squad-orchestrator.md
.claude/agents/01-orchestration/squad-orchestrator.md
```

## Papel do orquestrador
1. Entender o que sera feito.
2. Classificar a demanda.
3. Definir a rota de trabalho.
4. Acionar os agentes adequados.
5. Separar produtor, validador e decisor humano.
6. Declarar artefatos esperados.
7. Declarar gates HITL.
8. Gerar handoffs claros.
9. Manter rastreabilidade entre ideia, artefatos, execucao e aprendizado.

## Principios
1. Um agente produtor nunca aprova o proprio trabalho.
2. Decisoes criticas devem gerar registro em `docs/decisions/`.
3. Nenhum artefato avanca sem criterios de aceite.
4. Toda entrega com risco real deve ter ponto HITL explicito.
5. Toda implantacao deve ter rollback ou reversao.
6. Todo uso de dados deve declarar classificacao, ownership, contrato, qualidade e retencao.
7. Toda solucao com IA deve ter avaliacao, guardrails, observabilidade e modo de falha seguro.

## Formato de resposta dos agentes
1. Status.
2. Artefatos alterados ou propostos.
3. Riscos e mitigacoes.
4. Criterios de aceite.
5. Pendencias HITL.
6. Proximos handoffs.
"""

    files["SQUAD.md"] = f"""
# SQUAD.md

## Visao
AI Delivery Operating System para conduzir ideias ate entrega, publicacao, implantacao ou aprendizado validado.

## Entrada operacional
O `squad-orchestrator` e o agente inicial obrigatorio. Ele entende a demanda e orquestra a entrada dos demais agentes conforme tipo de entrega, fase, risco e artefatos existentes.

## Catalogo
Total de agentes nesta configuracao: {len(all_agents)} + entrada destacada.

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
"""

    files["README.md"] = """
# AI Squad Starter Kit

Pacote textual para operar uma squad de agentes no VS Code com GitHub Copilot Chat, Claude Code, Codex e Devin.

## Como iniciar
1. Execute `python -S bootstrap_ai_squad.py` na raiz do repositorio.
2. Abra o VS Code.
3. Use o prompt `.github/prompts/00-run-intake.prompt.md`.
4. Comece sempre pelo agente `squad-orchestrator`.

## Regra de ouro
Um agente produz. Outro agente valida. Um humano decide nos gates criticos. O repo registra.
"""

    files["CLAUDE.md"] = """
# CLAUDE.md

Use o agente `.claude/agents/00-squad-orchestrator.md` como entrada obrigatoria.

Nao execute todos os agentes em paralelo. Use a rota definida pelo orquestrador.
"""

    files["ENGINE_ROUTING.md"] = """
# ENGINE_ROUTING.md

| Engine | Uso recomendado |
|---|---|
| GitHub Copilot Chat | Cockpit no VS Code, navegacao de repo, edicoes incrementais e agentes customizados. |
| Claude Code | Arquitetura, analise profunda, refatoracao complexa e revisoes conceituais. |
| Codex | Implementacao objetiva, testes, prototipos e alteracoes focadas. |
| Devin / Devin CLI | Execucao autonoma de issues, PRs, tarefas longas e manutencao. |
| CrewAI / AutoGen | Automacao programatica de crews e fluxos fora do VS Code. |
"""

    files["HITL_GATES.md"] = """
# HITL_GATES.md

## Gates obrigatorios
- Problema e oportunidade aprovados.
- Briefing aprovado.
- Constitution aprovada.
- Spec aprovada.
- Plano tecnico aprovado.
- Dados, seguranca e compliance aprovados quando aplicavel.
- Go/no-go de homologacao.
- Go/no-go de producao ou publicacao.
- Revisao pos-implantacao concluida.
"""

    files["SQUAD_REGISTRY.md"] = "# SQUAD_REGISTRY.md\n\n" + "\n".join(
        f"## {group}\n" + "\n".join(f"- `{agent}`" for agent in data["agents"]) + "\n"
        for group, data in AGENTS_BY_GROUP.items()
    )

    files[".github/copilot-instructions.md"] = """
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
"""

    files[".codex/AGENTS.md"] = """
# Codex AGENTS.md

Use `AGENTS.md` e `SQUAD.md` como contrato operacional.
Comece pelo `squad-orchestrator` quando a tarefa nao estiver totalmente especificada.
"""

    files[".devin/rules/ai-squad.md"] = """
# Devin Rules: AI Squad

- Antes de executar, identificar briefing, spec, plano e criterios de aceite.
- Nao abrir PR sem testes ou justificativa explicita.
- Nao implantar sem plano de rollback.
- Registrar decisoes relevantes em `docs/decisions/`.
"""

    files[".specify/memory/constitution.md"] = """
# Constitution

## Principios
1. Clareza antes de velocidade.
2. Rastreabilidade antes de escala.
3. Validacao antes de aprovacao.
4. Reversibilidade antes de producao.
5. Dados com ownership, qualidade, retencao e classificacao.
6. IA com avaliacao, guardrails, HITL e observabilidade.

## Definition of Ready
- Problema claro.
- Objetivo claro.
- Stakeholders conhecidos.
- Criterios de aceite preliminares.
- Riscos iniciais mapeados.

## Definition of Done
- Artefato versionado.
- Criterios de aceite atendidos.
- Validacao independente concluida.
- HITL executado quando necessario.
- Decisoes relevantes registradas.
"""

    files[".vscode/settings.json"] = json.dumps({
        "chat.agent.enabled": True,
        "github.copilot.chat.codeGeneration.instructions": [
            {"text": "Comece novas demandas pelo squad-orchestrator e preserve rastreabilidade."}
        ]
    }, indent=2)

    files[".vscode/tasks.json"] = json.dumps({
        "version": "2.0.0",
        "tasks": [
            {"label": "List AI Squad agents", "type": "shell", "command": "bash scripts/list_agents.sh", "problemMatcher": []},
            {"label": "Validate AI Squad package", "type": "shell", "command": "bash scripts/validate_package.sh", "problemMatcher": []}
        ]
    }, indent=2)

    files["config/hitl-gates.yaml"] = """
gates:
  - briefing_approved
  - constitution_approved
  - spec_approved
  - plan_approved
  - data_security_approved
  - release_go_no_go
  - post_implementation_review
"""

    files["config/agent-activation-matrix.yaml"] = """
routes:
  idea:
    - squad-orchestrator
    - strategy-council
    - briefing-writer
    - briefing-validator
  app:
    - squad-orchestrator
    - spec-writer
    - solution-architect
    - implementation-agent
    - qa-agent
  ai_product:
    - squad-orchestrator
    - ai-solution-architect
    - agent-architect
    - evaluation-agent
    - guardrail-agent
  data_product:
    - squad-orchestrator
    - data-architect
    - data-contract-agent
    - data-quality-agent
"""

    files["config/quality-rubrics.yaml"] = """
rubrics:
  completeness: "O artefato cobre objetivo, escopo, riscos, aceite e HITL."
  consistency: "Nao ha contradicoes internas."
  testability: "Criterios sao verificaveis."
  traceability: "Existe ligacao entre ideia, spec, plano, tasks e evidencia."
"""

    files["scripts/list_agents.sh"] = """
#!/usr/bin/env bash
set -e
find .github/agents -type f -name '*.agent.md' | sort
"""

    files["scripts/validate_package.sh"] = """
#!/usr/bin/env bash
set -e
[ -f AGENTS.md ]
[ -f SQUAD.md ]
[ -f .github/agents/00-squad-orchestrator.agent.md ]
[ -f .github/prompts/00-run-intake.prompt.md ]
[ -f .specify/memory/constitution.md ]
count=$(find .github/agents -type f -name '*.agent.md' | wc -l | tr -d ' ')
echo "AI Squad package OK. Agent files: $count"
"""

    return files


def create_docs():
    for folder in [
        "docs/ai-squad", "docs/briefings", "docs/specs", "docs/plans", "docs/hitl", "docs/data",
        "docs/qa", "docs/release", "docs/post-implementation", "docs/decisions", "examples/artigo"
    ]:
        write(f"{folder}/README.md", f"# {folder}\n\nPasta operacional da AI Delivery Squad.")

    write("docs/decisions/0000-template.md", """
# ADR 0000 - Template

## Status
Proposto

## Contexto

## Decisao

## Consequencias

## Alternativas consideradas
""")

    for template in TEMPLATES:
        write(f"docs/templates/{template}.md", template_content(template))

    for runbook in RUNBOOKS:
        write(f"docs/runbooks/{runbook}.md", runbook_content(runbook))

    write("docs/ai-squad/orchestrator-entrypoint.md", """
# Orchestrator Entrypoint

Toda demanda inicia pelo `squad-orchestrator`.

O orquestrador entende o que sera feito, define a rota e aciona os agentes certos no momento certo.
""")

    write("docs/ai-squad/operating-model.md", """
# Operating Model

Ideia -> Intake -> Brainstorm -> Briefing -> Constitution -> Spec -> Plano -> HITL -> Backlog -> Execucao -> Validacao -> Homologacao -> Release -> Pos-implantacao.
""")

    write("docs/ai-squad/activation-matrix.md", """
# Activation Matrix

Use `config/agent-activation-matrix.yaml` como fonte operacional.
""")

    write("docs/ai-squad/framework-positioning.md", """
# Framework Positioning

- BMAD: rituais, personas, fluxos e governanca de entrega.
- Spec Kit: constitution, specs, plano, tasks e implementacao.
- Copilot: cockpit no VS Code.
- Claude Code: analise profunda e refatoracao.
- Codex: implementacao e testes.
- Devin: tarefas autonomas e PRs.
- CrewAI/AutoGen: automacao programatica quando necessario.
""")


def main():
    for path, content in top_level_files().items():
        write(path, content)

    entry = orchestrator_content()
    write(".github/agents/00-squad-orchestrator.agent.md", entry)
    write(".claude/agents/00-squad-orchestrator.md", entry)

    for group, data in AGENTS_BY_GROUP.items():
        for agent in data["agents"]:
            content = agent_content(agent, group, data["domain"])
            write(f".github/agents/{group}/{agent}.agent.md", content)
            write(f".claude/agents/{group}/{agent}.md", content)

    for prompt in PROMPTS:
        write(f".github/prompts/{prompt}.prompt.md", prompt_content(prompt))

    for skill in SKILLS:
        write(f".skills/{skill}/SKILL.md", skill_content(skill))

    create_docs()

    write(".gitignore", """
.DS_Store
.env
.env.*
__pycache__/
.pytest_cache/
node_modules/
dist/
build/
""")

    for script in ["scripts/list_agents.sh", "scripts/validate_package.sh"]:
        try:
            os.chmod(ROOT / script, 0o755)
        except Exception:
            pass

    agent_files = list((ROOT / ".github/agents").rglob("*.agent.md"))
    print(f"AI Squad criada com {len(agent_files)} arquivos de agentes Copilot.")
    print("Entrada obrigatoria: .github/agents/00-squad-orchestrator.agent.md")
    print("Prompt inicial: .github/prompts/00-run-intake.prompt.md")


if __name__ == "__main__":
    main()