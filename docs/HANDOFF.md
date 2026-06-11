# CONTEXTO E CONTINUIDADE — Projeto "Coorquestrador"

> Prompt de handoff. Entregue este documento a outro agente para que ele entenda o
> projeto e dê continuidade. Leia por completo antes de agir.

Você está assumindo o desenvolvimento do **Coorquestrador**, um meta-orquestrador de
runtime de execução de IA.

## O QUE É
O Coorquestrador é uma camada ACIMA de um orquestrador de squad. Enquanto um
"squad-orchestrator" decide QUAIS agentes especialistas entram numa demanda, o
Coorquestrador decide QUAL ferramenta de IA externa (CLI) executa o trabalho, com
qual modelo, qual nível de esforço, a que consumo de cota, em qual projeto e em que
ordem (sequencial ou paralela).

Analogia: o squad-orchestrator é o chefe de cozinha (decide o cardápio); o
Coorquestrador é o gerente de operações (vê quais fogões estão livres, quanta cota
resta em cada um, manda a comanda para a estação certa, acompanha vários pratos em
paralelo e confere o resultado).

## OBJETIVO CENTRAL (não pode se perder em nenhuma evolução)
Dado um pedido do usuário:
1. ANALISAR a atividade por completo.
2. QUEBRAR em tarefas atômicas com dependências (DAG).
3. AVALIAR e RECOMENDAR a ferramenta (claude, codex, devin-cli, gemini-cli,
   github-copilot-cli...) e o MODELO (sonnet, gpt-5.5, gemini-2.5-pro...) mais
   adequados por tarefa, considerando disponibilidade e COTA restante.
4. DISPARAR a execução (uma ou várias atividades, paralelas onde o DAG permite).
5. GARANTIR QUALIDADE (gates de aprovação humana — HITL) e CENTRALIZAR a visão de
   projeto (multiprojetos sob uma raiz).

Foco é CONSUMO DE COTA (tokens/ACU), NÃO custo financeiro exato.

## ARQUITETURA (decisão fundamental)
Separação entre DETERMINISMO e RACIOCÍNIO:
- DETERMINÍSTICO (TypeScript, núcleo da extensão, NUNCA trocável): detecção/probe de
  assistentes, roteamento ferramenta+modelo, estimativa de cota, execução por DAG,
  gates HITL, persistência e visão centralizada.
- RACIOCÍNIO (trocável por squad): o agente planejador `coorquestrador.agent.md` +
  skills. Isso é um "Núcleo de Agentes" (Agent Pack).
- GARANTIA: o contrato de saída do plano (array JSON de tarefas roteadas) é SEMPRE
  anexado pelo núcleo TS ao prompt do planejador. Assim, mesmo um núcleo custom de um
  squad não consegue quebrar a capacidade principal.

## FORMATO ATUAL
Extensão do VSCode (versão 1.1.1 pre-release). Repositório:
github.com/lferrarezi/Coorquestrador (branch main). O escopo atual é exclusivamente
VS Code; formatos externos foram descartados.

## ESTRUTURA DO REPOSITÓRIO
- `agent/coorquestrador.agent.md`  → o cérebro de planejamento (padrão .agent.md).
- `skills/*/SKILL.md`              → skills base (demand-planning, engine-routing,
                                      cost-estimation).
- `config/*.yaml`                  → engines, cost-table, gates (referência).
- `sample-root/.coorq/`            → exemplo do runtime `.coorq`, com
                                      `agent-packs/base` e `agent-packs/squad-base`.
- `vscode-extension/`              → a extensão:
    - `src/core/`: config.ts (paths + Agent Packs), prober.ts (probe + detecção de
      instalados + descoberta de modelos + cota), planner.ts (monta prompt e invoca
      a CLI planejadora, parseia o plano JSON), estimator.ts (consumo), executor.ts
      (DAG + paralelismo), commandBuilder.ts (monta comando CLI shell-safe),
      demandStore.ts (estado), agentPacks.ts (importar/validar núcleos), chat.ts.
    - `src/ui/`: chatPanel.ts (painel webview = orquestrador conversacional),
      trees.ts (views Tarefas e Assistentes), gates.ts (modais HITL).
    - `src/extension.ts`: ativação, comandos, providers.

## RUNTIME (.coorq no projeto aberto)
O projeto aberto no VS Code é a referência de trabalho. Na ativação, a extensão
cria `.coorq/` automaticamente quando ausente, com configuração, estado e núcleo
de agentes padrão. Em `.coorq/`:
- `engines.yaml`: declara cada assistente (bin, input_mode arg|stdin|file, probe,
  credit_probe [cota], models_probe [descoberta de modelos], exec_template, models,
  default_model, powers, unit token|acu, best_for, enabled).
- `cost-table.yaml`: power_multiplier + task_size_tokens/task_size_acu por classe
  (trivial/small/medium/large/xlarge e aliases XS/S/M/L/XL). Representa VOLUME de
  consumo, sem conversão financeira.
- `coorq-hitl-gates.yaml`: gates HITL.
- `agent-packs/<nome>/`: núcleos (coorquestrador.agent.md + skills/ + agents/ +
  tools/ + pack.json). `active-pack` aponta o ativo.
- `state/demands.json`: tarefas persistidas.
- `logs/<demanda>/<tarefa>.log`: stdout/stderr, comando, engine/modelo e duração por
  tarefa executada.

## NOMENCLATURA (amigável, voltada ao usuário)
- "demanda" → Tarefa | "engine" → Assistente | "power" → Esforço
- "Gate 1 / executar plano" → Aprovar e executar
- "Probe" → Verificar cota | "Lista de demandas" → Minhas tarefas

## JORNADA (tudo pelo chat, com confirmações inline)
O painel de chat é o orquestrador. Fluxo:
1. Usuário descreve o pedido; conversa com o Assistente selecionado (streaming).
2. Botão inline "Transformar em Tarefa" → escolhe o projeto (card inline).
3. A Tarefa é criada e o plano é montado automaticamente (planejador invoca a CLI e
   devolve o plano JSON) → card de plano com etapas (assistente/modelo/esforço) e
   CONSUMO DE COTA estimado (tokens/ACU por assistente), com botões Aprovar e
   executar / Replanejar / Cancelar.
4. Aprovado → executa por DAG; status de cada etapa atualiza ao vivo; card de resumo.

No topo do painel: seletores Assistente/Modelo/Esforço (preenchidos automaticamente
pelo que está instalado localmente, com modelos auto-descobertos), ícone 🧩 para
trocar/importar Núcleo de Agentes, 📊 Verificar cota, ☰ Minhas tarefas.

## DETECÇÃO AUTOMÁTICA (após instalar)
- Assistentes instalados: `command -v <bin>` no PATH (respeita enabled:false).
- Modelos disponíveis: campo `models_probe` por engine (lê config/estado da própria
  CLI). Implementado para codex, gemini, copilot e devin; claude usa aliases
  (opus/sonnet/haiku). Fallback para a lista declarada.
- Cota restante (%): campo `credit_probe`. Implementado para codex (rate_limits da
  sessão) e copilot (gh api /copilot_internal/user). claude/gemini/devin = n/d.
- Seleção do assistente primário persiste em globalState.

## NÚCLEOS DE AGENTES (Agent Packs) — diferencial para squads
- Squads plugam seus próprios agentes/skills/tools sem perder o motor central.
- Importar pasta ou .zip pela extensão (ícone 🧩); valida e ativa.
- Manifesto `pack.json` {name, version, description, skills[], agents[], handoffs[]};
  se ausente, é sintetizado do conteúdo (skills das subpastas, agentes via *.agent.md
  recursivo inclusive em grupos numerados 01-22, handoffs do frontmatter do agente).
- Dois núcleos já instalados: `base` (genérico, 3 skills) e `squad-base` (suíte
  completa: 229 agentes em grupos 01-22 + 25 skills + 7 handoffs).

## CONFIGURAÇÕES DA EXTENSÃO
coorq.rootPath opcional (vazio = workspace aberto), coorq.configDir (.coorq),
coorq.plannerEngine (recomendado
claude-code ou codex — gemini falha como planejador com prompts grandes),
coorq.maxParallel, coorq.requireGate1.

## ESTADO ATUAL / O QUE JÁ FUNCIONA
- Pipeline validado ponta-a-ponta: planejar (claude) → rotear → executar (criou
  arquivo real). 5 assistentes respondem (claude, codex, devin, gemini, copilot).
- Build 1.1.1 pre-release, empacotada e instalavel (.vsix).
- Convenção de versão: minor impar e trilha pre-release (0.1.x, 0.3.x);
  minor par e release final (0.2.x, 0.4.x, 1.0.x). Correcoes menores incrementam patch
  dentro da mesma trilha.
- Repositório versiona dist/ e os .vsix.

## BUGS JÁ CORRIGIDOS (não reintroduzir)
- Shell-safety: prompt em input_mode=arg deve usar ASPAS SIMPLES (shellQuote), nunca
  JSON.stringify (crases quebravam o shell). Prefixar "\n" para o valor não começar
  com "-".
- Fechar stdin quando input_mode != stdin (senão codex trava esperando EOF).
- readManifest: arrays vazios em pack.json não devem suprimir o fallback.

## PRÓXIMOS PASSOS SUGERIDOS
1. Calibrar volumes de task_size_* com dados reais de uso por classe de tarefa.
2. credit_probe para claude/gemini/devin (via API com chave, se disponível).
3. Validacao manual pos-marketplace em Windows/macOS com CLIs reais.
4. Evoluir painel "Minhas tarefas" para filtros e historico por demanda.
5. Melhorar UX e observabilidade dentro da extensão VS Code.

## COMO RODAR/EMPACOTAR
```
cd vscode-extension && npm install && npm run compile
npx @vscode/vsce package    # gera o .vsix
# Instalar: code --install-extension <arquivo>.vsix --force ; depois Reload Window.
```

## REGRAS DE TRABALHO
- Ambiente do usuário: macOS; raiz multiprojetos em /Users/<user>/Documents/Projetos
  com .coorq já configurado; CLIs instalados (claude, codex, devin, gemini, copilot;
  kiro é editor e fica enabled:false).
- Preserve SEMPRE o objetivo central e a separação determinismo×raciocínio.
- Commits: não commitar direto na main (criar branch); ao final de mensagens de
  commit, manter a linha de co-autoria do projeto.

Comece confirmando que entendeu o objetivo central e proponha o próximo incremento.
