// src/ui/trees.ts
// TreeDataProviders das views da activity bar: Demandas e Engines.

import * as vscode from "vscode";
import { DemandStore } from "../core/demandStore";
import { Demand, EngineSnapshot, Task } from "../core/types";

// Nó de projeto (agrupador) que carrega suas demandas.
class ProjectNode extends vscode.TreeItem {
  constructor(public readonly project: string, public readonly demands: Demand[]) {
    super(project, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "project";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.description = `${demands.length} demanda(s)`;
  }
}

export class DemandNode extends vscode.TreeItem {
  constructor(public readonly demand: Demand) {
    super(demand.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${demand.status} · ${quotaSummary(demand)}`;
    this.tooltip = `${demand.id}\n${demand.description}`;
    this.iconPath = new vscode.ThemeIcon(iconForStatus(demand.status));
    this.contextValue = "demand";
  }
}

export class TaskNode extends vscode.TreeItem {
  constructor(public readonly demand: Demand, public readonly task: Task) {
    super(task.activity || task.description || task.id, vscode.TreeItemCollapsibleState.None);
    this.description = `${task.status} · ${task.engine || "sem assistente"}${task.logFile ? " · log" : ""}`;
    this.tooltip = [
      task.id,
      task.description,
      `Aceite: ${task.acceptance || "n/d"}`,
      `Cota: ${task.estimatedQuota != null ? `${Math.round(task.estimatedQuota).toLocaleString("pt-BR")} ${task.quotaUnit || ""}` : "n/d"}`,
      task.logFile ? `Log: ${task.logFile}` : "",
    ].filter(Boolean).join("\n");
    this.iconPath = new vscode.ThemeIcon(iconForTaskStatus(task.status));
    this.contextValue = task.logFile ? "taskWithLog" : "task";
    this.command = {
      command: "coorq.showTaskDetails",
      title: "Detalhes da tarefa",
      arguments: [this],
    };
    if (task.logFile) {
      this.tooltip += "\nClique para ver detalhes; use o menu de contexto para abrir o log.";
    }
  }
}

export class DemandsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private storeFactory: () => DemandStore | null) {}

  refresh() { this._onDidChange.fire(); }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(el?: vscode.TreeItem): vscode.TreeItem[] {
    if (el instanceof DemandNode) {
      return el.demand.tasks.map((t) => new TaskNode(el.demand, t));
    }
    // Nivel 2: demandas de um projeto.
    if (el instanceof ProjectNode) {
      return el.demands.map((d) => new DemandNode(d));
    }
    if (el) return [];

    // Nivel 1: projetos.
    const store = this.storeFactory();
    if (!store) {
      const item = new vscode.TreeItem("Abra um projeto ou configure coorq.rootPath", vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }
    let demands: Demand[];
    try { demands = store.list(); } catch { demands = []; }
    if (demands.length === 0) {
      return [new vscode.TreeItem("(nenhuma demanda)", vscode.TreeItemCollapsibleState.None)];
    }
    const byProject = new Map<string, Demand[]>();
    for (const d of demands) {
      const arr = byProject.get(d.project) || [];
      arr.push(d);
      byProject.set(d.project, arr);
    }
    return [...byProject.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([project, ds]) => new ProjectNode(project, ds));
  }
}

function quotaSummary(d: Demand): string {
  const parts = Object.entries(d.estimatedQuotaByEngine || {})
    .map(([engine, q]) => `${engine}: ${Math.round(q.amount).toLocaleString("pt-BR")} ${q.unit}`);
  return parts.length ? parts.join(" · ") : `${d.tasks.length} etapa(s)`;
}

function iconForStatus(status: Demand["status"]): string {
  switch (status) {
    case "concluida": return "pass-filled";
    case "em-execucao": return "sync";
    case "aguardando-gate1": return "shield";
    case "bloqueada": return "error";
    case "planejada": return "checklist";
    default: return "circle-outline";
  }
}

function iconForTaskStatus(status: Task["status"]): string {
  switch (status) {
    case "concluida": return "pass";
    case "executando": return "sync";
    case "revisao": return "eye";
    case "rejeitada": return "error";
    case "bloqueada": return "circle-slash";
    case "aprovada": return "play";
    default: return "circle-outline";
  }
}

export class EnginesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private snapshots: EngineSnapshot[] = [];

  setSnapshots(snaps: EngineSnapshot[]) { this.snapshots = snaps; this._onDidChange.fire(); }
  refresh() { this._onDidChange.fire(); }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(el?: vscode.TreeItem): vscode.TreeItem[] {
    if (el) return [];
    if (this.snapshots.length === 0) {
      return [new vscode.TreeItem("Rode o Probe de engines", vscode.TreeItemCollapsibleState.None)];
    }
    return this.snapshots.map((s) => {
      const item = new vscode.TreeItem(s.id, vscode.TreeItemCollapsibleState.None);
      item.description = `${s.state}${s.creditRemaining != null ? ` · cota ${s.creditRemaining}%` : ""}`;
      item.tooltip = `${s.detail}\nprobed: ${s.probedAt}`;
      item.iconPath = new vscode.ThemeIcon(s.state === "disponivel" ? "vm-running" : "vm-outline");
      return item;
    });
  }
}
