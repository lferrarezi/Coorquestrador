# Coorquestrador

Meta-orquestrador de **runtime de execução** para VS Code. Fica uma camada **acima** do `squad-orchestrator`: enquanto este decide *quais agentes especialistas* entram numa demanda, o Coorquestrador decide *qual engine de IA externo (CLI) executa o trabalho*, com qual modelo e potência, a que consumo de cota, em qual projeto e em que ordem (sequencial ou paralela).

## O que ele faz

```
DEMANDA
 → analisa  → planeja (atividades→tarefas→DAG)
 → probe de engines (disponibilidade + crédito, modo híbrido)
 → roteia (engine + modelo + potência por tarefa)
 → estima consumo de cota (por tarefa + total)
 → monta pacote SDD/Spec + comando CLI
 == GATE HITL 1: aprovar plano + cota ==      ← obrigatório na v1
 → executa via CLI local (paralelo onde o DAG permite)
 → revisa (gate de qualidade)
 == GATE HITL 2: aprovar entrega (se houver impacto) ==
 → atualiza a lista de demandas (status + cota real)
```

Engines suportados (declarados em `engines.yaml`): **claude-code, codex, kiro, devin-cli, gemini-cli, github-copilot-cli**. Modelos e potências (low/normal/medium/high) configuráveis por engine.

## Estrutura do pacote

```
agent/coorquestrador.agent.md      → o agente (raciocínio de planejamento), padrão .agent.md
config/engines.yaml                → engines declarados + probe + template de execução CLI
config/cost-table.yaml             → unidades de cota por modelo/potência + tamanhos por classe de tarefa
config/coorq-hitl-gates.yaml       → gates HITL (Gate 1 obrigatório)
skills/demand-planning/SKILL.md    → demanda → tarefas atômicas + DAG
skills/engine-routing/SKILL.md     → escolha de engine + modelo + potência
skills/cost-estimation/SKILL.md    → fórmula de cota estimada vs real
vscode-extension/                  → extensão VSCode (núcleo TS + gates + estado)
sample-root/.coorq/                → exemplo da estrutura de runtime na raiz multiprojetos
```

## Núcleos de agentes por squad (Agent Packs)

O **raciocínio** do Coorquestrador (o agente `coorquestrador.agent.md` + skills) é trocável por **núcleo**, para que cada squad use seus próprios agentes/skills/tools — **sem perder o motor central** (analisar → quebrar em tarefas → rotear ferramenta+modelo → executar por DAG → qualidade → visão centralizada).

> Garantia: o motor determinístico (probe, roteamento, estimativa de cota, execução, gates) vive no **núcleo TypeScript** e nunca é trocado. O **contrato de saída** do plano (array JSON de tarefas roteadas) é sempre anexado pela extensão — então nenhum núcleo custom quebra a capacidade principal. Um núcleo sem `coorquestrador.agent.md` ainda planeja, usando o contrato padrão.

### Estrutura de um núcleo

```
<nucleo>/
  coorquestrador.agent.md   → cérebro de planejamento (raciocínio)
  skills/<nome>/SKILL.md     → skills do squad (domínio, regras, padrões)
  agents/                    → (opcional) agentes especialistas do squad
  tools/                     → (opcional) ferramentas do squad
  pack.json                  → manifesto (nome, versão, descrição, skills, agents, handoffs)
```

Os núcleos ficam em `.coorq/agent-packs/<nome>/`; o ativo é apontado por `.coorq/active-pack`. O núcleo **base** (v1.0.0) acompanha o projeto.

### Manifesto `pack.json`

```json
{
  "name": "squad-pagamentos",
  "version": "1.2.0",
  "description": "Núcleo do squad de pagamentos: padrões PCI, prioriza codex no backend.",
  "skills": ["demand-planning", "engine-routing", "regras-pci"],
  "agents": ["revisor-seguranca"],
  "handoffs": ["qa-bot", "sec-bot"]
}
```

Se o `pack.json` estiver ausente na importação, a extensão **sintetiza** o manifesto a partir do conteúdo (skills das subpastas, handoffs do frontmatter do agente) e grava um `pack.json` normalizado.

### Importar / trocar (pela extensão)

- Ícone **🧩** no painel de chat (ou comando **"Coorquestrador: Núcleo de agentes (trocar/importar)"**).
- O menu lista os núcleos instalados (versão · nº de skills · ativo) e a opção **"Importar novo núcleo (pasta ou .zip)..."**.
- Ao importar, escolha a fonte (pasta ou `.zip`) e dê um nome; o núcleo é extraído, validado e ativado.
- O painel mostra o núcleo ativo no rodapé (*"núcleo: base"*). Na hora de planejar, o `agent.md` + as skills do núcleo ativo são injetados no prompt.

## Decisões de arquitetura (v1)

| Decisão | Escolha |
|---|---|
| Descoberta de engines | **Híbrida**: `engines.yaml` declara; o `prober` valida em runtime (probe + credit_probe) |
| Automação | **HITL em gates**: Gate 1 (plano+cota) sempre exige aprovação antes de gastar crédito |
| Motor de planejamento | **Agente `.agent.md`** invocado via CLI do `plannerEngine` |
| Núcleo de raciocínio | **Trocável por squad** (Agent Packs em `.coorq/agent-packs/`); motor TS preservado |
| Formato | **Extensão VSCode** |

## Política de versionamento

O Coorquestrador segue a mesma regra do projeto Devin-Cli Chat:

- Minor **ímpar** é trilha de **pre-release**: `0.1.x`, `0.3.x`, `0.5.x`.
- Minor **par** é trilha de **release final**: `0.2.x`, `0.4.x`, `0.6.x`, `1.0.x`.
- Correções menores avançam o patch dentro da mesma trilha: `0.2.0` -> `0.2.1`, `0.3.0` -> `0.3.1`.

O workflow de publicação marca automaticamente como pre-release quando o minor é ímpar. Antes de publicar, rode `npm run release:check` em `vscode-extension/`.

## Instalação da extensão (passo a passo)

1. **Pré-requisitos**: Node.js 18+, VSCode 1.90+, e os CLIs dos engines que você for usar instalados e autenticados (`claude`, `codex`, `kiro`, `devin`, `gemini`, `copilot`).

2. **Instalar dependências e compilar**:
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   ```

3. **Rodar em modo dev**: abra a pasta `vscode-extension` no VSCode e pressione `F5` (Extension Development Host). Para validar release local: `npm run release:check`. Para empacotar um `.vsix`: `npm run package`.

4. **Abrir o projeto no VS Code**: o projeto aberto é a referência de trabalho. Na ativação, a extensão cria `.coorq/` automaticamente quando a pasta ainda não existe, incluindo `engines.yaml`, `cost-table.yaml`, gates, estado e o núcleo de agentes padrão.

5. **Configurar a extensão** (Settings → Coorquestrador):
   - `coorq.rootPath`: opcional; quando vazio, usa o workspace aberto no VS Code.
   - `coorq.plannerEngine`: engine que roda o agente planejador (padrão `claude-code`).
   - `coorq.maxParallel`: execuções simultâneas (padrão 3).
   - `coorq.requireGate1`: mantenha `true` na v1.

6. **Ajustar os engines reais quando necessário**: a extensão faz discovery dos CLIs instalados e dos modelos disponíveis para alimentar os menus Assistente/Modelo/Esforço. Edite `.coorq/engines.yaml` apenas para customizar comandos, probes ou roteamento:
   - Confirme o `bin`, `input_mode` e `exec_template` de cada CLI conforme a sintaxe real.
   - Preencha `credit_probe.command` com o comando de saldo/cota de cada engine (ex.: `devin acu --json`). Onde não houver, a cota real cai para a estimada.
   - Ajuste `cost-table.yaml` com os volumes de cota calibrados para seu uso.

## Uso (passo a passo)

1. **Probe**: `Coorquestrador: Probe de engines` → mostra disponibilidade e crédito de cada CLI; lista os elegíveis para roteamento.
2. **Planejar**: `Coorquestrador: Planejar demanda` → escolha o projeto, dê título e descrição. O agente analisa, quebra em tarefas, roteia engine/modelo/potência e estima a cota. A demanda fica `aguardando-gate1`.
3. **Executar**: `Coorquestrador: Executar plano aprovado` → abre o **Gate 1** (modal com tarefas, engines, potências e cota total). Ao aprovar, executa via CLI respeitando o DAG (paralelo onde independente). Tarefas com impacto/cota alta passam pelo **Gate 2** antes de consolidar.
4. **Acompanhar**: `Coorquestrador: Lista de demandas` → status, cota estimada vs real por demanda, multiprojeto.

## Como o motor de decisão funciona

O `planner.ts` injeta no prompt do agente: o spec do `coorquestrador.agent.md`, a demanda, o contexto do projeto-alvo (AGENTS.md/constitution/docs), o **snapshot do probe** e as capacidades declaradas. O agente devolve o plano em prosa + um bloco `json` com as tarefas roteadas, que o núcleo parseia, valida deterministicamente, estima cota e leva ao Gate 1.

A execução usa um serviço comum para comandos e chat: roda o DAG, grava logs em `.coorq/logs/<demanda>/<tarefa>.log`, reconcilia o estado e aplica Gate 2 quando a entrega cruza regras de impacto/cota. Assim o **raciocínio** vive no agente (`.agent.md`, alinhado ao conjunto base) e o **determinismo** (probe, validação, cota, execução, gates, logs e estado) vive no núcleo TypeScript.

A view **Tarefas (por projeto)** permite expandir demandas em etapas, copiar resumo operacional e abrir logs persistidos por tarefa.
