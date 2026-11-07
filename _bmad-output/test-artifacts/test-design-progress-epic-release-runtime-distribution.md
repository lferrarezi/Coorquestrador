---
runScope: 'epic-level'
runKey: 'epic-release-runtime-distribution'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-11-06'
inputDocuments:
  - '_bmad/tea/config.yaml'
  - 'AGENTS.md'
  - 'README.md'
  - 'docs/HANDOFF.md'
  - 'vscode-extension/README.md'
  - '_bmad-output/implementation-artifacts/epic-release-runtime-distribution-retro-2026-11-06.md'
  - 'vscode-extension/package.json'
  - 'vscode-extension/src/'
  - 'vscode-extension/test/'
  - 'vscode-extension/smoke/'
  - 'vscode-extension/scripts/'
  - '.github/workflows/ci.yml'
  - '.github/workflows/publish.yml'
  - '.github/workflows/post-publish-smoke.yml'
---

# Detecção de modo

Modo selecionado: epic-level.

Épico operacional: `release-runtime-distribution`.

Justificativa: o objetivo corrente é validar runtime e distribuição da extensão VS Code, e a retrospectiva existente documenta esse ciclo entre `v1.3.3` e `v1.4.0`. Não há PRD/ADR nem histórias formais; portanto, o plano usará a retrospectiva, o contexto arquitetural, o código, os testes e os workflows como evidência. A ausência de critérios de aceite versionados será registrada como risco de testabilidade.

Pré-requisitos observados:

- Epic requirements: retrospectiva em `_bmad-output/implementation-artifacts/epic-release-runtime-distribution-retro-2026-11-06.md`.
- Architecture context: `AGENTS.md`, `README.md`, `docs/HANDOFF.md` e implementação em `vscode-extension/`.
- Existing stories/sprint status: ausentes.
- Current implementation target: `1.4.1` publicada produtivamente e validada pelo GitHub Actions.

Atualização pós-publicação (2026-11-07): o smoke inicial registrou atraso de propagação do Marketplace; o retry `42336102851` passou em registries, VS Code e VSCodium.

# Contexto carregado

Stack detectado: extensão TypeScript/Node.js, sem framework de frontend, backend ou mobile. A suíte atual é um runner assíncrono próprio em `vscode-extension/test/core.test.js`, com 43 casos, compilação TypeScript antes da execução e smoke runtime separado em `vscode-extension/smoke/runtime-test.js`.

Documentos e fontes carregados:

- `_bmad/tea/config.yaml` — execução automática, stack auto, artefatos em `_bmad-output/test-artifacts`.
- `AGENTS.md` — escopo, gates de CI/distribuição e comandos oficiais.
- `README.md`, `docs/HANDOFF.md` e `vscode-extension/README.md` — arquitetura e jornada operacional.
- `_bmad-output/implementation-artifacts/epic-release-runtime-distribution-retro-2026-11-06.md` — requisito operacional, riscos e evidências anteriores.
- `vscode-extension/package.json`, `src/`, `test/`, `smoke/` e `scripts/` — implementação e cobertura vigente.
- `.github/workflows/ci.yml`, `publish.yml` e `post-publish-smoke.yml` — gates de compilação, publicação e smoke pós-publicação.
- Conhecimento TEA: `risk-governance`, `probability-impact`, `test-levels-framework`, `test-priorities-matrix`, `nfr-criteria` e `playwright-cli`.

Cobertura observada:

- Cobertura determinística de core: ampla para DAG, validação, estimação, probes, persistência, segurança de comandos, reroteamento, revisão e chat fail-closed.
- Cobertura de runtime: teste real local em VS Code e VSCodium, com instalação do VSIX, ativação, registro de comandos e inicialização de `.coorq`.
- Cobertura de distribuição: script e workflow validaram VSIX, Marketplace, Open VSX e GitHub Release; o workflow pós-publicação passou no GitHub.
- Lacunas principais: ausência de critérios de aceite formais, flags de editor/runner dependentes de ambiente macOS e cobertura parcial de migrações/configurações customizadas.

# Riscos e testabilidade

## Método

O registro usa probabilidade e impacto de 1 a 3, com score `P x I`. Scores 6–8 exigem mitigação; score 9 bloqueia a liberação até resolução. Os riscos abaixo são limitados às declarações e evidências presentes na retrospectiva, no código e nos workflows carregados. Não são uma lista genérica de aflições de QA.

## Registro de riscos

| ID | Categoria | Risco baseado em evidência | P | I | Score | Tratamento, evidência e responsável | Horizonte |
|---|---|---|---:|---:|---:|---|---|
| R-01 | SEC | Um engine customizado pode reintroduzir chat mutável antes do Gate 1 por template inseguro, flag de permissão ampla ou modo de arquivo não controlado. A retrospectiva documenta o incidente com Devin; a implementação atual adicionou bloqueio fail-closed e testes. | 2 | 3 | 6 | Mitigar com `assertReadOnlyChatTemplate`, rejeição de flags perigosas, bloqueio de Devin sem template seguro, testes unitários e fixture de chat read-only. Responsável: maintainer da extensão. Evidência: `vscode-extension/src/core/{chat,commandSecurity,config}.ts`, `vscode-extension/test/core.test.js`, smoke de runtime. | Antes do próximo publish; monitorar em toda alteração de configuração. |
| R-02 | OPS | O workflow pós-publicação pode não ser executado ou pode divergir do comportamento local. | 2 | 3 | 6 | Mitigado com `post-publish-smoke.yml` acionado por `workflow_run` e dispatch manual, verificando GitHub Release, Open VSX, Marketplace, VS Code e VSCodium. Evidência: runs `42335609917` e `42336102851`; o primeiro falhou apenas por propagação e o retry passou. | Após mudanças no pipeline. |
| R-03 | TECH | Os CLIs e caminhos de instalação dos editores variam no macOS; o binário Homebrew `code` encontrado localmente não era o launcher do VS Code oficial, enquanto `code` e `codium` têm diferenças operacionais. | 3 | 2 | 6 | Mitigado para a matriz suportada com instalação, ativação e workspace temporário em VS Code e VSCodium no run `42336102851`. | Reavaliar se imagens macOS mudarem. |
| R-04 | OPS | Registries públicos podem responder antes de propagar a versão ou expor endpoints com identificadores distintos; o smoke precisou corrigir o namespace Open VSX e usar retry. | 2 | 3 | 6 | Mitigado com polling limitado, verificação de versão exata, estado produtivo e asset VSIX no GitHub Release. Evidência: falha de propagação no run `42335609917` e convergência no `42336102851`. | Após cada publish; falha após o limite deve impedir aceite. |
| R-05 | TECH | Migrações de configuração legada podem falhar para variantes de conteúdo ou wrappers customizados; a retrospectiva registra cobertura parcial. | 2 | 2 | 4 | Monitorar e ampliar a matriz de fixtures para templates legados, engines conhecidos e wrappers. Responsável: maintainer. Evidência: testes de configuração e diff do YAML carregado. | Próximo ciclo de manutenção; não bloquear 1.4.1 isoladamente. |
| R-06 | SEC | Limiares de segurança ausentes, nulos ou inválidos podem desabilitar o Gate 2 de forma silenciosa; a retrospectiva identifica essa lacuna. | 2 | 3 | 6 | Mitigar com validação fail-closed para `undefined`, `NaN`, negativo e zero, além de testes que comprovem bloqueio explícito. Responsável: maintainer de runtime. Evidência: testes de `commandSecurity` e logs de decisão do Gate 2. | Antes de considerar o hardening completo; pendência de implementação. |
| R-07 | TECH | A ausência de critérios de aceite e histórias formais reduz a rastreabilidade entre objetivo do épico, risco e evidência; o repositório não contém PRD/ADR/sprint-status aplicável. | 3 | 2 | 6 | Mitigar com esta matriz, IDs de risco estáveis, critérios de gate no plano e registro de evidências por execução. Responsável: maintainer/release. Evidência: este artefato e relatório retrospectivo versionado. | Imediato; manter até formalizar requisitos. |
| R-08 | OPS | O smoke depende de rede, propagação de registry, instalação de cask e execução de editor gráfico; pode falhar intermitentemente mesmo com artefato correto. | 2 | 2 | 4 | Monitorar com retries apenas para propagação, isolamento de diretórios temporários e diagnóstico de stdout/stderr. Não mascarar falhas de ativação com retry indiscriminado. Responsável: maintainer/release. | Toda execução CI; revisar após dois falsos positivos. |
| R-09 | OPS | A auditoria atual reporta vulnerabilidades moderadas transitivas em `minimatch`; aplicar `npm audit fix --force` pode fazer downgrade de `@vscode/vsce` e alterar a cadeia de empacotamento. | 2 | 2 | 4 | Monitorar no release check, sem downgrade forçado; abrir correção dedicada com verificação de compatibilidade. Responsável: maintainer de dependências. | Ciclo separado de dependências. |

## Avaliação de testabilidade

- **Controlabilidade: forte.** Os testes podem injetar runners, usar diretórios temporários, fixtures de configuração, VSIX local e os flags de isolamento de dados/extensões do editor.
- **Observabilidade: forte, com uma lacuna operacional.** O core expõe erros e decisões; o smoke registra versão, comandos, activation e status dos registries. O workflow novo ainda não publica um artefato consolidado de evidências, apenas logs; isso deve ser tratado como melhoria, não confundido com teste ausente.
- **Repetibilidade: moderada.** A suíte determinística é isolada; o smoke real depende de macOS, editores, rede e propagação pública. Retries limitados reduzem ruído, mas não provam causalidade quando uma falha persiste.
- **Isolamento: forte no local.** O smoke usa `user-data-dir`, `extensions-dir` e workspace temporários; não deve usar contas ou workspaces reais.
- **Diagnóstico: adequado.** Saída estruturada e verificações por etapa permitem separar artefato inválido, ativação quebrada, registry atrasado e release ausente.

## NFRs e limiares conhecidos

| Categoria | Limiar explícito encontrado | Estado de planejamento | Evidência prevista |
|---|---|---|---|
| Segurança | Nenhum limiar numérico; requisito qualitativo de chat read-only antes do Gate 1. | UNKNOWN; transformar em critério formal no próximo ciclo. | Testes de segurança de comando, fixture read-only e logs de decisão. |
| Confiabilidade | Nenhum SLO ou taxa de flakiness formal. | UNKNOWN; não inventar percentual. | Passes repetidos do smoke, logs e falhas classificadas. |
| Performance | Nenhum requisito de latência ou throughput. | Fora do escopo desta validação; timeouts do script são limites operacionais, não NFR de produto. | Medição futura somente se houver requisito. |
| Escalabilidade | Nenhum requisito aplicável ao escopo da extensão. | Fora do escopo. | Nenhuma evidência necessária neste épico. |
| Manutenibilidade | Nenhum limiar para compatibilidade de config customizada. | UNKNOWN; risco R-05. | Matriz de fixtures, testes de migração e revisão de diffs. |
| Compliance | Nenhuma obrigação regulatória específica identificada. | Fora do escopo; não fazer alegações não verificadas. | Auditoria de release e rastreabilidade GitHub, quando aplicável. |
| Operação/distribuição | Política operacional exige versionamento, CI e validação produtiva, mas sem janela/SLO formal. | Planejar gate qualitativo; R-02/R-04. | Workflow pós-publicação, GitHub Release, Marketplace e Open VSX. |

## Decisões de risco

R-01, R-06 e R-07 exigem cobertura explícita no plano seguinte. R-02, R-03 e R-04 foram mitigados com evidência produtiva em `42336102851`. R-05, R-08 e R-09 são monitoráveis, desde que não se convertam em falha de segurança, artefato incorreto ou publicação não rastreável. Nenhum risco recebe score 9 com a evidência atual.

# Plano de cobertura e estratégia de execução

P0–P3 são prioridades de risco e impacto, não a ordem de execução. A ordem operacional é PR → validação pós-publicação → suites noturnas/semanais quando houver custo real de ambiente ou rede.

## Matriz de cobertura

### P0 — crítico

| Cenário atômico | Nível | Risk Link | Contagem | Responsável | Notas |
|---|---|---|---:|---|---|
| Rejeitar template de chat com permissão mutável, `allow-all-tools`, sandbox amplo ou ausência de `chat_read_only`; Devin sem template seguro não pode executar chat. | Unit | R-01 | 5 | Dev | É lógica pura de segurança e deve falhar fechado; cobre flags e defaults sem duplicar o smoke real. |
| Impedir execução quando o limiar do Gate 2 é ausente, `NaN`, negativo ou zero inválido, com decisão observável. | Unit | R-06 | 4 | Dev | Cenários de borda determinísticos; a implementação atual cobre zero desabilitado, mas ainda requer explicitação para valores inválidos. |

**Total P0:** 9 testes; esforço de implementação/ajuste ~8–14 horas.

### P1 — alto

| Cenário atômico | Nível | Risk Link | Contagem | Responsável | Notas |
|---|---|---|---:|---|---|
| `release:check` compila TypeScript, executa testes, gera bundle, empacota VSIX e valida integridade/versão. | Integration | R-02, R-07 | 4 | Dev/Release | Integra filesystem, processo Node, `vsce` e política de versão; não repete cada teste unitário. |
| Instalar o VSIX produtivo em VS Code e VSCodium isolados, listar a versão exata e ativar a extensão em workspace temporário. | E2E/runtime | R-02, R-03 | 2 | QA/Release | Nível adequado porque só o editor real prova ativação e registro de comandos; matriz cobre os dois produtos suportados. |
| Confirmar ativação, comandos `coorq.newDemand`/`coorq.executeApproved` e criação de `.coorq` pelo runtime test. | E2E/runtime | R-02 | 2 | QA/Release | Jornada crítica de runtime; evita inferir ativação a partir de presença do arquivo VSIX. |
| Verificar Open VSX, Marketplace e GitHub Release com versão exata, estado produtivo e asset VSIX, tolerando somente propagação dentro do limite definido pelo workflow. | Integration/API | R-02, R-04 | 3 | Release | São integrações públicas; o endpoint e a resposta precisam ser observados, não simulados. |
| Garantir defaults seguros para Claude, Codex, Gemini e Copilot, e bloqueio do Devin; preservar configuração customizada compatível. | Unit | R-01, R-05 | 5 | Dev | Cobre a transformação de configuração sem duplicar a ativação no editor. |

**Total P1:** 16 testes; esforço ~16–28 horas.

### P2 — médio

| Cenário atômico | Nível | Risk Link | Contagem | Responsável | Notas |
|---|---|---|---:|---|---|
| Migrar configurações legadas com ausência de `chat_exec_template`, variações de indentação e engines conhecidos sem corromper YAML. | Unit | R-05 | 5 | Dev | Matriz de fixtures é suficiente; não requer editor real. |
| Descobrir CLIs e modelos por wrappers customizados, preservar redaction e manter fallback determinístico. | Unit | R-05 | 4 | Dev | Comportamento secundário e com workaround; testar apenas variantes observadas. |
| Diagnosticar retry de registry, resposta incompleta, release ausente e falha de editor sem transformar erro persistente em falso positivo. | Integration | R-04, R-08 | 4 | Dev/Release | Usa fixtures de resposta/processo; uma execução pública real permanece no P1. |
| Reportar dependências moderadas sem aplicar downgrade forçado de `vsce`/cadeia de empacotamento. | Integration/static | R-09 | 2 | Dev | Gate de manutenção; não bloqueia isoladamente o publish, salvo se o risco migrar para exploração ou quebra. |

**Total P2:** 15 testes; esforço ~10–18 horas.

### P3 — baixo

| Cenário atômico | Nível | Risk Link | Contagem | Responsável | Notas |
|---|---|---|---:|---|---|
| Conferir consistência de versão e instruções nos README/HANDOFF sem alterar o contrato runtime. | Unit/static | R-07 | 2 | Dev | Baixo impacto e correção manual simples; serve como higiene de release. |
| Explorar caminhos alternativos de launcher e mensagens de diagnóstico em macOS fora da matriz oficial. | E2E/runtime | R-03, R-08 | 2 | QA | Exploratório; não substituir a matriz oficial nem transformar todo ambiente local em requisito de publicação. |

**Total P3:** 4 testes; esforço ~2–5 horas.

## Cobertura NFR e evidências

| Categoria | Cenário(s) | Nível/ferramenta | Evidência para `nfr-assess` | Lacuna |
|---|---|---|---|---|
| Segurança | Chat read-only, flags perigosas, Gate 2 inválido | Unit + fixture de runtime | Relatório de testes, logs de decisão, fixture exato | Limite formal de segurança ainda UNKNOWN; R-01/R-06. |
| Confiabilidade | Ativação real, retry de registry, separação de falhas | E2E/runtime + integration | Logs CI, número de tentativas, status de cada registry/editor | SLO e taxa aceitável de flakiness UNKNOWN; R-02/R-08. |
| Performance | Nenhum cenário nesta versão | N/A | Nenhuma evidência até existir requisito | Não inventar latência/throughput. |
| Escalabilidade | Fora do escopo | N/A | Nenhuma | Extensão local e publicação de artefato não têm requisito de carga neste épico. |
| Manutenibilidade | Migração e wrappers customizados; release check | Unit + static/integration | Matriz de fixtures, logs de `release:check`, auditoria | Compatibilidade de config UNKNOWN; R-05. |
| Compliance | Rastreabilidade de versão, tag e release produtivo | Integration/CI | Run ID, tag, GitHub Release e asset | Nenhum requisito regulatório específico identificado. |

## Critérios de entrada

- Node.js 20, dependências instaladas e `npm run release:check` reproduzível.
- Fixtures temporárias sem contas, workspaces ou dados reais.
- Para runtime local: launcher oficial do VS Code e `codium` disponíveis; caminhos devem ser resolvidos explicitamente.
- Para validação produtiva: tag/release e VSIX publicados pelo workflow oficial, token somente com leitura para inspeção.
- Para aceitar a alteração de Gate 2: decisão documentada sobre os valores inválidos, pois o requisito ainda é uma lacuna de implementação.

## Critérios de saída

- P0: 100% passando.
- P1: ≥95% passando para o plano geral; para uma publicação produtiva, R-01, R-02, R-03, R-04, R-06 e R-07 devem estar mitigados ou formalmente dispensados com responsável e validade.
- Nenhuma falha de segurança aberta; nenhum VSIX com versão divergente; nenhum registry marcado produtivo sem evidência correspondente.
- Cobertura de caminhos críticos ≥80%, segurança 100%, lógica de negócio ≥70% e bordas ≥50%, conforme o template TEA.
- Evidência NFR identificada por categoria em escopo; julgamento PASS/CONCERNS/FAIL fica para `nfr-assess`.

## Estratégia PR / Nightly / Weekly

- **PR:** `npm run release:check`, todos os testes funcionais determinísticos, validação de bundle/VSIX e checagem estática dos scripts/workflows. Deve permanecer abaixo de 15 minutos.
- **Nightly:** smoke de editores em macOS quando houver runner disponível, incluindo VS Code e VSCodium, com diretórios isolados. Repetir apenas para investigar flakiness ou mudança de imagem.
- **Weekly:** validação pública com registry real, exploração de launchers macOS alternativos e auditoria de dependências. O workflow `workflow_run` também executa a validação produtiva após cada publish, portanto não é substituído pelo nightly.

## Estimativas de recurso

| Prioridade | Cenários planejados | Faixa de esforço |
|---|---:|---:|
| P0 | 9 | ~8–14 horas |
| P1 | 16 | ~16–28 horas |
| P2 | 15 | ~10–18 horas |
| P3 | 4 | ~2–5 horas |
| **Total** | **44** | **~36–65 horas; ~1–2 semanas** |

As faixas incluem fixtures, diagnóstico e integração CI; não presumem disponibilidade garantida de runner macOS ou propagação imediata de registries.

## Ordem de execução

1. Testes determinísticos P0 e `release:check`.
2. Smoke de VSIX/runtime local nos dois editores.
3. Publicação controlada e workflow pós-publicação no GitHub.
4. P2/P3 de migração, wrappers, dependências e exploração, sem reexecutar gates já aprovados sem mudança relevante.

# Geração e validação final

- Modo resolvido: `sequential` — configuração `auto`, sem necessidade de paralelização para um único plano epic-level.
- Artefato final: `_bmad-output/test-artifacts/test-design-epic-release-runtime-distribution.md`.
- Gate principal: P0 100%, P1 ≥95%, segurança 100% e mitigação de todos os riscos ≥6.
- Pendências de aceite: execução do workflow pós-publicação para `v1.4.1`, decisão formal sobre limiares inválidos do Gate 2 e aprovação dos responsáveis.
- Validação estrutural: frontmatter, seções do template, IDs R-01–R-09, matriz P0–P3, NFRs, estimativas em faixas, entry/exit criteria e referências foram conferidos.
- Artefatos temporários permanecem em `_bmad-output/test-artifacts/`; não houve sessão de navegador nem processo CLI persistente.
