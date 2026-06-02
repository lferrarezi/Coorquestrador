// src/extension.ts
// Ponto de entrada da extensao. Conecta comandos -> probe -> plano -> Gate 1 -> execucao -> revisao -> reconciliacao.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CoorqConfig } from "./core/config";
import { applyCliDiscoveryToEnginesFile, probeAll, eligible, discoverInstalledClis } from "./core/prober";
import { estimateDemand, estimateDemandQuota } from "./core/estimator";
import { runDemandExecution } from "./core/executionService";
import { DemandStore } from "./core/demandStore";
import { buildPlannerPrompt, parsePlan, runPlanner } from "./core/planner";
import { validatePlan } from "./core/planValidation";
import { importPack, readManifest } from "./core/agentPacks";
import { gate1PlanCost, gate2Delivery } from "./ui/gates";
import { DemandNode, DemandsProvider, EnginesProvider, TaskNode } from "./ui/trees";
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

function projectContext(root: string): string {
  const dir = root;
  const parts: string[] = [];
  for (const f of ["AGENTS.md", "SQUAD.md", ".specify/memory/constitution.md"]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) parts.push(`## ${f}\n` + fs.readFileSync(p, "utf8").slice(0, 4000));
  }
  return parts.join("\n\n");
}

function ensureWorkspaceConfig() {
  const c = cfg();
  if (!c.root) return null;
  const conf = new CoorqConfig(c.root, c.configDir);
  conf.ensureProjectDefaults();
  return conf;
}

async function discoverAndShowClis(
  out: vscode.OutputChannel,
  enginesProvider: EnginesProvider,
  context: vscode.ExtensionContext
) {
  const c = cfg();
  let confEngines;
  if (c.root) {
    const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
    if (fs.existsSync(conf.enginesPath())) {
      try { confEngines = conf.loadEngines(); } catch { /* discovery still works without project config */ }
    }
  }
  const timeout = confEngines?.defaults?.probe_timeout_seconds || 10;
  const found = await discoverInstalledClis(timeout, confEngines);
  await context.globalState.update("coorq.cliDiscovery", found);
  out.appendLine("Discovery de CLIs:");
  for (const cli of found) {
    if (!cli.installed) continue;
    const models = cli.models.length ? ` modelos=${cli.models.join(", ")}` : " modelos=n/d";
    out.appendLine(`  ${cli.id}: ${cli.binPath}${models}${cli.modelsAutoDetected ? " (auto)" : " (fallback)"}`);
  }
  enginesProvider.setSnapshots(found.map((cli) => ({
    id: cli.id,
    state: cli.installed ? "disponivel" : "offline",
    creditRemaining: null,
    probedAt: new Date().toISOString(),
    detail: cli.installed
      ? `${cli.binPath}${cli.models.length ? ` · modelos: ${cli.models.join(", ")}` : ""}`
      : cli.detail || "CLI nao encontrado",
  })));
  return found;
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

  ensureWorkspaceConfig();
  discoverAndShowClis(out, enginesProvider, context).catch((e: any) => {
    out.appendLine(`Falha no discovery inicial de CLIs: ${e.message}`);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.openTaskLog", async (node?: TaskNode) => {
      const file = node?.task?.logFile;
      if (!file) { vscode.window.showInformationMessage("Tarefa sem log persistido."); return; }
      try {
        await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
      } catch (e: any) {
        vscode.window.showErrorMessage(`Falha ao abrir log: ${e.message}`);
      }
    }),
    vscode.commands.registerCommand("coorq.copyDemandSummary", async (node?: DemandNode) => {
      const d = node?.demand;
      if (!d) { vscode.window.showInformationMessage("Selecione uma tarefa/demanda na arvore."); return; }
      const quota = Object.entries(d.estimatedQuotaByEngine || {})
        .map(([engine, q]) => `${engine}: ${Math.round(q.amount).toLocaleString("pt-BR")} ${q.unit}`)
        .join(" | ") || "cota n/d";
      const lines = [
        `${d.id} [${d.project}] ${d.title}`,
        `status: ${d.status}`,
        `cota: ${quota}`,
        "",
        ...d.tasks.map((t) => `- ${t.id} ${t.status} ${t.engine || "sem-assistente"} ${t.model || ""} ${t.logFile ? `log=${t.logFile}` : ""}`.trim()),
      ];
      await vscode.env.clipboard.writeText(lines.join("\n"));
      vscode.window.showInformationMessage("Resumo copiado.");
    })
  );

  // NUCLEO DE AGENTES (pacotes trocaveis)
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.manageAgentCore", async () => {
      const c = cfg();
      if (!c.root) { vscode.window.showErrorMessage("Configure coorq.rootPath primeiro."); return; }
      const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
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
      const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
      conf.ensureStateFile();
      const store = new DemandStore(conf.statePath());

      const title = await vscode.window.showInputBox({ prompt: "Titulo da demanda" });
      if (!title) return;
      const description = await vscode.window.showInputBox({ prompt: "Descreva a demanda" });
      if (!description) return;

      const demand: Demand = {
        id: `D-${Date.now()}`,
        project: ".", title, description,
        createdAt: new Date().toISOString(),
        status: "nova", tasks: [],
      };
      store.upsert(demand);
      demandsProvider.refresh();
      out.appendLine(`Nova demanda ${demand.id} - ${title} [projeto aberto] (status: nova)`);
      vscode.window.showInformationMessage(
        `Demanda ${demand.id} criada. Rode "Planejar demanda" para roteamento e cota.`
      );
    })
  );

  // PROBE
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.discoverClis", async () => {
      out.show();
      const found = await discoverAndShowClis(out, enginesProvider, context);
      const installed = found.filter((cli) => cli.installed);
      vscode.window.showInformationMessage(
        installed.length
          ? `CLIs detectados: ${installed.map((cli) => `${cli.id}${cli.models.length ? ` (${cli.models.length} modelo(s))` : ""}`).join(", ")}`
          : "Nenhum CLI conhecido encontrado no PATH."
      );
      return found;
    }),
    vscode.commands.registerCommand("coorq.probeEngines", async () => {
      const c = cfg();
      const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
      let ef = conf.loadEngines();
      out.show();
      const discovered = await discoverAndShowClis(out, enginesProvider, context);
      ef = applyCliDiscoveryToEnginesFile(ef, discovered);
      out.appendLine(`CLIs instalados: ${discovered.filter((cli) => cli.installed).map((cli) => cli.id).join(", ") || "(nenhum)"}`);
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
      const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
      conf.ensureStateFile();
      let ef = conf.loadEngines();
      const cost = conf.loadCost();
      const store = new DemandStore(conf.statePath());

      const title = await vscode.window.showInputBox({ prompt: "Titulo da demanda" });
      if (!title) return;
      const description = await vscode.window.showInputBox({ prompt: "Descreva a demanda" });
      if (!description) return;

      const demand: Demand = {
        id: `D-${Date.now()}`,
        project: ".", title, description,
        createdAt: new Date().toISOString(),
        status: "nova", tasks: [],
      };

      out.show();
      out.appendLine(`Planejando ${demand.id} - ${title}`);
      const discovered = await discoverInstalledClis(ef.defaults.probe_timeout_seconds, ef);
      ef = applyCliDiscoveryToEnginesFile(ef, discovered);
      const snaps = await probeAll(ef);
      const enginesMeta: any = {};
      for (const [id, e] of Object.entries(ef.engines))
        enginesMeta[id] = { models: e.models, powers: e.powers, best_for: e.best_for, unit: e.unit, location: e.location };

      conf.ensureAgentPacks();
      const agentSpec = fs.existsSync(conf.agentPath()) ? fs.readFileSync(conf.agentPath(), "utf8") : "(agente coorquestrador)";
      const prompt = buildPlannerPrompt({
        agentSpec, skills: conf.loadSkills(), demand,
        projectContext: projectContext(c.root),
        snapshot: snaps, enginesMeta,
      });

      const plannerCfg = ef.engines[c.plannerEngine];
      const raw = await runPlanner(plannerCfg, prompt, c.root, ef.defaults.exec_timeout_seconds);
      demand.tasks = parsePlan(raw);
      const validation = validatePlan(demand.tasks, ef, snaps);
      if (!validation.valid) {
        out.appendLine(`Plano invalido para ${demand.id}:`);
        validation.errors.forEach((e) => out.appendLine(`  - ${e}`));
        vscode.window.showErrorMessage(`Plano invalido: ${validation.errors.slice(0, 3).join(" | ")}`);
        return;
      }
      validation.warnings.forEach((w) => out.appendLine(`Aviso de plano: ${w}`));

      const quota = estimateDemandQuota(demand.tasks, cost);
      const est = estimateDemand(demand.tasks, cost);
      demand.tasks.forEach((t) => {
        const q = quota.perTask[t.id];
        t.quotaUnit = q.unit;
        t.estimatedQuota = q.amount;
        t.estimatedCost = est.perTask[t.id] || 0;
      });
      demand.estimatedQuotaByEngine = quota.byEngine;
      demand.estimatedTotal = est.total;
      demand.status = "aguardando-gate1";
      store.upsert(demand);
      demandsProvider.refresh();

      const quotaText = Object.entries(quota.totalByUnit)
        .map(([unit, amount]) => `${Math.round(amount).toLocaleString("pt-BR")} ${unit}`)
        .join(" + ");
      out.appendLine(`Plano: ${demand.tasks.length} tarefas. Cota estimada: ${quotaText || "n/d"}`);
      vscode.window.showInformationMessage(
        `Demanda ${demand.id} planejada. Rode "Executar plano aprovado" para passar pelo Gate 1.`
      );
    })
  );

  // EXECUTE (com Gate 1 obrigatorio)
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.executeApproved", async () => {
      const c = cfg();
      const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
      let ef = conf.loadEngines();
      ef = applyCliDiscoveryToEnginesFile(ef, await discoverInstalledClis(ef.defaults.probe_timeout_seconds, ef));
      const cost = conf.loadCost();
      const store = new DemandStore(conf.statePath());

      const pending = store.list().filter((d) => d.status === "aguardando-gate1");
      if (pending.length === 0) { vscode.window.showInformationMessage("Nenhuma demanda aguardando Gate 1."); return; }
      const pick = await vscode.window.showQuickPick(
        pending.map((d) => ({
          label: d.title,
          description: Object.entries(d.estimatedQuotaByEngine || {})
            .map(([engine, q]) => `${engine}: ${Math.round(q.amount).toLocaleString("pt-BR")} ${q.unit}`)
            .join(" · ") || "cota n/d",
          id: d.id,
        })),
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

      await runDemandExecution({
        demand,
        store,
        enginesFile: ef,
        costTable: cost,
        root: c.root,
        configDir: c.configDir,
        maxParallel: c.maxParallel,
        gate1Approved: approved,
        onUpdate: ({ task }) => {
          demandsProvider.refresh();
          out.appendLine(`  ${task.id} -> ${task.status}${task.logFile ? ` (${task.logFile})` : ""}`);
        },
        reviewGate2: ({ task, reasons }) => gate2Delivery(task, reasons),
      });

      demandsProvider.refresh();
      const final = store.get(demand.id)!;
      out.appendLine(`Concluido ${demand.id}: status=${final.status}`);
      vscode.window.showInformationMessage(`Demanda ${demand.id} ${final.status}.`);
    })
  );

  // LISTA
  context.subscriptions.push(
    vscode.commands.registerCommand("coorq.showDemands", async () => {
      const c = cfg();
      const conf = ensureWorkspaceConfig() || new CoorqConfig(c.root, c.configDir);
      const store = new DemandStore(conf.statePath());
      await vscode.commands.executeCommand("coorq.demands.focus");
      demandsProvider.refresh();
      out.show();
      out.appendLine("=== Demandas ===");
      const demands = store.list();
      if (demands.length === 0) {
        out.appendLine("(nenhuma tarefa registrada)");
        vscode.window.showInformationMessage("Nenhuma tarefa registrada no Coorquestrador.");
        return;
      }
      for (const d of demands)
        out.appendLine(`${d.id} [${d.project}] ${d.title} - ${d.status} - cota ${JSON.stringify(d.estimatedQuotaByEngine || {})}`);
    })
  );
}

export function deactivate() {}
