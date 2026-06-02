"use strict";
// src/ui/trees.ts
// TreeDataProviders das views da activity bar: Demandas e Engines.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnginesProvider = exports.DemandsProvider = void 0;
const vscode = __importStar(require("vscode"));
// Nó de projeto (agrupador) que carrega suas demandas.
class ProjectNode extends vscode.TreeItem {
    constructor(project, demands) {
        super(project, vscode.TreeItemCollapsibleState.Expanded);
        this.project = project;
        this.demands = demands;
        this.contextValue = "project";
        this.iconPath = new vscode.ThemeIcon("folder");
        this.description = `${demands.length} demanda(s)`;
    }
}
class DemandsProvider {
    constructor(storeFactory) {
        this.storeFactory = storeFactory;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() { this._onDidChange.fire(); }
    getTreeItem(el) { return el; }
    getChildren(el) {
        // Nivel 2: demandas de um projeto.
        if (el instanceof ProjectNode) {
            return el.demands.map((d) => {
                const item = new vscode.TreeItem(d.title, vscode.TreeItemCollapsibleState.None);
                item.description = `${d.status} · est $${(d.estimatedTotal || 0).toFixed(2)} / real $${(d.realTotal || 0).toFixed(2)}`;
                item.tooltip = `${d.id}\n${d.description}`;
                item.iconPath = new vscode.ThemeIcon(iconForStatus(d.status));
                item.contextValue = "demand";
                return item;
            });
        }
        if (el)
            return [];
        // Nivel 1: projetos.
        const store = this.storeFactory();
        if (!store) {
            const item = new vscode.TreeItem("Configure coorq.rootPath", vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon("warning");
            return [item];
        }
        let demands;
        try {
            demands = store.list();
        }
        catch {
            demands = [];
        }
        if (demands.length === 0) {
            return [new vscode.TreeItem("(nenhuma demanda)", vscode.TreeItemCollapsibleState.None)];
        }
        const byProject = new Map();
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
exports.DemandsProvider = DemandsProvider;
function iconForStatus(status) {
    switch (status) {
        case "concluida": return "pass-filled";
        case "em-execucao": return "sync";
        case "aguardando-gate1": return "shield";
        case "bloqueada": return "error";
        case "planejada": return "checklist";
        default: return "circle-outline";
    }
}
class EnginesProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
        this.snapshots = [];
    }
    setSnapshots(snaps) { this.snapshots = snaps; this._onDidChange.fire(); }
    refresh() { this._onDidChange.fire(); }
    getTreeItem(el) { return el; }
    getChildren(el) {
        if (el)
            return [];
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
exports.EnginesProvider = EnginesProvider;
//# sourceMappingURL=trees.js.map