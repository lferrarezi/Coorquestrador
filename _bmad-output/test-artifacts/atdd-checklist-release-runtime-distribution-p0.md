---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-06'
workflowType: 'testarch-atdd'
storyId: 'release-runtime-distribution.p0'
storyKey: 'release-runtime-distribution-p0'
storyFile: '_bmad-output/test-artifacts/test-design-epic-release-runtime-distribution.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-release-runtime-distribution-p0.md'
generatedTestFiles:
  - 'vscode-extension/test/atdd-release-runtime-distribution-p0.test.js'
inputDocuments:
  - '_bmad/tea/config.yaml'
  - '_bmad-output/test-artifacts/test-design-epic-release-runtime-distribution.md'
  - 'vscode-extension/package.json'
  - 'vscode-extension/test/core.test.js'
  - 'vscode-extension/src/core/estimator.ts'
  - 'vscode-extension/src/core/executionService.ts'
  - '.agents/skills/bmad-testarch-atdd/checklist.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md'
acceptanceCriteria:
  - id: 'AC-1'
    idSource: generated
    text: 'Templates de chat mutáveis, com flags de permissão ampla ou sandbox inseguro, devem ser recusados antes da execução.'
  - id: 'AC-2'
    idSource: generated
    text: 'Templates de chat sem a marcação chat_read_only devem ser recusados antes da execução.'
  - id: 'AC-3'
    idSource: generated
    text: 'O engine Devin não deve executar chat quando não possui template seguro configurado.'
  - id: 'AC-4'
    idSource: generated
    text: 'O modo input_mode=file não deve executar chat quando não houver contrato seguro para materializar o arquivo de especificação.'
  - id: 'AC-5'
    idSource: generated
    text: 'Defaults de engines conhecidos devem permanecer read-only e não reintroduzir flags mutáveis durante a migração de configuração.'
  - id: 'AC-6'
    idSource: generated
    text: 'Um limiar Gate 2 ausente deve resultar em decisão explícita e segura, sem desabilitação silenciosa.'
  - id: 'AC-7'
    idSource: generated
    text: 'Um limiar Gate 2 NaN deve resultar em decisão explícita e segura, sem desabilitação silenciosa.'
  - id: 'AC-8'
    idSource: generated
    text: 'Um limiar Gate 2 negativo deve resultar em decisão explícita e segura, sem desabilitação silenciosa.'
  - id: 'AC-9'
    idSource: generated
    text: 'Um limiar Gate 2 zero deve seguir a regra formal registrada, com decisão observável e sem ambiguidade.'
---

# ATDD Checklist — Epic release-runtime-distribution, P0

**Data:** 2026-11-06
**Autor:** Luiz
**Primary Test Level:** Unit — runner Node.js nativo do projeto

## Preflight e decisão de contexto

O repositório não contém uma story BMM independente nem configuração Playwright/Cypress. O contrato de teste utilizado é o plano epic-level aprovado em `test-design-epic-release-runtime-distribution.md`, especificamente os nove cenários P0 de R-01 e R-06. Essa é uma adaptação explícita para uma extensão VS Code nativa; não é uma story inventada retroativamente.

O runner existente é `vscode-extension/test/core.test.js`, executado após compilação TypeScript. Não serão criadas factories Faker, fixtures Playwright, `data-testid` ou mocks HTTP: os cenários são lógica pura de segurança e decisão de Gate 2, e tais artefatos seriam ornamento processual sem utilidade técnica.

## Acceptance Criteria

| ID | ID source | Acceptance criterion |
|---|---|---|
| AC-1 | generated | Templates de chat mutáveis, com flags de permissão ampla ou sandbox inseguro, devem ser recusados antes da execução. |
| AC-2 | generated | Templates de chat sem `chat_read_only` devem ser recusados antes da execução. |
| AC-3 | generated | Devin não deve executar chat sem template seguro. |
| AC-4 | generated | `input_mode=file` não deve executar chat sem contrato seguro de materialização. |
| AC-5 | generated | Defaults conhecidos permanecem read-only durante migração. |
| AC-6 | generated | Limiar Gate 2 ausente gera decisão explícita e segura. |
| AC-7 | generated | Limiar Gate 2 `NaN` gera decisão explícita e segura. |
| AC-8 | generated | Limiar Gate 2 negativo gera decisão explícita e segura. |
| AC-9 | generated | Limiar Gate 2 zero segue regra formal, com decisão observável. |

## Story Integration Metadata

- **Story ID:** `release-runtime-distribution.p0`
- **Story Key:** `release-runtime-distribution-p0`
- **Story File:** `_bmad-output/test-artifacts/test-design-epic-release-runtime-distribution.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-release-runtime-distribution-p0.md`
- **Source contract:** P0 / R-01 / R-06 do test design.

## Generation Mode

**Modo escolhido:** AI generation, sequencial e baseado no código/contrato existente.

Não há UI web para gravação, e o `playwright-cli` não é aplicável ao runtime nativo da extensão. Os scaffolds serão gerados como testes Node.js `node:test`, usando o runner/artefatos TypeScript já existentes e marcados com `test.skip()` até a ativação deliberada de cada critério.

## Test Strategy

### Nível primário

**Unit (Node.js/TypeScript compilado):** os nove critérios exercitam funções puras ou carregamento controlado de configuração. Não há API, banco, rede ou jornada visual que justifique E2E neste bloco P0. O runtime E2E dos editores permanece coberto pelo smoke P1 do test design.

### Mapeamento de critérios para scaffolds

Cada critério terá exatamente um leaf red-phase. Casos adicionais ficam registrados para a fase green e não serão emitidos como folhas duplicadas.

| ID | Prioridade | Cenário primário | Primeira asserção definidora | Branches para green |
|---|---|---|---|---|
| AC-1 | P0 | `runChat` recusa `--permission-mode auto`. | Erro de recusa de permissão mutável. | `--allow-all-tools`, `--approval-mode yolo`, sandbox `workspace-write`/`danger-full-access`. |
| AC-2 | P0 | `runChat` recusa template sem `chat_read_only: true`. | Erro de template não read-only. | `chat_read_only: false`, campo ausente. |
| AC-3 | P0 | Configuração padrão do Devin não possui chat executável. | `chat_exec_template === undefined`. | Config legado Devin com template mutável deve ser limpo. |
| AC-4 | P0 | `runChat` recusa `input_mode=file` sem contrato de materialização seguro. | Erro específico de `input_mode=file`. | Arquivo inexistente, caminho fora do workspace e template sem `{spec_file}`. |
| AC-5 | P0 | Defaults conhecidos permanecem read-only após carregar/migrar configuração. | `chat_read_only === true` no engine seguro. | Claude, Codex, Gemini, Copilot e ausência de campos legados. |
| AC-6 | P0 | Gate 2 com threshold ausente não é desabilitado silenciosamente. | Decisão explícita de configuração inválida. | Campo omitido no YAML e objeto parcial em memória. |
| AC-7 | P0 | Gate 2 com threshold `NaN` não é desabilitado silenciosamente. | Decisão explícita de configuração inválida. | String não numérica e resultado de parse inválido. |
| AC-8 | P0 | Gate 2 com threshold negativo não é desabilitado silenciosamente. | Decisão explícita de configuração inválida. | `-1`, `-0.01` e threshold de quota negativo. |
| AC-9 | P0 | Gate 2 com threshold zero segue regra formal e expõe decisão observável. | Resultado/decisão explícita de zero desabilitado ou inválido. | Custo zero, custo positivo e threshold de quota zero. |

### Red-phase

Os nove scaffolds foram inicialmente gerados como `test.skip()` e ativados durante o ciclo red→green. Cada um chama a implementação real compilada, sem mock que torne o critério artificialmente verde. AC-6–AC-9 agora usam `validateGate2Threshold`; zero é válido, desabilita o Gate 2 e produz motivo explícito.

## Red-Phase Test Scaffolds Created

### Unit Tests (9 testes)

**File:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

Todos os leaves usam `test.skip()` e carregam exatamente um ID `AC-n` no título.

- ✅ **[P0] AC-1 recusa chat com permissão mutável** — R-01; regressão de `runChat`/`assertReadOnlyChatTemplate`.
- ✅ **[P0] AC-2 recusa chat sem declaração read-only** — R-01; regressão do contrato `chat_read_only`.
- ✅ **[P0] AC-3 bloqueia Devin sem template de chat seguro** — R-01; regressão da configuração fail-closed.
- ✅ **[P0] AC-4 bloqueia chat em `input_mode=file` sem materialização segura** — R-01; regressão do modo de entrada.
- ✅ **[P0] AC-5 preserva defaults read-only na migração** — R-01; regressão de config conhecida.
- ✅ **[P0] AC-6 rejeita threshold Gate 2 ausente com decisão explícita** — R-06; retorna decisão inválida e bloqueada.
- ✅ **[P0] AC-7 rejeita threshold Gate 2 NaN com decisão explícita** — R-06; retorna decisão inválida e bloqueada.
- ✅ **[P0] AC-8 rejeita threshold Gate 2 negativo com decisão explícita** — R-06; retorna decisão inválida e bloqueada.
- ✅ **[P0] AC-9 torna observável a regra do threshold Gate 2 zero** — R-06; retorna `enabled=false` com motivo explícito.

**Worker E2E:** nenhum arquivo emitido. O worker registrou `tests: []` porque E2E de editor pertence ao P1 e já está coberto pelo smoke `vscode-extension/scripts/post-publish-smoke.js`; nenhum teste de navegador seria tecnicamente válido para estes critérios.

**Fallback de geração:** o worker unitário permaneceu pendente e foi encerrado; o scaffold foi gerado sequencialmente pelo agente principal, preservando o contrato red-phase e a mesma lista de critérios. Isso é registrado para não transformar uma falha de orquestração em falsa evidência de paralelismo.

## Data Factories Created

Nenhuma. Os cenários usam configurações pequenas e determinísticas; Faker acrescentaria variabilidade sem valor para validação de segurança.

## Fixtures Created

Nenhuma fixture compartilhada. Cada cenário que precisa de configuração cria um diretório temporário isolado e remove-o em `finally` quando ativado.

## Mock Requirements

Nenhum endpoint externo ou processo real é necessário no P0. `runChat` falha antes de criar um processo nos cenários de segurança; Gate 2 será validado por API pura.

## Required data-testid Attributes

Nenhum. Não há interface visual neste bloco. Os comandos/editor runtime permanecem no smoke E2E P1.

## Implementation Checklist

### AC-1 a AC-5 — regressões de segurança de chat

**File:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

- [x] Remover `test.skip()` de um critério por vez.
- [x] Executar `npm run compile` antes de ativar o teste.
- [x] Confirmar que AC-1–AC-5 continuam verdes com `runChat`, `CoorqConfig` e defaults atuais.
- [x] Expandir os branches registrados no bloco green: flags `allow-all-tools`, `yolo`, sandbox amplo, campo ausente e config legada Devin.
- [x] Marcar cada teste após a regressão passar.

**Esforço estimado:** ~2–4 horas.

### AC-6 — threshold ausente

**File:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

- [x] Definir a API/resultado de validação de threshold e sua mensagem auditável.
- [x] Implementar comportamento fail-closed para campo ausente.
- [x] Remover `test.skip()` e confirmar RED antes da implementação.
- [x] Implementar o mínimo para GREEN e executar o teste.
- [x] Marcar o teste após a decisão ser observável.

**Esforço estimado:** ~2–4 horas.

### AC-7 — threshold NaN

**File:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

- [x] Definir conversão/validação sem permitir `NaN` passar como threshold.
- [x] Remover `test.skip()`, confirmar RED, implementar e confirmar GREEN.
- [x] Cobrir o branch representativo de tipo não numérico.

**Esforço estimado:** ~1–2 horas.

### AC-8 — threshold negativo

**File:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

- [x] Definir negativo como erro de configuração e registrar o motivo.
- [x] Remover `test.skip()`, confirmar RED, implementar e confirmar GREEN.
- [x] Cobrir o branch representativo `-1`; `-0.01` permanece extensão opcional.

**Esforço estimado:** ~1–2 horas.

### AC-9 — threshold zero

**File:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

- [x] Decidir formalmente que zero significa “desabilitado”.
- [x] Expor a decisão por `enabled=false` e `reason` explícito.
- [x] Remover `test.skip()`, confirmar RED, implementar e confirmar GREEN.
- [x] Preservar o teste existente `crossesGate2 treats zero threshold as disabled`.

**Esforço estimado:** ~2–4 horas.

## Running Tests

```bash
# Compilar o core antes de ativar scaffolds
cd vscode-extension && npm run compile

# Executar somente os scaffolds; todos permanecem skipped até ativação
cd vscode-extension && node --test test/atdd-release-runtime-distribution-p0.test.js

# Executar um cenário ativado pelo nome
cd vscode-extension && node --test --test-name-pattern='AC-6' test/atdd-release-runtime-distribution-p0.test.js

# Regressão completa do projeto
cd vscode-extension && npm test
```

Não há modo headed, cobertura Playwright ou debug de navegador para este artefato. O smoke de editor é separado e pertence ao P1.

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

- ✅ Nove folhas foram criadas como `test.skip()` e ativadas progressivamente.
- ✅ Cada folha tem exatamente um critério `AC-n`.
- ✅ AC-6–AC-9 fecharam a lacuna do Gate 2.
- ✅ AC-1–AC-5 preservaram as regressões de segurança.
- ✅ Nenhuma factory, fixture web, mock HTTP ou seletor fictício foi criado.

### GREEN Phase — Complete ✅

1. Decisão formal do threshold zero registrada como “desabilitado, com motivo explícito”.
2. AC-1–AC-9 ativados progressivamente após RED.
3. Implementação mínima concluída em `estimator.ts`.
4. Teste isolado e `npm test` aprovados.
5. Branches adicionais permanecem opcionais, sem duplicar P0.

### REFACTOR Phase — DEV

Após todos os P0 passarem, extrair helper de validação/decisão somente se isso não ocultar o motivo de bloqueio. Executar `npm test` após cada refatoração e atualizar o test design se o contrato mudar.

## Summary

- **Story ID:** `release-runtime-distribution.p0`
- **Primary level:** Unit / Node.js nativo
- **Unit tests:** 9, 9 aprovados
- **API tests:** 0 — não há API HTTP
- **E2E tests:** 0 neste bloco — runtime de editor é P1
- **Factories:** 0
- **Fixtures:** 0 compartilhadas
- **Mocks externos:** 0
- **data-testid:** 0
- **Implementation task groups:** 4
- **Esforço:** ~6–12 horas
- **Saída:** `vscode-extension/test/atdd-release-runtime-distribution-p0.test.js`

## Next Steps

1. Executar `npm run release:check`.
2. Atualizar o test design com a mitigação R-06 concluída.
3. Avançar para o smoke produtivo P1 no GitHub Actions após publicação controlada.

## Knowledge Base References Applied

- `data-factories.md` — avaliado; não aplicável a lógica determinística sem entidades.
- `component-tdd.md` — avaliado; não há componente web neste escopo.
- `test-quality.md` — aplicado: Given/When/Then, isolamento, determinismo e primeira asserção definidora.
- `test-healing-patterns.md` — aplicado por evitar retries, sleeps e dependências de ambiente.
- `test-design-epic-release-runtime-distribution.md` — fonte dos riscos R-01/R-06 e dos nove critérios P0.

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Status:** scaffolds criados, ativados progressivamente e verificados com sucesso.

**Comando após geração:**

```text
cd vscode-extension && node --test test/atdd-release-runtime-distribution-p0.test.js
```

**Resultado observado:** 9 pass, 0 fail, 0 skipped após ativação completa.

**Regressão do projeto:** `npm test` passou com todos os casos existentes, incluindo a validação e o fail-closed do Gate 2.

## Validation Completion

- Validação estática: aprovada.
- Folhas red-phase: 9/9 foram geradas com `test.skip()`; 9/9 ativadas e aprovadas.
- Critérios: AC-1–AC-9, cada um exatamente uma vez.
- Placeholders: nenhum.
- Execução do scaffold ativado: 9 pass, 0 fail, 0 skipped.
- Sessões de navegador: nenhuma criada.
- Artefatos temporários: apenas o fallback do worker E2E em `/tmp`; o worker unitário pendente foi encerrado e não deixou alteração no repositório.
- Próximo workflow recomendado: `npm run release:check` e, após publicação, smoke P1 de runtime/distribuição.
