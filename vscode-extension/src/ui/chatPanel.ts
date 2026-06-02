// src/ui/chatPanel.ts
// Painel de chat = orquestrador. Tudo acontece na conversa: voce descreve,
// a IA conversa, vira Tarefa, mostra o plano e voce aprova/executa inline.
// Nomenclatura amigavel: Tarefa (demanda), Assistente (engine), Esforco (power).

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CoorqConfig } from "../core/config";
import { DemandStore } from "../core/demandStore";
import { runChat, buildChatPrompt, ChatTurn } from "../core/chat";
import { detectInstalled, probeAll } from "../core/prober";
import { buildPlannerPrompt, parsePlan, runPlanner } from "../core/planner";
import { estimateDemand } from "../core/estimator";
import { buildCommand } from "../core/commandBuilder";
import { executePlan } from "../core/executor";
import { Demand, EngineSnapshot } from "../core/types";

export interface ChatPanelDeps {
  cfg: () => { root: string; configDir: string; plannerEngine: string; maxParallel: number };
  log: (s: string) => void;
  state: vscode.Memento;
  refreshDemands: () => void;
}

const SELECTION_KEY = "coorq.chat.selection";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "coorq.chat";
  private view?: vscode.WebviewView;
  private history: ChatTurn[] = [];
  private engines: EngineSnapshot[] = [];
  private selection: { engineId?: string; model?: string; power?: string };
  private draft: Demand | null = null;

  constructor(private readonly deps: ChatPanelDeps) {
    this.selection = deps.state.get(SELECTION_KEY, {});
  }

  private saveSelection() { void this.deps.state.update(SELECTION_KEY, this.selection); }

  setEngines(snaps: EngineSnapshot[]) {
    this.engines = snaps;
    this.view?.webview.postMessage({ type: "engines", engines: snaps });
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.postMessage({ type: "engines", engines: this.engines });
    void this.detect();

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "chat": await this.handleChat(msg.text); break;
        case "select":
          this.selection = { engineId: msg.engineId, model: msg.model, power: msg.power };
          this.saveSelection(); break;
        case "detect": await this.detect(); break;
        case "openSettings":
          await vscode.commands.executeCommand("workbench.action.openSettings", "coorq.rootPath"); break;
        case "manageCore":
          await vscode.commands.executeCommand("coorq.manageAgentCore"); await this.detect(); break;
        case "reset":
          this.history = []; this.draft = null; view.webview.postMessage({ type: "cleared" }); break;
        case "createTask": await this.startCreate(); break;
        case "projectChosen": await this.createAndPlan(msg.project); break;
        case "approveExecute": await this.execute(); break;
        case "replan": await this.planDraft(); break;
        case "cancelTask":
          this.draft = null; this.post({ type: "info", text: "Tarefa descartada." }); break;
      }
    });
  }

  private post(m: any) { this.view?.webview.postMessage(m); }

  // ---------- DETECCAO ----------
  private async detect() {
    const c = this.deps.cfg();
    if (!c.root) { this.post({ type: "installed", engines: [], error: "Configure a pasta-raiz nas configuracoes (coorq.rootPath)." }); return; }
    const conf0 = new CoorqConfig(c.root, c.configDir);
    if (!fs.existsSync(conf0.enginesPath())) {
      this.post({ type: "installed", engines: [], error: `Configuracao nao encontrada em ${conf0.enginesPath()}. Crie a pasta ${c.configDir}/ na raiz (copie de sample-root/.coorq).` });
      return;
    }
    try {
      const ef = conf0.loadEngines();
      const found = await detectInstalled(ef);
      const installed = found.filter((e) => e.installed);
      if (!this.selection.engineId || !installed.find((e) => e.id === this.selection.engineId)) {
        const pref = installed.find((e) => e.id === c.plannerEngine) || installed[0];
        if (pref) { this.selection = { engineId: pref.id, model: pref.default_model, power: "normal" }; this.saveSelection(); }
      }
      this.post({ type: "installed", engines: installed, selection: this.selection });
      try { conf0.ensureAgentPacks(); this.post({ type: "pack", name: conf0.activePack(), packs: conf0.listPacks() }); } catch { /* */ }
      this.deps.log(`[chat] assistentes instalados: ${installed.map((e) => e.id).join(", ") || "(nenhum)"}`);
    } catch (e: any) {
      this.post({ type: "installed", engines: [], error: `Falha ao detectar assistentes: ${e.message}` });
    }
  }

  // ---------- CONVERSA ----------
  private async handleChat(text: string) {
    const c = this.deps.cfg();
    if (!c.root) { this.post({ type: "error", text: "Configure a pasta-raiz nas configuracoes." }); return; }
    let conf: CoorqConfig, ef: any;
    try { conf = new CoorqConfig(c.root, c.configDir); ef = conf.loadEngines(); }
    catch (e: any) { this.post({ type: "error", text: `Falha ao carregar configuracao: ${e.message}` }); return; }

    const engineId = this.selection.engineId || c.plannerEngine;
    const engineCfg = ef.engines?.[engineId];
    if (!engineCfg) { this.post({ type: "error", text: `Assistente '${engineId}' indisponivel. Escolha um assistente detectado.` }); return; }
    const model = this.selection.model || engineCfg.default_model;
    const power = this.selection.power || "normal";
    const engineForChat = { ...engineCfg, default_model: model };

    this.history.push({ role: "user", content: text });
    this.post({ type: "userMsg", text });
    this.post({ type: "assistantStart" });

    const agentPath = conf.agentPath();
    const system = fs.existsSync(agentPath)
      ? fs.readFileSync(agentPath, "utf8")
      : "Voce e o Coorquestrador: ajude a refinar a tarefa antes de planejar e executar.";
    const prompt = buildChatPrompt(system, this.history);
    const timeout = ef.defaults?.exec_timeout_seconds || 600;

    try {
      const full = await runChat(engineForChat, prompt, c.root, timeout, power, (chunk) => this.post({ type: "assistantChunk", text: chunk }));
      this.history.push({ role: "assistant", content: full });
      this.post({ type: "assistantEnd" });
      this.post({ type: "offerCreate" });
      this.deps.log(`[chat] ${engineId}/${model}/${power} (${full.length} chars)`);
    } catch (e: any) {
      this.post({ type: "error", text: `Assistente falhou: ${e.message}` });
      this.post({ type: "assistantEnd" });
    }
  }

  // ---------- CRIAR TAREFA ----------
  private async startCreate() {
    const c = this.deps.cfg();
    if (!c.root) { this.post({ type: "error", text: "Configure a pasta-raiz." }); return; }
    if (this.history.length === 0) { this.post({ type: "info", text: "Converse um pouco antes de criar a tarefa." }); return; }
    const conf = new CoorqConfig(c.root, c.configDir);
    let projects: string[] = [];
    try { projects = conf.listProjects(); } catch { /* */ }
    if (projects.length === 0) { this.post({ type: "error", text: "Nenhum projeto encontrado na raiz. Cada subpasta da raiz e um projeto." }); return; }
    this.post({ type: "chooseProject", projects });
  }

  private firstUserLine(): string {
    const u = this.history.find((t) => t.role === "user");
    const line = (u?.content || "Nova tarefa").split("\n")[0];
    return line.length > 60 ? line.slice(0, 57) + "..." : line;
  }

  private async createAndPlan(project: string) {
    const c = this.deps.cfg();
    const conf = new CoorqConfig(c.root, c.configDir);
    conf.ensureStateFile();
    const store = new DemandStore(conf.statePath());
    const description = this.history.map((t) => `${t.role === "user" ? "Pedido" : "Assistente"}: ${t.content}`).join("\n\n");
    const demand: Demand = {
      id: `T-${Date.now()}`, project, title: this.firstUserLine(), description,
      createdAt: new Date().toISOString(), status: "nova", tasks: [],
    };
    store.upsert(demand);
    this.draft = demand;
    this.deps.refreshDemands();
    this.post({ type: "info", text: `Tarefa criada em "${project}": ${demand.title}` });
    await this.planDraft();
  }

  // ---------- PLANEJAR ----------
  private async planDraft() {
    if (!this.draft) { this.post({ type: "error", text: "Nenhuma tarefa em edicao." }); return; }
    const c = this.deps.cfg();
    const conf = new CoorqConfig(c.root, c.configDir);
    const ef = conf.loadEngines();
    const cost = conf.loadCost();
    const store = new DemandStore(conf.statePath());
    const demand = this.draft;

    this.post({ type: "planStart" });
    try {
      const snaps = await probeAll(ef);
      const enginesMeta: any = {};
      for (const [id, e] of Object.entries<any>(ef.engines))
        enginesMeta[id] = { models: e.models, powers: e.powers, best_for: e.best_for, unit: e.unit, location: e.location };
      conf.ensureAgentPacks();
      const agentSpec = fs.existsSync(conf.agentPath()) ? fs.readFileSync(conf.agentPath(), "utf8") : "(agente coorquestrador)";
      const skills = conf.loadSkills();
      const projectCtx = this.projectContext(c.root, demand.project);
      const prompt = buildPlannerPrompt({ agentSpec, skills, demand, projectContext: projectCtx, snapshot: snaps, enginesMeta });
      const plannerCfg = ef.engines[this.selection.engineId || c.plannerEngine] || ef.engines[c.plannerEngine];
      const raw = await runPlanner(plannerCfg, prompt, path.join(c.root, demand.project), ef.defaults.exec_timeout_seconds);
      demand.tasks = parsePlan(raw);
      if (demand.tasks.length === 0) {
        demand.status = "nova"; store.upsert(demand); this.deps.refreshDemands();
        this.post({ type: "error", text: "O assistente nao retornou um plano valido. Tente refinar a conversa e criar de novo." });
        return;
      }
      const est = estimateDemand(demand.tasks, cost);
      demand.tasks.forEach((t) => (t.estimatedCost = est.perTask[t.id] || 0));
      demand.estimatedTotal = est.total;
      demand.status = "aguardando-gate1";
      store.upsert(demand); this.deps.refreshDemands();

      // consumo de cota estimado, por assistente (tokens/ACU) — sem custo financeiro
      const consMap = new Map<string, { unit: string; amount: number }>();
      const perTaskCons: Record<string, { unit: string; amount: number }> = {};
      for (const t of demand.tasks) {
        if (!t.engine) continue;
        const unit = (ef.engines[t.engine]?.unit) || "token";
        const base = unit === "acu" ? (cost.task_size_acu?.[t.size] ?? 0) : (cost.task_size_tokens?.[t.size] ?? 0);
        const mult = cost.power_multiplier?.[t.power || "normal"] ?? 1;
        const amount = base * mult;
        perTaskCons[t.id] = { unit, amount };
        const cur = consMap.get(t.engine) || { unit, amount: 0 };
        cur.amount += amount; consMap.set(t.engine, cur);
      }
      const consumption = [...consMap.entries()].map(([engine, v]) => ({ engine, unit: v.unit, amount: v.amount }));

      this.post({
        type: "planCard",
        title: demand.title,
        consumption,
        tasks: demand.tasks.map((t) => ({
          id: t.id, description: t.description, activity: t.activity,
          engine: t.engine || "(sem assistente)", model: t.model || "", power: t.power || "", size: t.size,
          cons: perTaskCons[t.id] || null, blocked: !t.engine,
        })),
      });
    } catch (e: any) {
      this.post({ type: "error", text: `Falha ao planejar: ${e.message}` });
    }
  }

  private projectContext(root: string, project: string): string {
    const dir = path.join(root, project);
    const parts: string[] = [];
    for (const f of ["AGENTS.md", "SQUAD.md", ".specify/memory/constitution.md"]) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) parts.push(`## ${f}\n` + fs.readFileSync(p, "utf8").slice(0, 4000));
    }
    return parts.join("\n\n");
  }

  // ---------- EXECUTAR (aprovacao inline) ----------
  private async execute() {
    if (!this.draft) { this.post({ type: "error", text: "Nenhuma tarefa para executar." }); return; }
    const c = this.deps.cfg();
    const conf = new CoorqConfig(c.root, c.configDir);
    const ef = conf.loadEngines();
    const store = new DemandStore(conf.statePath());
    const demand = this.draft;

    demand.tasks.forEach((t) => { if (t.status === "planejada") t.status = "aprovada"; });
    demand.status = "em-execucao";
    store.upsert(demand); this.deps.refreshDemands();
    this.post({ type: "execStart" });

    const cwd = path.join(c.root, demand.project);
    const specDir = path.join(c.root, c.configDir, "specs", demand.id);
    try {
      await executePlan({
        tasks: demand.tasks, cwd,
        maxParallel: Math.min(c.maxParallel, ef.defaults.max_parallel),
        execTimeoutSec: ef.defaults.exec_timeout_seconds,
        gate1Approved: true,
        buildFn: (t) => {
          const ecfg = ef.engines[t.engine!];
          const sdd = `# Tarefa ${t.id}\n${t.description}\n\n## Criterio de aceite\n${t.acceptance}`;
          return buildCommand(t, ecfg, sdd, cwd, specDir);
        },
        onUpdate: (t) => { store.upsert(demand); this.deps.refreshDemands(); this.post({ type: "execUpdate", id: t.id, status: t.status }); },
      });
      for (const t of demand.tasks.filter((x) => x.status === "revisao")) {
        t.status = "concluida"; t.realCost = t.realCost ?? t.estimatedCost; store.upsert(demand);
      }
      store.reconcile(demand.id); this.deps.refreshDemands();
      const final = store.get(demand.id)!;
      const done = final.tasks.filter((t) => t.status === "concluida").length;
      this.post({ type: "summary", status: final.status, done, total: final.tasks.length });
      this.draft = null;
    } catch (e: any) {
      this.post({ type: "error", text: `Falha na execucao: ${e.message}` });
    }
  }

  // ---------- HTML ----------
  private html(): string {
    const nonce = String(Date.now());
    return /* html */ `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root{
    --bg:var(--vscode-sideBar-background);--fg:var(--vscode-foreground);
    --muted:var(--vscode-descriptionForeground);--border:var(--vscode-panel-border);
    --input:var(--vscode-input-background);--input-fg:var(--vscode-input-foreground);
    --focus:var(--vscode-focusBorder);--accent:var(--vscode-button-background);
    --accent-fg:var(--vscode-button-foreground);--editor:var(--vscode-editor-background);
    --hover:var(--vscode-list-hoverBackground);--active:var(--vscode-list-activeSelectionBackground);
    --active-fg:var(--vscode-list-activeSelectionForeground);--code:var(--vscode-textCodeBlock-background);
  }
  *{box-sizing:border-box}
  html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size,12px)}
  button,select,textarea{font:inherit;color:inherit}
  .app{height:100vh;display:flex;flex-direction:column}
  .header{height:40px;min-height:40px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;padding:0 10px}
  .product{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px}
  .logo{width:20px;height:20px;display:grid;place-items:center}
  .spacer{flex:1}
  .iconBtn{border:0;background:transparent;color:var(--muted);width:28px;height:28px;border-radius:6px;display:grid;place-items:center;cursor:pointer;font-size:14px}
  .iconBtn:hover{background:var(--hover);color:var(--fg)}
  .thread{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:14px;background:var(--editor)}
  .welcome{margin:auto 0;display:grid;gap:14px}
  .welcomeTitle{font-size:17px;font-weight:600}
  .welcomeText{color:var(--muted);max-width:560px;font-size:12px;line-height:1.5}
  .starterGrid{display:grid;gap:8px}
  .starter{border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:10px;text-align:left;padding:10px;cursor:pointer}
  .starter:hover{background:var(--hover);border-color:var(--focus)}
  .starter b{display:block;margin-bottom:3px;font-size:13px}
  .starter span{display:block;color:var(--muted);font-size:11px;line-height:1.4}
  .msgRow{display:flex;gap:10px;align-items:flex-start}
  .msgRow.user{justify-content:flex-end}
  .avatar{width:24px;height:24px;border-radius:999px;background:var(--accent);color:var(--accent-fg);display:grid;place-items:center;font-size:11px;font-weight:700;flex:0 0 auto;margin-top:2px}
  .msg{max-width:92%;line-height:1.48;white-space:pre-wrap;overflow-wrap:anywhere}
  .msg.assistant{width:100%}
  .msg.user{background:var(--input);border:1px solid var(--border);border-radius:16px;padding:9px 12px;max-width:82%}
  .msg.err{color:var(--vscode-errorForeground)}
  .typing{display:inline-block;width:7px;height:7px;border-radius:999px;background:var(--accent);animation:pulse 1s infinite}
  @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
  /* CARDS inline */
  .card{border:1px solid var(--border);background:var(--bg);border-radius:12px;padding:12px;display:grid;gap:10px}
  .card h4{margin:0;font-size:12px;display:flex;align-items:center;gap:6px}
  .card .sub{color:var(--muted);font-size:11px}
  .taskItem{border:1px solid var(--border);border-radius:8px;padding:8px;display:grid;gap:3px;background:var(--editor)}
  .taskItem .top{display:flex;justify-content:space-between;gap:8px;font-size:11px}
  .taskItem .desc{font-size:12px}
  .badge{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid var(--border);color:var(--muted)}
  .badge.run{color:var(--accent-fg);background:var(--accent);border:0}
  .badge.done{color:#fff;background:#2ea043;border:0}
  .badge.fail{color:#fff;background:#d1242f;border:0}
  .cardBtns{display:flex;gap:6px;flex-wrap:wrap}
  .btn{height:30px;border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:8px;padding:0 12px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:6px}
  .btn:hover{background:var(--hover)}
  .btn.primary{background:var(--accent);color:var(--accent-fg);border:0;font-weight:600}
  .btn.ghost{color:var(--muted)}
  .inlineActions{display:flex;gap:6px;margin-top:2px}
  /* COMPOSER */
  .composerWrap{border-top:1px solid var(--border);background:var(--bg);padding:10px;display:flex;flex-direction:column;gap:8px}
  .composer{border:1px solid var(--border);background:var(--input);border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
  .composer:focus-within{border-color:var(--focus)}
  textarea{width:100%;min-height:56px;max-height:200px;resize:none;background:transparent;color:var(--input-fg);border:0;outline:0;padding:9px 10px 4px 10px;line-height:1.4}
  .composerBar{display:flex;align-items:center;gap:6px;padding:6px 8px 8px 8px;flex-wrap:wrap}
  .pill{height:26px;border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:8px;display:inline-flex;align-items:center;gap:5px;padding:0 6px;font-size:11px}
  .pill label{color:var(--muted)}
  .pill select{border:0;background:transparent;color:var(--fg);outline:0;cursor:pointer;max-width:130px}
  .barSpacer{flex:1;min-width:6px}
  .iconChip{height:26px;width:26px;border:1px solid var(--border);background:var(--bg);color:var(--muted);border-radius:8px;display:grid;place-items:center;cursor:pointer;font-size:13px}
  .iconChip:hover{background:var(--hover);color:var(--fg)}
  .sendBtn{height:28px;min-width:28px;border-radius:8px;border:0;background:var(--accent);color:var(--accent-fg);cursor:pointer;display:grid;place-items:center;padding:0 10px;font-weight:600}
  .hintRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .hint{font-size:11px;color:var(--muted);flex:1;min-width:120px}
  .hint.warn{color:var(--vscode-errorForeground)}
  .statusRow{display:flex;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--muted)}
  .eng{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:999px;padding:1px 7px}
  .dot{width:7px;height:7px;border-radius:50%}
  .on{background:#3fb950}.off{background:#8b949e}
  .chipBtn{height:26px;border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:8px;padding:0 9px;font-size:11px;cursor:pointer}
  .chipBtn:hover{background:var(--hover);border-color:var(--focus)}
</style></head>
<body>
<div class="app">
  <div class="header">
    <div class="product">
      <span class="logo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="5" r="2.2" fill="#4fc3f7"/><circle cx="5.5" cy="17" r="2.2" fill="#81c784"/><circle cx="18.5" cy="17" r="2.2" fill="#ffb74d"/><path d="M12 7.2v3.2M12 10.4 6.2 15.4M12 10.4l5.8 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".6"/></svg></span>
      <span>Coorquestrador</span>
    </div>
    <div class="spacer"></div>
    <button class="iconBtn" id="coreBtn" title="Nucleo de agentes (trocar/atualizar)">&#x1F9E9;</button>
    <button class="iconBtn" data-cmd="coorq.probeEngines" title="Verificar cota dos assistentes">&#x1F4CA;</button>
    <button class="iconBtn" data-cmd="coorq.showDemands" title="Minhas tarefas">&#x2630;</button>
    <button class="iconBtn" id="reset" title="Nova conversa">&#x2715;</button>
  </div>

  <div class="thread" id="thread">
    <div class="welcome" id="welcome">
      <div class="welcomeTitle">O que vamos fazer?</div>
      <div class="welcomeText">Descreva o que precisa. Eu converso com voce para entender, e quando estiver pronto transformo em <b>Tarefa</b>, monto o plano (qual <b>Assistente</b> faz o que) e executo — sempre pedindo sua confirmacao antes. Escolha o assistente abaixo.</div>
      <div class="starterGrid">
        <button class="starter" data-starter="Preciso de ajuda para implementar uma nova funcionalidade. Vou te explicar o contexto e o objetivo."><b>Implementar algo novo</b><span>Descreva a ideia e eu ajudo a detalhar</span></button>
        <button class="starter" data-starter="Tenho um bug/erro para corrigir. Deixa eu descrever o que acontece."><b>Corrigir um problema</b><span>Conte o sintoma e o que esperava</span></button>
        <button class="starter" data-starter="Quero entender/analisar uma parte do projeto antes de decidir o que fazer."><b>Analisar o projeto</b><span>Explore antes de agir</span></button>
      </div>
    </div>
  </div>

  <div class="composerWrap">
    <div class="composer">
      <textarea id="txt" placeholder="Descreva o que precisa... (Enter envia, Shift+Enter quebra linha)"></textarea>
      <div class="composerBar">
        <span class="pill"><label>Assistente</label><select id="selEngine"></select></span>
        <span class="pill"><label>Modelo</label><select id="selModel"></select></span>
        <span class="pill"><label>Esforco</label><select id="selPower"></select></span>
        <button class="iconChip" id="redetect" title="Re-detectar assistentes instalados">&#x21bb;</button>
        <span class="barSpacer"></span>
        <button class="sendBtn" id="send" title="Enviar">Enviar</button>
      </div>
    </div>
    <div class="hintRow">
      <span class="hint" id="setupHint">Detectando assistentes instalados...</span>
      <button class="chipBtn" id="cfgBtn" style="display:none">&#x2699; Configurar</button>
    </div>
    <div class="statusRow" id="engList"></div>
  </div>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const thread = document.getElementById('thread');
  const welcome = document.getElementById('welcome');
  const txt = document.getElementById('txt');
  const selEngine = document.getElementById('selEngine');
  const selModel = document.getElementById('selModel');
  const selPower = document.getElementById('selPower');
  const hint = document.getElementById('setupHint');
  const cfgBtn = document.getElementById('cfgBtn');
  cfgBtn.onclick=()=>vscode.postMessage({type:'openSettings'});
  document.getElementById('coreBtn').onclick=()=>vscode.postMessage({type:'manageCore'});
  let installed = [];
  let activePack = '';
  let curAssistant = null;
  let execCard = null;

  function opt(v,l,sel){const o=document.createElement('option');o.value=v;o.textContent=l;if(sel)o.selected=true;return o;}
  function curEngine(){return installed.find(e=>e.id===selEngine.value);}
  function fillModels(s){const e=curEngine();selModel.innerHTML='';(e?e.models:[]).forEach(m=>selModel.appendChild(opt(m,m,m===(s&&s.model))));if(!selModel.value&&e)selModel.value=e.default_model||(e.models[0]||'');}
  function fillPowers(s){const e=curEngine();selPower.innerHTML='';const ps=(e&&e.powers&&e.powers.length)?e.powers:['low','normal','medium','high'];ps.forEach(p=>selPower.appendChild(opt(p,p,p===((s&&s.power)||'normal'))));}
  function pushSel(){vscode.postMessage({type:'select',engineId:selEngine.value,model:selModel.value,power:selPower.value});}
  selEngine.onchange=()=>{fillModels();fillPowers();pushSel();updateHint();};
  selModel.onchange=pushSel; selPower.onchange=pushSel;
  document.getElementById('redetect').onclick=()=>{hint.className='hint';hint.textContent='Re-detectando...';vscode.postMessage({type:'detect'});};

  function hideWelcome(){if(welcome)welcome.style.display='none';}
  function el(tag,cls,txt){const d=document.createElement(tag);if(cls)d.className=cls;if(txt!=null)d.textContent=txt;return d;}
  function scroll(){thread.scrollTop=thread.scrollHeight;}
  function row(role){const r=el('div','msgRow '+role);const av=el('div','avatar',role==='user'?'EU':'CO');const m=el('div','msg '+role);if(role==='user'){r.appendChild(m);r.appendChild(av);}else{r.appendChild(av);r.appendChild(m);}thread.appendChild(r);scroll();return m;}
  function add(role,t){hideWelcome();const m=row(role);m.textContent=t;scroll();return m;}
  function send(){const t=txt.value.trim();if(!t)return;vscode.postMessage({type:'chat',text:t});txt.value='';}
  document.getElementById('send').onclick=send;
  txt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
  document.getElementById('reset').onclick=()=>vscode.postMessage({type:'reset'});
  document.querySelectorAll('button[data-cmd]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'cmd',command:b.dataset.cmd}));
  document.querySelectorAll('button[data-starter]').forEach(b=>b.onclick=()=>{txt.value=b.dataset.starter;txt.focus();});

  function updateHint(){const e=curEngine();if(!installed.length)return;hint.className='hint';const a=e&&e.modelsAutoDetected?'  ·  modelos auto-detectados':'';const np=activePack?'  ·  nucleo: '+activePack:'';hint.textContent='Assistente: '+selEngine.value+(e&&e.binPath?'  ·  '+e.binPath:'')+np+a;}

  function fmtUnit(n,unit){if(unit==='acu')return (Math.round(n*10)/10)+' ACU';const v=n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'k':String(Math.round(n));return v+' tokens';}
  function card(){hideWelcome();const c=el('div','card');thread.appendChild(c);scroll();return c;}
  function infoLine(t){const c=card();c.appendChild(el('div','sub',t));}

  window.addEventListener('message',ev=>{
    const m=ev.data;
    if(m.type==='userMsg') add('user',m.text);
    else if(m.type==='assistantStart'){hideWelcome();curAssistant=row('assistant');curAssistant.innerHTML='<span class="typing"></span>';}
    else if(m.type==='assistantChunk'){if(curAssistant){if(curAssistant.querySelector('.typing'))curAssistant.textContent='';curAssistant.textContent+=m.text;scroll();}}
    else if(m.type==='assistantEnd'){if(curAssistant&&curAssistant.querySelector('.typing'))curAssistant.textContent='(sem resposta)';curAssistant=null;}
    else if(m.type==='offerCreate'){
      const r=el('div','inlineActions');const b=el('button','btn primary','+ Transformar em Tarefa');b.onclick=()=>{r.remove();vscode.postMessage({type:'createTask'});};r.appendChild(b);thread.appendChild(r);scroll();
    }
    else if(m.type==='error') add('err',m.text);
    else if(m.type==='info') infoLine(m.text);
    else if(m.type==='cleared'){thread.querySelectorAll('.msgRow,.card,.inlineActions').forEach(n=>n.remove());if(welcome)welcome.style.display='';}
    else if(m.type==='chooseProject'){
      const c=card();c.appendChild(el('h4',null,'Em qual projeto?'));
      const btns=el('div','cardBtns');
      m.projects.forEach(p=>{const b=el('button','btn',p);b.onclick=()=>{c.remove();vscode.postMessage({type:'projectChosen',project:p});};btns.appendChild(b);});
      c.appendChild(btns);
    }
    else if(m.type==='planStart') infoLine('Montando o plano... isso pode levar um momento.');
    else if(m.type==='planCard'){
      const c=card();
      c.appendChild(el('h4',null,'Plano: '+m.title));
      const consTxt=(m.consumption&&m.consumption.length)
        ? m.consumption.map(x=>x.engine+' ~'+fmtUnit(x.amount,x.unit)).join(' · ')
        : 'n/d';
      c.appendChild(el('div','sub',m.tasks.length+' etapa(s) · consumo estimado de cota: '+consTxt));
      m.tasks.forEach(t=>{
        const it=el('div','taskItem');
        const top=el('div','top');top.appendChild(el('span',null,t.engine+(t.model?' · '+t.model:'')+(t.power?' · '+t.power:'')));
        const right=t.blocked?'sem assistente':(t.cons?fmtUnit(t.cons.amount,t.cons.unit):t.size);
        top.appendChild(el('span','badge'+(t.blocked?' fail':''),right));
        it.appendChild(top);it.appendChild(el('div','desc',t.description||t.activity||t.id));
        it.dataset.id=t.id;c.appendChild(it);
      });
      const btns=el('div','cardBtns');
      const ok=el('button','btn primary','✓ Aprovar e executar');ok.onclick=()=>{btns.remove();vscode.postMessage({type:'approveExecute'});};
      const re=el('button','btn','↻ Replanejar');re.onclick=()=>{btns.remove();vscode.postMessage({type:'replan'});};
      const cancel=el('button','btn ghost','Cancelar');cancel.onclick=()=>{c.remove();vscode.postMessage({type:'cancelTask'});};
      btns.appendChild(ok);btns.appendChild(re);btns.appendChild(cancel);c.appendChild(btns);
    }
    else if(m.type==='execStart'){execCard=card();execCard.appendChild(el('h4',null,'Executando...'));}
    else if(m.type==='execUpdate'){
      if(!execCard)return;let it=execCard.querySelector('[data-id="'+m.id+'"]');
      if(!it){it=el('div','taskItem');it.dataset.id=m.id;const top=el('div','top');top.appendChild(el('span',null,m.id));const bd=el('span','badge');bd.dataset.b='1';top.appendChild(bd);it.appendChild(top);execCard.appendChild(it);}
      const bd=it.querySelector('[data-b]')||it.querySelector('.badge');
      const map={executando:['run','executando'],concluida:['done','concluida'],rejeitada:['fail','rejeitada'],revisao:['','em revisao'],aprovada:['','na fila']};
      const v=map[m.status]||['',m.status];bd.className='badge '+v[0];bd.textContent=v[1];scroll();
    }
    else if(m.type==='summary'){
      const c=card();c.appendChild(el('h4',null,m.status==='concluida'?'✓ Tarefa concluida':'Tarefa: '+m.status));
      c.appendChild(el('div','sub',m.done+' de '+m.total+' etapa(s) concluida(s)'));
    }
    else if(m.type==='installed'){
      installed=m.engines||[];selEngine.innerHTML='';
      if(installed.length===0){hint.className='hint warn';hint.textContent=m.error||'Nenhum assistente reconhecido. Instale/autentique um CLI e clique em re-detectar.';cfgBtn.style.display='';selModel.innerHTML='';selPower.innerHTML='';return;}
      cfgBtn.style.display='none';const s=m.selection||{};
      installed.forEach(e=>selEngine.appendChild(opt(e.id,e.id,e.id===s.engineId)));
      if(!selEngine.value)selEngine.value=installed[0].id;
      fillModels(s);fillPowers(s);updateHint();pushSel();
    }
    else if(m.type==='pack'){ activePack=m.name||''; updateHint(); }
    else if(m.type==='engines'){
      const le=document.getElementById('engList');
      if(!m.engines||!m.engines.length){le.innerHTML='';return;}
      le.innerHTML=m.engines.map(s=>{const on=s.state==='disponivel';const cred=s.creditRemaining!=null?' · cota '+s.creditRemaining+'%':'';return '<span class="eng"><span class="dot '+(on?'on':'off')+'"></span>'+s.id+' · '+s.state+cred+'</span>';}).join('');
    }
  });
</script>
</body></html>`;
  }
}
