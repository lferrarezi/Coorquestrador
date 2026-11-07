---
epic: release-runtime-distribution
date: 2026-11-06
verdict: accepted-with-open-items
criteria: profiled
headless: false
---

# Retrospectiva — Release, runtime e distribuição

## Epic summary

Escopo confirmado pelo usuário: ciclo operacional entre `v1.3.3` e `v1.4.0` da extensão VS Code, cobrindo runtime, gates HITL, empacotamento e distribuição.

Não há `sprint-status.yaml`, histórias formais, especificação de épico ou retrospectiva anterior detectável. A completude por histórias não pôde ser executada; o escopo foi aceito interativamente como um épico operacional de release.

### Evidência disponível

- Diff range: `23c7a4d^..151bd17`.
- Commits: `23c7a4d`, `26b1554`, `151bd17`.
- Evidência determinística: `/tmp/coorq-retro-git-evidence.json`.
- Código, testes, workflow e `docs/HANDOFF.md`.
- Evidência de CI/publicação: GitHub Actions `42249024211` e `42249021519`.
- Evidência de runtime: fixture temporário `/tmp/coorq-walkthrough.N0N4Uo/workspace`, logs em `.coorq/logs/` e validação de interface nos editores locais.

### Evidência ausente

- Não há logs de sessões BMAD ou histórias individuais; lições de processo foram inferidas somente de commits, testes, runtime observado e logs do fixture.
- Não há critérios de aceite declarados para este épico; o veredito é profiled a partir do objetivo de validar runtime e distribuição.

## Findings

### Aggregate views

#### Architecture delta

- A separação entre `exec_template` e `chat_exec_template` foi adicionada em `23c7a4d`, com modos de conversa somente leitura em `vscode-extension/src/core/chat.ts` e `vscode-extension/src/core/config.ts`.
- A alteração preserva o executor determinístico e impede que o chat reutilize o template de execução antes do Gate 1. Fonte: `23c7a4d`, `vscode-extension/src/core/chat.ts`.

#### Duplication map

- Templates seguros conhecidos são definidos no YAML padrão e repetidos no fallback de migração em memória. Isso é deliberado para compatibilidade com `.coorq/engines.yaml` antigo, mas cria dois pontos de manutenção. Fonte: `vscode-extension/src/core/config.ts`.
- Disposição: deferir; extrair uma tabela única em uma próxima história de configuração.

#### God-class / size growth

- O ranking de churn apontou `vscode-extension/dist/extension.js` como maior arquivo alterado, mas o churn é bundle gerado, não crescimento estrutural do código-fonte. Fonte: `/tmp/coorq-retro-git-evidence.json`.
- `vscode-extension/src/core/config.ts` e `vscode-extension/test/core.test.js` concentram mudanças relevantes, sem evidência suficiente para classificá-los como god classes. Disposição: aceitar como-is.

#### Pattern divergence

- A política de versão foi respeitada ao migrar de `1.3.6` pre-release para `1.4.0` produtivo. Fonte: `vscode-extension/scripts/validate-version-policy.js`, commit `151bd17`.
- O handoff documental ficou desatualizado em relação ao estado real `1.4.0`. Fonte: `docs/HANDOFF.md`.

#### Spec-to-implementation reconciliation

- O objetivo runtime/distribuição foi atendido operacionalmente, mas não existe especificação formal com critérios versionados para comparação. Disposição: reconciliar em uma especificação futura de release/runtime.

### Diff-scope review

O review adversarial, de casos-limite e de lacunas de verificação foi executado sobre `23c7a4d^..151bd17`; seus achados consolidados estão abaixo e mantêm a referência ao código ou ao log primário.

#### Findings consolidados

1. **Chat Devin não é somente leitura.** Local: `vscode-extension/src/core/config.ts:104` e fallback em `:364`. Gatilho: o chat usa `--permission-mode auto`. Correção: substituir por um modo explicitamente read-only suportado pelo CLI ou bloquear o engine no chat. Consequência: uma conversa pode alterar o workspace antes do Gate 1.
2. **Templates customizados não têm política de capacidade.** Local: `vscode-extension/src/core/chat.ts:46-52`. Gatilho: a validação verifica placeholders, mas não comprova que `chat_exec_template` seja read-only. Correção: exigir capability declarada e validar flags por engine; rejeitar templates não comprovados. Consequência: o prompt textual pode ser ignorado por um template mutável.
3. **`input_mode=file` produz comando de chat sem arquivo.** Local: `vscode-extension/src/core/chat.ts:53-60`. Gatilho: `{spec_file}` é substituído por string vazia e nenhum arquivo temporário é criado. Correção: criar arquivo temporário dentro do workspace permitido ou rejeitar chat em modo `file`. Consequência: comando inválido, prompt perdido ou comportamento dependente do CLI.
4. **Wrappers legítimos são classificados pelo nome do binário.** Local: `vscode-extension/src/core/prober.ts:261-267`. Gatilho: qualquer `bin` contendo `codex`, `copilot` ou `gemini` ignora `models_probe`. Correção: usar IDs/capability explícitos, não substring do caminho. Consequência: engines customizados deixam de descobrir modelos válidos.
5. **Migração Codex depende de regex estreita.** Local: `vscode-extension/src/core/config.ts:329-337`. Gatilho: variações de espaçamento, prefixo ou flags não coincidem com `codex exec -m {model}`. Correção: normalizar o comando ou versionar o schema de configuração. Consequência: configuração antiga mantém modelos obsoletos e falha apenas na execução.
6. **Migração Copilot depende de um caminho textual específico.** Local: `vscode-extension/src/core/config.ts:338-345`. Gatilho: ausência ou renomeação de `session-store.db` impede a migração de modelos stale. Correção: detectar a forma antiga por schema/flags, com teste de variantes. Consequência: o planner pode continuar escolhendo modelo indisponível.
7. **Threshold inválido desativa silenciosamente o Gate 2.** Local: `vscode-extension/src/core/estimator.ts:77-80`. Gatilho: `undefined`, `NaN` ou valor negativo torna a expressão falsa. Correção: validar `cost_gate2_threshold` como número não negativo e falhar fechado quando inválido. Consequência: uma configuração corrompida remove uma revisão humana prevista.
8. **O contrato de dependências externas é textual, não uma invariável única.** Local: `vscode-extension/src/core/planner.ts:50-52` e `planValidation.ts:111-117`. Gatilho: a validação aceita qualquer ID presente em `satisfiedDependencyIds`; não há distinção de namespace entre tarefa concluída e estado externo. Correção: validar IDs de tarefa contra um formato/registro explícito e manter estados de gate fora de `dependsOn`. Consequência: uma dependência de gate pode ser confundida com tarefa satisfeita em um fluxo de replanejamento.
9. **O fallback de chat só cobre engines conhecidas.** Local: `vscode-extension/src/core/config.ts:361-369`. Gatilho: um engine configurado pelo usuário sem `chat_exec_template` não recebe fallback. Correção: declarar a capacidade como obrigatória ou exibir bloqueio explicável na UI. Consequência: chat indisponível para engines customizadas sem indicação antecipada.
10. **A verificação de descoberta não cobre o consumidor.** Local: `vscode-extension/test/core.test.js:325-338`. Gatilho: o teste verifica apenas que `discoverModels` retorna `[]`, não que `detectInstalled` preserve os modelos declarados. Correção: testar a cadeia `detectInstalled`/`applyCliDiscoveryToEnginesFile`. Consequência: uma alteração pode deixar o engine sem modelos apesar de os fallbacks existirem.
11. **A suíte não executa `runChat` com os quatro modos relevantes.** Local: `vscode-extension/test/core.test.js:365-375`. Gatilho: o teste inspeciona strings de configuração, mas não observa o processo spawnado nem o comportamento de bloqueio. Correção: usar CLIs-fixture e afirmar comando, entrada, ausência de escrita e falha fechada. Consequência: `auto` ou flags destrutivas podem voltar sem quebrar os testes.
12. **A distribuição pública não tem smoke test automatizado.** Local: workflow `publish` e evidência operacional. Gatilho: CI confirma build/VSIX e o workflow confirma publicação, mas não instala e exerce a extensão em VS Code/VSCodium nem verifica os três endpoints públicos. Correção: adicionar job pós-publicação com instalação, manifesto, runtime mínimo e polling de registries. Consequência: publicação verde pode coexistir com artefato inutilizável ou ainda não propagado.

Os itens 1, 2, 3 e 7 são os mais diretamente relacionados à segurança operacional do objetivo; os itens 10-12 são lacunas de verificação, não falhas demonstradas no runtime atual.

## Behavior verification

- Chat livre no VS Code recusou criar `chat-guard-proof.txt` e apresentou a alteração como proposta aguardando Gate 1. Fonte: fixture `/tmp/coorq-walkthrough-final.8HjC7Z/workspace`.
- Planejamento limpo produziu uma etapa válida sem dependência externa; execução aprovada criou exatamente `clean-runtime-proof.txt`, com 16 bytes, sem newline final. Fonte: `/tmp/coorq-walkthrough.N0N4Uo/workspace/.coorq/state/demands.json` e `.coorq/logs/T-1793979480765/T1.log`.
- A extensão `1.4.0` foi instalada e detectada no VS Code e no VSCodium pelos respectivos CLIs.
- CI passou em `42249024211`; publicação passou em `42249021519`, incluindo Marketplace, Open VSX e GitHub Release.
- O GitHub Release `v1.4.0` foi verificado como `isPrerelease: false`; o VSIX do Marketplace apresentou `Version="1.4.0"`.
- O endpoint público do Open VSX foi rechecado em 2026-11-06: versão `1.4.0`, `preRelease: false`, `versionAlias: ["latest"]`, HTTP 200.

## Previous-retro follow-through

Não há retrospectiva anterior nem `sprint-status.yaml` para acompanhamento de action items.

## Action items

1. Atualizar `docs/HANDOFF.md` para refletir `v1.4.0`, o chat read-only, a política produtiva e os gates atuais. Owner: documentação/maintainer. Disposição: fix now.
2. Criar uma especificação formal de release/runtime com critérios declarados e matriz de evidências. Owner: PM/QA. Disposição: deferir para o próximo ciclo.
3. Extrair os templates seguros de engine para uma única fonte de configuração, preservando a migração em memória. Owner: dev. Disposição: deferir.
4. Automatizar smoke test de instalação e runtime nos dois editores macOS, incluindo verificação pública dos três registries. Owner: QA/CI. Disposição: fix now.
5. Acompanhar a vulnerabilidade moderada transitiva de `minimatch` em `vsce/ovsx` sem aplicar `npm audit fix --force` sem análise de compatibilidade. Owner: maintainer/dependabot. Disposição: deferir com monitoramento.
6. Corrigir ou bloquear o template de chat do Devin e introduzir uma política explícita de capacidade read-only para templates customizados. Owner: dev/security. Disposição: fix now.
7. Validar thresholds de custo antes do cálculo e cobrir `undefined`, `NaN`, negativo e zero com testes. Owner: dev/QA. Disposição: fix now.

## Acceptance verdict

**accepted-with-open-items** — critérios profiled.

O runtime foi exercitado além da compilação, os gates foram observados, o artefato produtivo `1.4.0` foi instalado localmente e a automação de CI/publicação passou. Permanecem itens documentais, automatização de smoke test e risco transitivo de dependência; nenhum bloqueia o release produtivo atual.

## Follow-up executado

- O item de documentação foi atualizado para refletir `1.4.0` produtiva e `1.4.1` em preparação.
- O item de segurança do chat foi corrigido: Devin não recebe mais template de conversa e templates precisam declarar `chat_read_only`, com bloqueio de flags mutáveis conhecidas.
- O smoke test foi automatizado em `vscode-extension/scripts/post-publish-smoke.js` e `.github/workflows/post-publish-smoke.yml`, cobrindo VSIX, ativação no VS Code/VSCodium, Marketplace, Open VSX e GitHub Release.
- A validação local passou nos dois editores com VSIX `1.4.1`; a validação pública passou para a versão produtiva `1.4.0`.
- `1.4.1` ainda não foi publicada nem versionada em tag; permanece pronta para o próximo ciclo de release após revisão do diff.

## Open questions

- O projeto deve adotar formalmente “release operacional” como épico BMAD, ou criar épicos/story files para cada próximo incremento?
- A propagação dos registries deve ser um critério de aceite bloqueante ou apenas uma verificação pós-publicação?

## Assumptions

- O ciclo `v1.3.3 → v1.4.0` foi tratado como épico operacional porque o usuário aprovou explicitamente essa unidade após a ausência de artefatos formais.
- A ausência de `sprint-status.yaml` foi aceita; nenhum status de sprint foi criado ou alterado.
- A verificação Open VSX foi feita novamente após a publicação; a propagação está concluída para `1.4.0`.
