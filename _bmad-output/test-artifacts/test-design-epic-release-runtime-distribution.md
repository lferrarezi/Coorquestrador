---
workflowStatus: 'draft'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-11-06'
runScope: 'epic-level'
runKey: 'epic-release-runtime-distribution'
---

# Test Design: Epic release-runtime-distribution

**Data:** 2026-11-06
**Autor:** Luiz
**Status:** Draft — aguardando aprovação operacional dos gates produtivos

## Executive Summary

**Escopo:** plano de testes em nível de épico para validar runtime e distribuição produtiva da extensão VS Code `lferrarezi.coorquestrador`, incluindo segurança de chat, empacotamento VSIX, ativação real em VS Code/VSCodium e convergência dos registries públicos.

O épico é operacional e foi identificado a partir da retrospectiva do ciclo `v1.3.3 → v1.4.0`, da preparação local de `v1.4.1` e dos workflows de CI/publicação. Não há PRD, ADR, histórias formais ou `sprint-status.yaml`; essa ausência é tratada como risco de testabilidade, não como requisito implícito.

**Resumo de risco:**

- Riscos identificados: 9.
- Riscos altos (score ≥6): 6 — R-01, R-02, R-03, R-04, R-06 e R-07.
- Categorias críticas: SEC, OPS e TECH.
- Nenhum score 9 foi identificado com a evidência atual; isso não aprova a publicação enquanto R-02 não tiver execução no GitHub.
- R-06 foi mitigado localmente por `validateGate2Threshold` e fail-closed em `crossesGate2`; a evidência CI/release ainda pertence aos gates de distribuição.

**Resumo de cobertura planejada:**

- P0: 9 testes, ~8–14 horas.
- P1: 16 testes, ~16–28 horas.
- P2: 15 testes, ~10–18 horas.
- P3: 4 testes, ~2–5 horas.
- **Total:** 44 testes, ~36–65 horas, aproximadamente 1–2 semanas.

## Not in Scope

| Item | Motivo | Mitigação |
|---|---|---|
| Performance, carga e escalabilidade da extensão | Não há requisito de latência, throughput ou volume no épico. | Marcar limiares como UNKNOWN; criar requisito antes de usar k6 ou baseline como gate. |
| Interface web e testes Playwright | A extensão é nativa; não há UI web no escopo e `playwright-cli` não está disponível. | Validar comandos/runtime pelo host VS Code e manter exploração web fora do plano. |
| Provedores externos e comportamento interno de Claude/Codex/Gemini/Copilot | O épico valida o contrato/configuração local e o lançamento controlado, não os produtos de terceiros. | Fixtures, descoberta de CLI e smoke de ativação; contratos externos permanecem dependência operacional. |
| Publicação ou tag de `v1.4.1` | Este artefato planeja testes; a publicação continua um gate externo separado. | Executar o workflow oficial e coletar evidência antes de declarar produtivo. |
| Auditoria completa de segurança de dependências | A auditoria encontrou vulnerabilidades moderadas transitivas, mas a correção pode fazer downgrade de `vsce`. | R-09 fica em monitoramento e deve ser tratado em ciclo dedicado. |

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Categoria | Descrição | P | I | Score | Mitigação | Owner | Timeline |
|---|---|---|---:|---:|---:|---|---|---|
| R-01 | SEC | Engine customizado pode reintroduzir chat mutável antes do Gate 1 por template ou flag insegura. | 2 | 3 | 6 | `assertReadOnlyChatTemplate`, defaults fail-closed, bloqueio de Devin sem template seguro e testes unitários/runtime. | Maintainer da extensão | Antes do próximo publish |
| R-02 | OPS | Workflow pós-publicação pode não executar ou divergir do comportamento local; `v1.4.1` ainda não foi validada no GitHub. | 2 | 3 | 6 | `post-publish-smoke.yml` com `workflow_run`, dispatch manual, VSIX da Release, registries e matriz de editores. | Maintainer/release | Primeira publicação de `v1.4.1` |
| R-03 | TECH | Launchers e caminhos de VS Code/VSCodium variam no macOS; o binário local `code` encontrado não era o launcher esperado. | 3 | 2 | 6 | Matriz oficial em `macos-latest`, resolução explícita do launcher e smoke de instalação/ativação. | Maintainer/release | Antes do publish produtivo |
| R-04 | OPS | Registries podem atrasar ou usar identificadores/endpoints diferentes; Open VSX exigiu correção de namespace e retry. | 2 | 3 | 6 | Polling limitado, versão exata, estado produtivo e asset da GitHub Release. | Maintainer/release | Após cada publish |
| R-06 | SEC | Limiar ausente ou inválido pode desabilitar Gate 2 silenciosamente. | 2 | 3 | 6 | Validar `undefined`, `NaN`, negativo e zero conforme decisão formal; bloquear explicitamente e registrar motivo. | Maintainer de runtime | Antes do hardening ser aceito |
| R-07 | TECH | Falta de critérios formais reduz rastreabilidade entre objetivo, risco e evidência. | 3 | 2 | 6 | Esta matriz, IDs estáveis, critérios de gate e evidências por execução; formalizar requisitos em ciclo posterior. | Maintainer/release | Imediato |

### Medium-Priority Risks (Score 3–4)

| Risk ID | Categoria | Descrição | P | I | Score | Mitigação | Owner |
|---|---|---|---:|---:|---:|---|---|
| R-05 | TECH | Migração de configuração legada pode falhar para variantes de conteúdo ou wrappers customizados. | 2 | 2 | 4 | Matriz incremental de fixtures e testes de migração/descoberta. | Maintainer |
| R-08 | OPS | Smoke depende de rede, cask, editor gráfico e propagação pública; pode ser intermitente. | 2 | 2 | 4 | Diretórios isolados, diagnóstico por etapa e retry apenas para propagação. | Maintainer/release |
| R-09 | OPS | Vulnerabilidades moderadas transitivas permanecem; `npm audit fix --force` pode degradar o empacotamento. | 2 | 2 | 4 | Monitorar sem downgrade forçado; corrigir em ciclo dedicado com compatibilidade verificada. | Maintainer de dependências |

### Low-Priority Risks (Score 1–2)

Nenhum risco recebeu score 1–2 com a evidência atual. Os riscos médios acima são monitoráveis, mas não devem ser rebaixados artificialmente apenas para melhorar a aparência do quadro.

### Risk Category Legend

- **TECH:** técnico/arquitetural.
- **SEC:** segurança e controles de execução.
- **PERF:** desempenho e limites de recurso.
- **DATA:** integridade e consistência de dados.
- **BUS:** impacto de negócio/usuário.
- **OPS:** publicação, configuração e observabilidade.

## NFR Planning

| Categoria | Requisito/limiar | Risk Link | Validação planejada | Evidência necessária |
|---|---|---|---|---|
| Segurança | Chat read-only antes do Gate 1; flags perigosas devem ser recusadas. | R-01, R-06 | Unit + fixture de runtime. | Relatório de testes, logs de decisão e fixture exato. |
| Confiabilidade | Ativação real e convergência de registry; sem SLO formal. | R-02, R-04, R-08 | E2E/runtime + integration com retry limitado. | Logs CI, tentativas e status por editor/registry. |
| Performance | Nenhum limiar identificado. | — | N/A nesta versão. | Nenhuma até existir requisito. |
| Escalabilidade | Fora do escopo da extensão/distribuição deste épico. | — | N/A. | Nenhuma. |
| Manutenibilidade | Compatibilidade de config customizada sem limiar formal. | R-05 | Unit, fixtures e static/integration. | Matriz de fixtures e logs de `release:check`. |
| Compliance | Rastreabilidade de versão, tag, release e asset produtivo. | R-02, R-07 | Integration/CI. | Run ID, tag, GitHub Release e asset VSIX. |

**Limiar desconhecido:** não há SLO de propagação, taxa aceitável de flakiness, latência, throughput ou compatibilidade formal de configuração. Esses valores permanecem UNKNOWN; timeouts internos do script não são NFRs de produto.

## Entry Criteria

- [ ] Node.js 20, dependências instaladas e `npm run release:check` reproduzível.
- [ ] Fixtures e workspaces temporários isolados, sem contas ou dados reais.
- [ ] Launchers oficiais do VS Code e VSCodium disponíveis para smoke local/CI.
- [ ] Para validação produtiva, tag/release e VSIX foram publicados pelo workflow oficial.
- [ ] A regra para limiares inválidos do Gate 2 foi decidida e registrada.

## Exit Criteria

- [ ] P0 com 100% de aprovação.
- [ ] P1 com pelo menos 95% de aprovação e falhas triadas.
- [ ] Nenhuma falha SEC aberta.
- [ ] Nenhum VSIX com versão divergente ou registry produtivo sem evidência.
- [ ] R-01, R-02, R-03, R-04, R-06 e R-07 mitigados ou dispensados formalmente com responsável e validade.
- [ ] Cobertura de caminhos críticos ≥80%, segurança 100%, lógica de negócio ≥70% e bordas ≥50%.
- [ ] Evidência NFR identificada por categoria; decisão PASS/CONCERNS/FAIL reservada ao `nfr-assess`.

## Test Coverage Plan

P0–P3 são prioridades, não cronograma. O mesmo comportamento não deve ser recontado em níveis diferentes: unit prova lógica, integration prova contrato/processo, e E2E prova o host/editor real.

### P0 (Critical)

**Criteria:** impacto crítico de segurança, integridade ou compliance, sem workaround seguro.

| Requisito | Test Level | Risk Link | Test Count | Owner | Notes |
|---|---|---|---:|---|---|
| Recusar chat mutável, flags amplas, sandbox inseguro, ausência de `chat_read_only` e Devin sem template seguro. | Unit | R-01 | 5 | Dev | Lógica de segurança determinística; inclui flags e defaults. |
| Bloquear/explicitar limiares ausentes ou inválidos do Gate 2. | Unit | R-06 | 4 | Dev | Cobertura de `undefined`, `NaN`, negativo e zero conforme regra acordada. |

**Total P0:** 9 testes, ~8–14 horas.

### P1 (High)

**Criteria:** comportamento central, frequente ou complexo, com alcance material e workaround limitado.

| Requisito | Test Level | Risk Link | Test Count | Owner | Notes |
|---|---|---|---:|---|---|
| Compilar, testar, gerar bundle, empacotar e validar integridade/versão do VSIX. | Integration | R-02, R-07 | 4 | Dev/Release | Integra Node, filesystem e `vsce`. |
| Instalar e ativar VSIX produtivo em VS Code e VSCodium isolados. | E2E/runtime | R-02, R-03 | 2 | QA/Release | Apenas editor real prova ativação e registro efetivos. |
| Confirmar ativação, comandos críticos e criação de `.coorq`. | E2E/runtime | R-02 | 2 | QA/Release | Jornada crítica de runtime. |
| Confirmar versão exata, estado produtivo e asset em Open VSX, Marketplace e GitHub Release. | Integration/API | R-02, R-04 | 3 | Release | Observa integrações públicas, sem mocks. |
| Garantir defaults seguros e preservar configuração customizada compatível. | Unit | R-01, R-05 | 5 | Dev | Transformação de configuração; não duplica ativação real. |

**Total P1:** 16 testes, ~16–28 horas.

### P2 (Medium)

**Criteria:** comportamento secundário, alcance menor e workaround aceitável.

| Requisito | Test Level | Risk Link | Test Count | Owner | Notes |
|---|---|---|---:|---|---|
| Migrar configurações legadas sem corromper YAML. | Unit | R-05 | 5 | Dev | Fixtures de indentação e ausência de campos. |
| Descobrir CLIs/modelos e preservar fallback/redaction em wrappers customizados. | Unit | R-05 | 4 | Dev | Variantes observadas, sem combinatória ilimitada. |
| Diagnosticar retry, resposta incompleta, release ausente e falha de editor. | Integration | R-04, R-08 | 4 | Dev/Release | Fixtures de processo/resposta; smoke público permanece P1. |
| Reportar audit moderado sem downgrade forçado do empacotador. | Integration/static | R-09 | 2 | Dev | Gate de manutenção. |

**Total P2:** 15 testes, ~10–18 horas.

### P3 (Low)

**Criteria:** comportamento raro, cosmético ou experimental, com correção simples.

| Requisito | Test Level | Risk Link | Test Count | Owner | Notes |
|---|---|---|---:|---|---|
| Conferir consistência de versão e instruções em README/HANDOFF. | Unit/static | R-07 | 2 | Dev | Higiene de release, sem alterar contrato runtime. |
| Explorar launchers macOS alternativos e mensagens diagnósticas fora da matriz oficial. | E2E/runtime | R-03, R-08 | 2 | QA | Exploratórios; não substituem o smoke oficial. |

**Total P3:** 4 testes, ~2–5 horas.

## Execution Strategy

**Filosofia:** executar toda a suíte funcional em PR enquanto permanecer abaixo de 15 minutos; adiar apenas trabalho com custo relevante de infraestrutura, duração ou dependência pública. Prioridade não é cronograma.

- **PR:** `npm run release:check`, testes determinísticos, bundle/VSIX, `node --check` dos scripts e validação estrutural dos workflows.
- **Nightly:** smoke real em macOS com VS Code e VSCodium, diretórios isolados e diagnóstico completo.
- **Weekly:** exploração de launchers, auditoria de dependências e validação pública adicional; o `workflow_run` continua sendo obrigatório após cada publish.

## Resource Estimates

| Prioridade | Cenários | Faixa |
|---|---:|---:|
| P0 | 9 | ~8–14 horas |
| P1 | 16 | ~16–28 horas |
| P2 | 15 | ~10–18 horas |
| P3 | 4 | ~2–5 horas |
| **Total** | **44** | **~36–65 horas; ~1–2 semanas** |

As faixas incluem fixtures, diagnóstico e integração CI; não pressupõem runner macOS estável nem propagação imediata dos registries.

### Prerequisites

**Dados:** fixtures de engines e templates; workspace temporário; VSIX produzido pelo commit/release sob teste.
**Ferramentas:** Node.js 20, TypeScript, `vsce`, `unzip`, `gh`, launcher `code` oficial e `codium`.
**Ambiente:** CI Ubuntu para build/registries e macOS para runtime de editores; acesso público somente leitura aos registries e GitHub Release.

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0:** 100%, sem exceções.
- **P1:** ≥95%, com waiver obrigatório para qualquer falha.
- **P2/P3:** ≥90%, informacional, desde que nenhuma falha promova risco SEC/OPS alto.
- **Mitigações de alto risco:** 100% concluídas ou formalmente dispensadas.

### Coverage Targets

- Caminhos críticos: ≥80%.
- Cenários de segurança: 100%.
- Lógica de negócio: ≥70%.
- Casos de borda: ≥50%.

### Non-Negotiable Requirements

- [ ] Todos os P0 passam.
- [ ] Nenhum risco ≥6 permanece sem mitigação.
- [ ] Testes SEC passam 100%.
- [ ] Evidência de runtime em VS Code e VSCodium existe.
- [ ] Evidência de GitHub Release, Marketplace e Open VSX existe para a versão publicada.
- [ ] Evidência NFR existe ou `nfr-assess` registra CONCERNS/waiver.

## Mitigation Plans

### R-01: chat customizado mutável antes do Gate 1 (Score 6)

**Estratégia:** manter assertiva fail-closed, remover fallback inseguro de Devin e cobrir flags de permissão/sandbox e modo arquivo.
**Owner:** maintainer da extensão.
**Timeline:** antes do próximo publish.
**Status:** Em progresso/implementado parcialmente; falta manter a matriz em cada mudança.
**Verificação:** `npm test`, fixture de chat read-only e revisão do config carregado.

### R-02: distribuição não validada no GitHub (Score 6)

**Estratégia:** executar `post-publish-smoke.yml` após a release, preservar run ID e conferir VSIX/registries/editores.
**Owner:** maintainer/release.
**Timeline:** primeira publicação de `v1.4.1`.
**Status:** Validado no GitHub Actions para `v1.4.1` no run `42336102851`.
**Verificação:** workflow verde com logs de registry e dois jobs macOS concluídos.

### R-03: divergência de launcher/editor (Score 6)

**Estratégia:** usar matriz explícita e não assumir que qualquer binário chamado `code` representa o VS Code oficial.
**Owner:** maintainer/release.
**Timeline:** antes do publish produtivo.
**Status:** Smoke produtivo aprovado em VS Code e VSCodium no run `42336102851`.
**Verificação:** ativação real e comandos registrados em ambos os jobs.

### R-04: registry atrasado ou endpoint incorreto (Score 6)

**Estratégia:** usar endpoint `publisher/name`, polling limitado e validação de versão/estado produtivo/asset.
**Owner:** maintainer/release.
**Timeline:** após cada publish.
**Status:** Script e workflow validados contra `v1.4.1`; o atraso inicial do Marketplace foi resolvido por retry.
**Verificação:** saída estruturada dos três registries sem divergência.

### R-06: Gate 2 inválido desabilitado silenciosamente (Score 6)

**Estratégia:** definir sem ambiguidade o tratamento de valores ausentes e inválidos e implementar testes fail-closed.
**Owner:** maintainer de runtime.
**Timeline:** antes de declarar hardening completo.
**Status:** Complete localmente.
**Verificação:** `validateGate2Threshold` cobre ausente, `NaN`, negativo e zero; `crossesGate2` lança erro para configuração inválida; `npm test` aprovado.

### R-07: rastreabilidade formal insuficiente (Score 6)

**Estratégia:** manter este plano, a retrospectiva e as evidências por run versionadas; formalizar histórias/aceite em ciclo posterior.
**Owner:** maintainer/release.
**Timeline:** imediato.
**Status:** Mitigado documentalmente; requisito formal ainda ausente.
**Verificação:** cada risco material possui cenário, nível, prioridade e evidência.

## Assumptions and Dependencies

### Assumptions

1. A versão publicada deve ser produtiva, não pre-release; o smoke rejeita `preRelease !== false`.
2. A autoridade de publicação permanece GitHub Actions; validação local não substitui o workflow.
3. A matriz atual de VS Code/VSCodium em macOS representa o suporte declarado deste épico.
4. A ausência de limiares NFR é uma lacuna a resolver, não um valor zero implícito.

### Dependencies

1. GitHub Release produtiva com asset VSIX correspondente — necessária para R-02/R-04.
2. Runner macOS com os dois editores e launchers funcionais — necessária para R-03.
3. Decisão de regra para limiares inválidos do Gate 2 — necessária para encerrar R-06.
4. Acesso de leitura aos registries — necessário para evidência pública.

### Risks to Plan

- **Risco:** runner, cask ou registry indisponível. **Impacto:** resultado inconclusivo, não aprovação automática. **Contingência:** repetir somente a etapa dependente, preservar logs e classificar como falha de infraestrutura até nova evidência.
- **Risco:** mudança não relacionada no worktree. **Impacto:** confusão de autoria/evidência. **Contingência:** manter alterações existentes, separar commit e documentar o diff efetivamente testado.

## Follow-on Workflows (Manual)

- ATDD P0 executado; manter os nove testes como regressão ativa.
- Executar `/bmad-testarch-automate` para ampliar a matriz de migração e wrappers.
- Executar `nfr-assess` quando houver SLOs/limiares formais e evidência de CI produtivo.

## Approval

**Test Design Approved By:**

- [ ] Product/Release owner: Luiz — data: ______
- [ ] Tech owner: ______ — data: ______
- [ ] QA owner: ______ — data: ______

**Comentários:** plano pronto para execução; não constitui aprovação da publicação de `v1.4.1`.

## Interworking & Regression

| Componente | Impacto | Regressão obrigatória |
|---|---|---|
| Core TypeScript | Segurança, config, gates, DAG e persistência | `npm test`, com foco em `commandSecurity`, `chat`, config e estimator. |
| Empacotamento VSIX | Artefato que chega aos usuários | `npm run release:check`, manifest/package version e unzip integrity. |
| VS Code/VSCodium | Ativação e comandos reais | Smoke E2E nos dois editores, em diretórios isolados. |
| GitHub Actions | Autoridade de build/publish/smoke | CI, publish e `post-publish-smoke` com run IDs preservados. |
| Marketplace/Open VSX/GitHub Release | Distribuição pública produtiva | Versão exata, `preRelease=false` e asset VSIX. |

## Appendix

### Knowledge Base References

- `risk-governance.md` — categorias, owners, timelines e audit trail.
- `probability-impact.md` — score `P x I` e tratamento por faixa.
- `test-levels-framework.md` — adequação de unit/integration/E2E.
- `test-priorities-matrix.md` — P0–P3 separados de cronograma.
- `nfr-criteria.md` — limiares explícitos e UNKNOWN sem invenção.
- `playwright-cli.md` — verificação de indisponibilidade; não aplicável ao escopo nativo.

### Related Documents

- Retrospectiva: `_bmad-output/implementation-artifacts/epic-release-runtime-distribution-retro-2026-11-06.md`.
- Contexto: `docs/HANDOFF.md`, `vscode-extension/README.md`, `AGENTS.md`.
- Implementação: `vscode-extension/src/`, `vscode-extension/test/`, `vscode-extension/smoke/`, `vscode-extension/scripts/`.
- CI/distribuição: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`, `.github/workflows/post-publish-smoke.yml`.

**Gerado por:** BMad TEA Test Architect
**Workflow:** `bmad-testarch-test-design`
**Modo:** epic-level, execução sequencial
**Versão:** BMad v6 / workflow 5.0

## Review Findings

### Decision-needed

- [x] [Review][Decision] Dispatch manual cria tag/Release/VSIX — `.github/workflows/publish.yml:77-84`, `.github/workflows/post-publish-smoke.yml:59-67`. O caminho manual passa a usar `tag_name: v<version>` e `target_commitish: github.sha`, mantendo o smoke produtivo com asset rastreável.

### Patch findings

- [x] [Review][Patch] Integrar o ATDD P0 ao `release:check` — `vscode-extension/scripts/release-check.js:20-22`.
- [x] [Review][Patch] Tornar a validação de templates de chat fail-closed contra metacaracteres shell, sintaxes equivalentes de flags e comandos mutáveis customizados — `vscode-extension/src/core/commandSecurity.ts:44-55`, `vscode-extension/src/core/chat.ts:58-66`.
- [x] [Review][Patch] Validar o threshold Gate 2 antes de iniciar `executePlan`, evitando executar tarefas antes de rejeitar configuração inválida — `vscode-extension/src/core/executionService.ts:100-125,158-160`.
- [x] [Review][Patch] Tratar falhas de rede e impor timeout nas requisições do smoke — `vscode-extension/scripts/post-publish-smoke.js:49-55,95-103`.
- [x] [Review][Patch] Validar `--attempts` e `--interval-seconds` como argumentos positivos/finito antes do polling — `vscode-extension/scripts/post-publish-smoke.js:95-103,140`.
- [x] [Review][Patch] Verificar estado produtivo também no Marketplace, não apenas HTTP 200 e versão — `vscode-extension/scripts/post-publish-smoke.js:63-70`.
- [x] [Review][Patch] Adicionar casos executáveis para todas as flags read-only e variantes com `=` — `vscode-extension/test/core.test.js:407-414`.
- [x] [Review][Patch] Cobrir `Infinity` e `-Infinity` no contrato de threshold — `vscode-extension/test/core.test.js:132-148`.
- [x] [Review][Patch] Cobrir todos os engines conhecidos na migração de templates read-only — `vscode-extension/test/core.test.js:385-396`.
- [x] [Review][Patch] Impor timeout também na instalação/listagem dos editores — `vscode-extension/scripts/post-publish-smoke.js:25-26,113-115`.
- [x] [Review][Patch] Rejeitar total estimado não finito antes de permitir que Gate 2 retorne falso — `vscode-extension/src/core/estimator.ts:117-120`.

### Rejected

- `false`: `1.4.1` não é pre-release pela política atual; o minor é 4, portanto a alegação baseada em minor ímpar não se aplica.
- `false`: o smoke de runtime não precisa repetir os testes unitários de chat/Gate 2; esses critérios pertencem ao P0 e o smoke valida ativação real do editor.
- `false`: rejeitar `input_mode=file` sem materialização segura é comportamento explicitamente implementado e coberto, não ausência de funcionalidade.
- `false`: executar o smoke somente com validação VSIX é permitido pelo CLI; `--check-registries` e `--editor` são modos opcionais documentados.
- `false`: a alegação de incompatibilidade de `1.4.1` com pre-release confunde patch 1 com minor 1; `validate-version-policy.js` classifica minor 4 como release.
- `false`: a mesma alegação de pre-release foi repetida pelo acceptance auditor e pelo edge-case hunter; a refutação é a mesma.

### Review result

- Decision-needed resolvido: 1.
- Patch findings aplicados: 11.
- Findings adiados: 0.
- Findings rejeitados como falsos positivos: 6.
- Validação pós-correção: `npm run release:check` passou; `npm test` passou; ATDD P0 passou (9/9); smoke público produtivo de Open VSX, Marketplace e GitHub passou para `1.4.0`; validação negativa de `--interval-seconds` passou; `git diff --check` e parsing dos workflows YAML passaram.

### Post-publication closure — 2026-11-07

- `v1.4.1` foi publicada como release produtiva pelo GitHub Actions no run `42335548684`, com tag, GitHub Release e VSIX rastreável.
- O primeiro smoke pós-publicação (`42335609917`) falhou somente por propagação do Marketplace: Open VSX e GitHub já retornavam `1.4.1`, enquanto o Marketplace ainda retornava `1.4.0` após 20 tentativas.
- Após a convergência do índice, o retry manual `42336102851` passou integralmente: GitHub Release, Open VSX, Marketplace, VS Code e VSCodium.
- R-02, R-03 e R-04 possuem evidência produtiva; a pendência de execução no GitHub foi encerrada. R-09 foi mitigado com `overrides.minimatch = 11.0.5`; `npm audit --audit-level=moderate` passou sem vulnerabilidades, mantendo `@vscode/vsce` 4.1.0 e `ovsx` 1.3.0.
