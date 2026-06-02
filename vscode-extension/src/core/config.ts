// src/core/config.ts
// Carrega as configuracoes (engines, custos, gates) da pasta .coorq do projeto.

import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { EngineConfig } from "./types";

export interface CostTable {
  currency: string;
  power_multiplier: Record<string, number>;
  models: Record<string, { unit: "token" | "acu"; price_per_million?: number; price_per_acu?: number }>;
  task_size_tokens: Record<string, number>;
  task_size_acu: Record<string, number>;
  quota_gate2_threshold?: Partial<Record<"token" | "acu", number>>;
  cost_gate2_threshold: number;
}

export interface EnginesFile {
  defaults: {
    min_credit_threshold: number;
    probe_timeout_seconds: number;
    exec_timeout_seconds: number;
    max_parallel: number;
  };
  engines: Record<string, EngineConfig>;
}

function readYaml<T>(file: string): T {
  const raw = fs.readFileSync(file, "utf8");
  return YAML.parse(raw) as T;
}

export class CoorqConfig {
  constructor(
    public readonly root: string,
    public readonly configDir: string
  ) {}

  private p(name: string): string {
    return path.join(this.root, this.configDir, name);
  }

  enginesPath() { return this.p("engines.yaml"); }
  costPath() { return this.p("cost-table.yaml"); }
  gatesPath() { return this.p("coorq-hitl-gates.yaml"); }
  statePath() { return this.p("state/demands.json"); }
  logsDir(demandId?: string) { return demandId ? this.p(path.join("logs", demandId)) : this.p("logs"); }

  // ---------- Pacotes de Agentes (nucleo trocavel) ----------
  packsDir() { return this.p("agent-packs"); }
  private activePackFile() { return this.p("active-pack"); }
  private legacyAgentPath() { return this.p("agent/coorquestrador.agent.md"); }

  /** Lista os pacotes de agentes instalados (subpastas de agent-packs). */
  listPacks(): string[] {
    const dir = this.packsDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name).sort();
  }

  /** Nome do pacote ativo (default: "base" ou o primeiro existente). */
  activePack(): string {
    const f = this.activePackFile();
    if (fs.existsSync(f)) {
      const name = fs.readFileSync(f, "utf8").trim();
      if (name && fs.existsSync(path.join(this.packsDir(), name))) return name;
    }
    const packs = this.listPacks();
    return packs.includes("base") ? "base" : (packs[0] || "base");
  }

  setActivePack(name: string) {
    fs.mkdirSync(path.dirname(this.activePackFile()), { recursive: true });
    fs.writeFileSync(this.activePackFile(), name, "utf8");
  }

  packDir(name?: string) { return path.join(this.packsDir(), name || this.activePack()); }

  /** Caminho do agente do pacote ativo; cai no legado se nao houver pacote. */
  agentPath() {
    const inPack = path.join(this.packDir(), "coorquestrador.agent.md");
    if (fs.existsSync(inPack)) return inPack;
    return this.legacyAgentPath();
  }

  /** Concatena as SKILL.md do pacote ativo (para injetar no prompt do planner). */
  loadSkills(maxChars = 12000): string {
    const sdir = path.join(this.packDir(), "skills");
    if (!fs.existsSync(sdir)) return "";
    const parts: string[] = [];
    for (const d of fs.readdirSync(sdir, { withFileTypes: true })) {
      const sk = d.isDirectory() ? path.join(sdir, d.name, "SKILL.md") : (d.name.endsWith(".md") ? path.join(sdir, d.name) : "");
      if (sk && fs.existsSync(sk)) parts.push(`### skill: ${d.name}\n` + fs.readFileSync(sk, "utf8").slice(0, 4000));
    }
    return parts.join("\n\n").slice(0, maxChars);
  }

  /** Garante a estrutura de pacotes; cria "base" a partir do agente legado se preciso. */
  ensureAgentPacks() {
    fs.mkdirSync(this.packsDir(), { recursive: true });
    if (this.listPacks().length === 0) {
      const base = this.packDir("base");
      fs.mkdirSync(path.join(base, "skills"), { recursive: true });
      const dst = path.join(base, "coorquestrador.agent.md");
      if (fs.existsSync(this.legacyAgentPath())) {
        fs.copyFileSync(this.legacyAgentPath(), dst);
      } else if (!fs.existsSync(dst)) {
        fs.writeFileSync(dst, "---\nname: coorquestrador\n---\n# Coorquestrador\nAnalise a demanda, quebre em tarefas e roteie engine/modelo.\n");
      }
      this.setActivePack("base");
    }
  }

  loadEngines(): EnginesFile { return readYaml<EnginesFile>(this.enginesPath()); }
  loadCost(): CostTable { return readYaml<CostTable>(this.costPath()); }
  loadGates(): any { return readYaml<any>(this.gatesPath()); }

  /** Lista projetos: subpastas diretas da raiz (exceto o configDir). */
  listProjects(): string[] {
    return fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== this.configDir && !d.name.startsWith("."))
      .map((d) => d.name);
  }

  ensureStateFile() {
    const sp = this.statePath();
    fs.mkdirSync(path.dirname(sp), { recursive: true });
    if (!fs.existsSync(sp)) {
      fs.writeFileSync(sp, JSON.stringify({ version: 1, demands: [] }, null, 2));
    }
  }
}
