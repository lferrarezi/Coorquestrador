# Coorquestrador

Meta-orquestrador de **runtime de execução**. Fica uma camada **acima** do `squad-orchestrator`: enquanto este decide *quais agentes especialistas* entram numa demanda, o Coorquestrador decide *qual engine de IA externo (CLI) executa o trabalho*, com qual modelo e potência, a que custo, em qual projeto e em que ordem (sequencial ou paralela).

## O que ele faz

```
DEMANDA
 → analisa  → planeja (atividades→tarefas→DAG)
 → probe de engines (disponibilidade + crédito, modo híbrido)
 → roteia (engine + modelo + potência por tarefa)
 → estima custo (por tarefa + total)
 → monta pacote SDD/Spec + comando CLI
 == GATE HITL 1: aprovar plano + custo ==     ← obrigatório na v1
 → executa via CLI local (paralelo onde o DAG permite)
 → revisa (gate de qualidade)
 == GATE HITL 2: aprovar entrega (se houver impacto) ==
 → atualiza a lista de demandas (status + custo real)
```

Engines suportados (declarados em `engines.yaml`): **claude-code, codex, kiro, devin-cli, gemini-cli, github-copilot-cli**. Modelos e potências (low/normal/medium/high) configuráveis por engine.

## Estrutura do pacote

```
agent/coorquestrador.agent.md      → o agente (raciocínio de planejamento), padrão .agent.md
config/engines.yaml                → engines declarados + probe + template de execução CLI
config/cost-table.yaml             → preços por modelo/potência + tamanhos por classe de tarefa
config/coorq-hitl-gates.yaml       → gates HITL (Gate 1 obrigatório)
skills/demand-planning/SKILL.md    → demanda → tarefas atômicas + DAG
skills/engine-routing/SKILL.md     → escolha de engine + modelo + potência
skills/cost-estimation/SKILL.md    → fórmula de custo estimado vs real
vscode-extension/                  → extensão VSCode (núcleo TS + gates + estado)
sample-root/.coorq/                → exemplo da estrutura de runtime na raiz multiprojetos
```

## Decisões de arquitetura (v1)

| Decisão | Escolha |
|---|---|
| Descoberta de engines | **Híbrida**: `engines.yaml` declara; o `prober` valida em runtime (probe + credit_probe) |
| Automação | **HITL em gates**: Gate 1 (plano+custo) sempre exige aprovação antes de gastar crédito |
| Motor de planejamento | **Agente `.agent.md`** invocado via CLI do `plannerEngine` |
| Formato inicial | **Extensão VSCode** (depois: app solo, bot Telegram) |

## Instalação da extensão (passo a passo)

1. **Pré-requisitos**: Node.js 18+, VSCode 1.90+, e os CLIs dos engines que você for usar instalados e autenticados (`claude`, `codex`, `kiro`, `devin`, `gemini`, `copilot`).

2. **Instalar dependências e compilar**:
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   ```

3. **Rodar em modo dev**: abra a pasta `vscode-extension` no VSCode e pressione `F5` (Extension Development Host). Para empacotar um `.vsix`: `npm run package` (requer `@vscode/vsce`).

4. **Preparar a raiz multiprojetos**: crie uma pasta raiz onde cada subpasta direta é um projeto. Dentro dela, crie `.coorq/` copiando o conteúdo de `sample-root/.coorq/` (engines, cost-table, gates, agent, state).
   ```bash
   mkdir -p /caminho/raiz/.coorq
   cp -r sample-root/.coorq/* /caminho/raiz/.coorq/
   ```

5. **Configurar a extensão** (Settings → Coorquestrador):
   - `coorq.rootPath`: caminho da raiz multiprojetos.
   - `coorq.plannerEngine`: engine que roda o agente planejador (padrão `claude-code`).
   - `coorq.maxParallel`: execuções simultâneas (padrão 3).
   - `coorq.requireGate1`: mantenha `true` na v1.

6. **Ajustar os engines reais**: edite `.coorq/engines.yaml`:
   - Confirme o `bin`, `input_mode` e `exec_template` de cada CLI conforme a sintaxe real.
   - Preencha `credit_probe.command` com o comando de saldo/cota de cada engine (ex.: `devin acu --json`). Onde não houver, o custo real cai para o estimado.
   - Ajuste `cost-table.yaml` com seus preços de contrato (os atuais são **placeholders**).

## Uso (passo a passo)

1. **Probe**: `Coorquestrador: Probe de engines` → mostra disponibilidade e crédito de cada CLI; lista os elegíveis para roteamento.
2. **Planejar**: `Coorquestrador: Planejar demanda` → escolha o projeto, dê título e descrição. O agente analisa, quebra em tarefas, roteia engine/modelo/potência e estima o custo. A demanda fica `aguardando-gate1`.
3. **Executar**: `Coorquestrador: Executar plano aprovado` → abre o **Gate 1** (modal com tarefas, engines, potências e custo total). Ao aprovar, executa via CLI respeitando o DAG (paralelo onde independente). Tarefas com impacto/custo alto passam pelo **Gate 2** antes de consolidar.
4. **Acompanhar**: `Coorquestrador: Lista de demandas` → status, custo estimado vs real por demanda, multiprojeto.

## Como o motor de decisão funciona

O `planner.ts` injeta no prompt do agente: o spec do `coorquestrador.agent.md`, a demanda, o contexto do projeto-alvo (AGENTS.md/constitution/docs), o **snapshot do probe** e as capacidades declaradas. O agente devolve o plano em prosa + um bloco `json` com as tarefas roteadas, que o núcleo parseia, precifica e leva ao Gate 1. Assim o **raciocínio** vive no agente (`.agent.md`, alinhado ao conjunto base) e o **determinismo** (probe, custo, execução, gates, estado) vive no núcleo TypeScript.

## Roadmap dos próximos formatos

- **App solo (Electron/CLI)**: reusar `src/core/*` sem dependência do VSCode; UI própria para gates.
- **Bot Telegram**: gates viram botões inline (Aprovar/Replanejar); probe e estado em servidor; execução em host remoto designado.
