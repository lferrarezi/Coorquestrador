// src/extension.ts
// Ponto de entrada da extensao. Conecta comandos -> probe -> plano -> Gate 1 -> execucao -> revisao -> reconciliacao.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CoorqConfig } from "./core/config";
import { probeAll, eligible } from "./core/prober";
import { estimateDemand, crossesGate2 } from "./core/estimator";
import { buildCommand } from "./core/commandBuilder";
import { executePlan } from "./core/executor";
import { DemandStore } from "./core/demandStore";
import { buildPlannerPrompt, parsePlan, runPlanner } from "./core/planner";
import { importPack, readManifest } from "./core/agentPacks";
import { gate1PlanCost, gate2Delivery } from "./ui/gates";
import { DemandsProvider, EnginesProvider } from "./ui/trees";
import { ChatPanelProvider } from "./ui/chatPanel";
import { Demand, Task } from "./core/types";

function cfg() {
  const c = vscode.workspace.getConfiguration("coorq");
  const root = c.get<string>("rootPath") || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  return {
    root,
    configDir: c.get<string>("configDir") || ".coorq",
    plannerEngine: c.get<string>("plannerEngine") || "claude-code",
    maxParallel: c.get<number>("maxParallel") || 3,
    requireGate1: c.get<boolean>("requireGate1") ?? true,
  };
}

function projectContext(root: string, project: string): string {
  const dir = path.join(root, project);
  const parts: string[] = [];
  for (const f of ["AGENTS.md", "SQUAD.md", ".specify/memory/constitution.md"]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) parts.push(`## ${f}\n` + fs.readFileSync(p, "utf8").slice(0, 4000));
  }
  return parts.join("\n\n");
}

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("Coorquestrador");

  // VIEWS (activity bar)
  const storeFactory = () => {
    const c = cfg();
    if (!c.root) return null;
    return new DemandStore(new CoorqConfig(c.root, c.configDir).statePath());
  };
  const demandsProvider = new DemandsProvider(storeFactory);
  const enginesProvider = new EnginesProvider();
  const chatProvider = new ChatPanelProvider({
    cfg: () => { const c = cfg(); return { root: c.root, configDir: c.configDir, plannerEngine: c.plannerEngine, maxParallel: c.maxParallel }; },
    log: (s) => out.appendLine(s),
    state: context.globalState,
    refreshDemands: () => demandsProvider.refresh(),
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, chatProvider),
    vscode.window.registerTreeDataProvider("coorq.demands", demandsProvider),
    vscode.window.registerTreeDataProvider("coorq.engines", enginesProvider)
  );

  // NUCLEO DE AGENTES (pacotes trocaveis)
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.manageAgentCore", async () => {
      const c = cfg();
      if (!c.root) { vscode.window.showErrorMessage("Configure coorq.rootPath primeiro."); return; }
      const conf = new CoorqConfig(c.root, c.configDir);
      conf.ensureAgentPacks();
      const active = conf.activePack();
      const packs = conf.listPacks();
      const items: vscode.QuickPickItem[] = packs.map((p) => {
        const m = readManifest(conf.packDir(p), p);
        const meta = `v${m.version}${(m.skills?.length ? ` · ${m.skills.length} skill(s)` : "")}${p === active ? " · ativo" : ""}`;
        return {
          label: (p === active ? "$(check) " : "") + p,
          description: meta,
          detail: m.description || undefined,
        };
      });
      const IMPORT = "$(cloud-download) Importar novo nucleo (pasta ou .zip)...";
      items.push({ label: IMPORT, description: "agents/skills/tools do seu squad" });
      const pick = await vscode.window.showQuickPick(items, { placeHolder: `Nucleo de agentes ativo: ${active}` });
      if (!pick) return;

      if (pick.label === IMPORT) {
        const sel = await vscode.window.showOpenDialog({
          canSelectFiles: true, canSelectFolders: true, canSelectMany: false,
          openLabel: "Importar nucleo", filters: { "Pacote": ["zip"] },
        });
        if (!sel || sel.length === 0) return;
        const src = sel[0].fsPath;
        const name = await vscode.window.showInputBox({
          prompt: "Nome do nucleo (ex.: squad-pagamentos)",
          value: path.basename(src).replace(/\.zip$/i, ""),
        });
        if (!name) return;
        try {
          const r = importPack(conf, src, name);
          if (!r.agentFound) {
            vscode.window.showWarningMessage(`Nucleo "${r.name}" importado, mas sem coorquestrador.agent.md. O planejamento usara o contrato padrao.`);
          }
          conf.setActivePack(r.name);
          vscode.window.showInformationMessage(`Nucleo "${r.name}" v${r.manifest.version} importado e ativado (${r.skills} skill(s)).`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Falha ao importar nucleo: ${e.message}`);
        }
      } else {
        const name = pick.label.replace("$(check) ", "");
        conf.setActivePack(name);
        vscode.window.showInformationMessage(`Nucleo ativo: ${name}`);
      }
    })
  );

  // NOVA DEMANDA
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.newDemand", async () => {
      const c = cfg();
      if (!c.root) { vscode.window.showErrorMessage("Configure coorq.rootPath primeiro."); return; }
      const conf = new CoorqConfig(c.root, c.configDir);
      conf.ensureStateFile();
      const store = new DemandStore(conf.statePath());

      const project = await vscode.window.showQuickPick(conf.listProjects(), { placeHolder: "Projeto-alvo" });
      if (!project) return;
      const title = await vscode.window.showInputBox({ prompt: "Titulo da demanda" });
      if (!title) return;
      const description = await vscode.window.showInputBox({ prompt: "Descreva a demanda" });
      if (!description) return;

      const demand: Demand = {
        id: `D-${Date.now()}`,
        project, title, description,
        createdAt: new Date().toISOString(),
        status: "nova", tasks: [],
      };
      store.upsert(demand);
      demandsProvider.refresh();
      out.appendLine(`Nova demanda ${demand.id} - ${title} [${project}] (status: nova)`);
      vscode.window.showInformationMessage(
        `Demanda ${demand.id} criada. Rode "Planejar demanda" para roteamento e custo.`
      );
    })
  );

  // PROBE
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.probeEngines", async () => {
      const c = cfg();
      const conf = new CoorqConfig(c.root, c.configDir);
      const ef = conf.loadEngines();
      out.show();
      out.appendLine("Probing engines...");
      const snaps = await probeAll(ef);
      for (const s of snaps) out.appendLine(`  ${s.id}: ${s.state} (cota=${s.creditRemaining != null ? s.creditRemaining + "%" : "n/d"}) ${s.detail}`);
      const ok = eligible(snaps, ef.defaults.min_credit_threshold);
      out.appendLine(`Elegiveis para roteamento: ${ok.map((s) => s.id).join(", ") || "(nenhum)"}`);
      enginesProvider.setSnapshots(snaps);
      chatProvider.setEngines(snaps);
      return snaps;
    })
  );

  // PLAN
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.planDemand", async () => {
      const c = cfg();
      const conf = new CoorqConfig(c.root, c.configDir);
      conf.ensureStateFile();
      const ef = conf.loadEngines();
      const cost = conf.loadCost();
      const store = new DemandStore(conf.statePath());

      const project = await vscode.window.showQuickPick(conf.listProjects(), { placeHolder: "Projeto-alvo" });
      if (!project) return;
      const title = await vscode.window.showInputBox({ prompt: "Titulo da demanda" });
      if (!title) return;
      const description = await vscode.window.showInputBox({ prompt: "Descreva a demanda" });
      if (!description) return;

      const demand: Demand = {
        id: `D-${Date.now()}`,
        project, title, description,
        createdAt: new Date().toISOString(),
        status: "nova", tasks: [],
      };

      out.show();
      out.appendLine(`Planejando ${demand.id} - ${title}`);
      const snaps = await probeAll(ef);
      const enginesMeta: any = {};
      for (const [id, e] of Object.entries(ef.engines))
        enginesMeta[id] = { models: e.models, powers: e.powers, best_for: e.best_for, unit: e.unit, location: e.location };

      conf.ensureAgentPacks();
      const agentSpec = fs.existsSync(conf.agentPath()) ? fs.readFileSync(conf.agentPath(), "utf8") : "(agente coorquestrador)";
      const prompt = buildPlannerPrompt({
        agentSpec, skills: conf.loadSkills(), demand,
        projectContext: projectContext(c.root, project),
        snapshot: snaps, enginesMeta,
      });

      const plannerCfg = ef.engines[c.plannerEngine];
      const raw = await runPlanner(plannerCfg, prompt, path.join(c.root, project), ef.defaults.exec_timeout_seconds);
      demand.tasks = parsePlan(raw);

      const est = estimateDemand(demand.tasks, cost);
      demand.tasks.forEach((t) => (t.estimatedCost = est.perTask[t.id] || 0));
      demand.estimatedTotal = est.total;
      demand.status = "aguardando-gate1";
      store.upsert(demand);
      demandsProvider.refresh();

      out.appendLine(`Plano: ${demand.tasks.length} tarefas. Total estimado $${est.total.toFixed(2)}`);
      vscode.window.showInformationMessage(
        `Demanda ${demand.id} planejada. Rode "Executar plano aprovado" para passar pelo Gate 1.`
      );
    })
  );

  // EXECUTE (com Gate 1 obrigatorio)
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.executeApproved", async () => {
      const c = cfg();
      const conf = new CoorqConfig(c.root, c.configDir);
      const ef = conf.loadEngines();
      const cost = conf.loadCost();
      const store = new DemandStore(conf.statePath());

      const pending = store.list().filter((d) => d.status === "aguardando-gate1");
      if (pending.length === 0) { vscode.window.showInformationMessage("Nenhuma demanda aguardando Gate 1."); return; }
      const pick = await vscode.window.showQuickPick(
        pending.map((d) => ({ label: d.title, description: `$${(d.estimatedTotal || 0).toFixed(2)}`, id: d.id })),
        { placeHolder: "Demanda para executar" }
      );
      if (!pick) return;
      const demand = store.get((pick as any).id)!;

      // GATE 1 (obrigatorio)
      const approved = await gate1PlanCost(demand);
      if (!approved) {
        demand.status = "planejada";
        store.upsert(demand);
        demandsProvider.refresh();
        out.appendLine(`Gate 1 rejeitado em ${demand.id}. Replanejar.`);
        return;
      }
      demand.tasks.forEach((t) => { if (t.status === "planejada") t.status = "aprovada"; });
      demand.status = "em-execucao";
      store.upsert(demand);

      const cwd = path.join(c.root, demand.project);
      const specDir = path.join(c.root, c.configDir, "specs", demand.id);

      await executePlan({
        tasks: demand.tasks, cwd,
        maxParallel: Math.min(c.maxParallel, ef.defaults.max_parallel),
        execTimeoutSec: ef.defaults.exec_timeout_seconds,
        gate1Approved: approved,
        buildFn: (t) => {
          const ecfg = ef.engines[t.engine!];
          const sdd = `# Tarefa ${t.id}\n${t.description}\n\n## Criterio de aceite\n${t.acceptance}`;
          const built = buildCommand(t, ecfg, sdd, cwd, specDir);
          return built;
        },
        onUpdate: (t) => { store.upsert(demand); demandsProvider.refresh(); out.appendLine(`  ${t.id} -> ${t.status}`); },
      });

      // Revisao + Gate 2 condicional
      for (const t of demand.tasks.filter((x) => x.status === "revisao")) {
        const reasons: string[] = [];
        if (crossesGate2(t.estimatedCost || 0, cost)) reasons.push("custo acima do teto");
        // hooks futuros: detectar commit/push, prod, dados sensiveis
        let ok = true;
        if (reasons.length) ok = await gate2Delivery(t, reasons);
        t.status = ok ? "concluida" : "rejeitada";
        t.realCost = t.realCost ?? t.estimatedCost; // sem credit_probe, assume estimado
        store.upsert(demand);
      }

      store.reconcile(demand.id);
      demandsProvider.refresh();
      const final = store.get(demand.id)!;
      out.appendLine(`Concluido ${demand.id}: status=${final.status} custo_real=$${(final.realTotal || 0).toFixed(2)}`);
      vscode.window.showInformationMessage(`Demanda ${demand.id} ${final.status}.`);
    })
  );

  // LISTA
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.showDemands", async () => {
      const c = cfg();
      const conf = new CoorqConfig(c.root, c.configDir);
      const store = new DemandStore(conf.statePath());
      out.show();
      out.appendLine("=== Demandas ===");
      for (const d of store.list())
        out.appendLine(`${d.id} [${d.project}] ${d.title} - ${d.status} - est $${(d.estimatedTotal||0).toFixed(2)} / real $${(d.realTotal||0).toFixed(2)}`);
    })
  );
}

export function deactivate() {}
