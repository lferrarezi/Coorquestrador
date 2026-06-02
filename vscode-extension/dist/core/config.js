"use strict";
// src/core/config.ts
// Carrega as configuracoes (engines, custos, gates) da pasta .coorq do projeto.
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
exports.CoorqConfig = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const YAML = __importStar(require("yaml"));
function readYaml(file) {
    const raw = fs.readFileSync(file, "utf8");
    return YAML.parse(raw);
}
const DEFAULT_ENGINES_YAML = `version: 1

defaults:
  min_credit_threshold: 5
  probe_timeout_seconds: 15
  exec_timeout_seconds: 1800
  max_parallel: 3

engines:
  claude-code:
    enabled: true
    location: local
    host: localhost
    bin: claude
    input_mode: stdin
    probe:
      command: "claude --version"
      expect_exit_code: 0
    credit_probe:
      command: ""
      parse: json
      json_path: "$.credits_remaining"
    exec_template: "claude -p --model {model} --permission-mode acceptEdits"
    models: [opus, sonnet, haiku]
    default_model: sonnet
    powers: [low, normal, medium, high]
    model_powers:
      haiku: [low, normal]
      sonnet: [low, normal, medium, high]
      opus: [normal, medium, high]
    unit: token
    best_for: [agentic-coding, refactor, multi-file, repo-wide, spec-driven]

  codex:
    enabled: true
    location: local
    host: localhost
    bin: codex
    input_mode: arg
    probe:
      command: "codex --version"
      expect_exit_code: 0
    credit_probe:
      command: "f=$(ls -t ~/.codex/sessions/*/*/*/*.jsonl 2>/dev/null | head -1); grep -oE '\\"primary\\":\\\\{\\"used_percent\\":[0-9.]+' \\"$f\\" | tail -1 | grep -oE '[0-9.]+$' | awk '{printf \\"%.0f\\", 100-$1}'"
      parse: text
    exec_template: "codex exec -m {model} --skip-git-repo-check {prompt}"
    models_probe:
      command: "grep -hoE 'gpt-[0-9][a-zA-Z0-9.-]*' ~/.codex/.codex-global-state.json ~/.codex/sessions/*/*/*/*.jsonl 2>/dev/null | sort -u"
      parse: lines
    models: [gpt-5.5, gpt-5.4]
    default_model: gpt-5.5
    powers: [low, normal, medium, high]
    unit: token
    best_for: [agentic-coding, autonomous-tasks, test-generation]

  devin-cli:
    enabled: true
    location: local
    host: localhost
    bin: devin
    input_mode: arg
    probe:
      command: "devin --version"
      expect_exit_code: 0
    credit_probe:
      command: ""
      parse: json
      json_path: "$.acu_remaining"
    exec_template: "devin --model {model} --permission-mode auto -p {prompt}"
    models_probe:
      command: "devin --model x --permission-mode auto -p ping 2>&1 | grep -oE '(claude|gemini|gpt|deepseek|glm|kimi|swe)-[a-z0-9.-]+' | sort -u"
      parse: lines
    models: [claude-haiku-4.5, swe-1.6-fast, swe-1.5, gemini-3-flash]
    default_model: claude-haiku-4.5
    powers: [normal, high]
    unit: acu
    best_for: [long-autonomous, end-to-end-features, background-tasks]

  gemini-cli:
    enabled: true
    location: local
    host: localhost
    bin: gemini
    input_mode: arg
    probe:
      command: "gemini --version"
      expect_exit_code: 0
    credit_probe:
      command: ""
      parse: json
      json_path: "$.quota.remaining"
    exec_template: "gemini -m {model} --approval-mode yolo -p {prompt}"
    models_probe:
      command: "grep -rhoE 'gemini-[0-9.]+-(pro|flash-lite|flash)' ~/.gemini 2>/dev/null | sort -u"
      parse: lines
    models: [gemini-2.5-pro, gemini-2.5-flash]
    default_model: gemini-2.5-pro
    powers: [low, normal, medium, high]
    unit: token
    best_for: [large-context, analysis, docs, fast-cheap-tasks]

  github-copilot-cli:
    enabled: true
    location: local
    host: localhost
    bin: copilot
    input_mode: arg
    probe:
      command: "copilot --version"
      expect_exit_code: 0
    credit_probe:
      command: "gh api /copilot_internal/user -q .quota_snapshots.chat.percent_remaining 2>/dev/null"
      parse: text
    exec_template: "copilot -p {prompt} --model {model} --allow-all-tools --no-color"
    models_probe:
      command: "strings ~/.copilot/session-store.db 2>/dev/null | grep -oE '(claude|gpt|gemini)-[a-zA-Z0-9.-]+' | sort -u"
      parse: lines
    models: [claude-haiku-4.5, gpt-5.2, claude-sonnet-4.5]
    default_model: claude-haiku-4.5
    powers: [normal]
    unit: token
    best_for: [inline-edits, small-fixes, command-suggestions]
`;
const DEFAULT_COST_YAML = `currency: USD
power_multiplier:
  low: 0.5
  normal: 1
  medium: 1.8
  high: 3
task_size_tokens:
  trivial: 2000
  small: 10000
  medium: 50000
  large: 200000
  xlarge: 500000
task_size_acu:
  trivial: 0.1
  small: 0.5
  medium: 1.5
  large: 4
  xlarge: 10
quota_gate2_threshold:
  token: 1000000
  acu: 5
cost_gate2_threshold: 0
models: {}
`;
const DEFAULT_GATES_YAML = `gate1:
  require_human_approval: true
gate2:
  require_human_approval_on:
    - failed_task
    - missing_artifact
    - quota_exceeded
`;
const DEFAULT_AGENT = `---
name: coorquestrador
description: Meta-orquestrador de runtime para o projeto aberto no VS Code.
entrypoint: true
---

# Coorquestrador

Analise a demanda, quebre em tarefas atomicas, escolha assistente/modelo/esforco disponivel e execute respeitando gates HITL.
`;
const DEFAULT_PACK_JSON = `{
  "name": "base",
  "version": "1.0.0",
  "description": "Nucleo base do Coorquestrador para o projeto aberto no VS Code.",
  "skills": ["demand-planning", "engine-routing", "cost-estimation"],
  "agents": ["coorquestrador"]
}
`;
const DEFAULT_SKILLS = {
    "demand-planning": "# Skill: Demand Planning\n\nTransforme a demanda livre em tarefas atomicas com dependencias, tamanho e criterio de aceite verificavel.\n",
    "engine-routing": "# Skill: Engine Routing\n\nEscolha assistente, modelo e esforco usando somente CLIs detectados, modelos disponiveis e capacidade do snapshot mais recente.\n",
    "cost-estimation": "# Skill: Cost Estimation\n\nEstime consumo de cota por tarefa usando tamanho, unidade do modelo e multiplicador de esforco.\n",
};
function writeIfMissing(file, content) {
    if (fs.existsSync(file))
        return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
}
class CoorqConfig {
    constructor(root, configDir) {
        this.root = root;
        this.configDir = configDir;
    }
    p(name) {
        return path.join(this.root, this.configDir, name);
    }
    enginesPath() { return this.p("engines.yaml"); }
    costPath() { return this.p("cost-table.yaml"); }
    gatesPath() { return this.p("coorq-hitl-gates.yaml"); }
    statePath() { return this.p("state/demands.json"); }
    logsDir(demandId) { return demandId ? this.p(path.join("logs", demandId)) : this.p("logs"); }
    // ---------- Pacotes de Agentes (nucleo trocavel) ----------
    packsDir() { return this.p("agent-packs"); }
    activePackFile() { return this.p("active-pack"); }
    legacyAgentPath() { return this.p("agent/coorquestrador.agent.md"); }
    /** Lista os pacotes de agentes instalados (subpastas de agent-packs). */
    listPacks() {
        const dir = this.packsDir();
        if (!fs.existsSync(dir))
            return [];
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith("."))
            .map((d) => d.name).sort();
    }
    /** Nome do pacote ativo (default: "base" ou o primeiro existente). */
    activePack() {
        const f = this.activePackFile();
        if (fs.existsSync(f)) {
            const name = fs.readFileSync(f, "utf8").trim();
            if (name && fs.existsSync(path.join(this.packsDir(), name)))
                return name;
        }
        const packs = this.listPacks();
        return packs.includes("base") ? "base" : (packs[0] || "base");
    }
    setActivePack(name) {
        fs.mkdirSync(path.dirname(this.activePackFile()), { recursive: true });
        fs.writeFileSync(this.activePackFile(), name, "utf8");
    }
    packDir(name) { return path.join(this.packsDir(), name || this.activePack()); }
    /** Caminho do agente do pacote ativo; cai no legado se nao houver pacote. */
    agentPath() {
        const inPack = path.join(this.packDir(), "coorquestrador.agent.md");
        if (fs.existsSync(inPack))
            return inPack;
        return this.legacyAgentPath();
    }
    /** Concatena as SKILL.md do pacote ativo (para injetar no prompt do planner). */
    loadSkills(maxChars = 12000) {
        const sdir = path.join(this.packDir(), "skills");
        if (!fs.existsSync(sdir))
            return "";
        const parts = [];
        for (const d of fs.readdirSync(sdir, { withFileTypes: true })) {
            const sk = d.isDirectory() ? path.join(sdir, d.name, "SKILL.md") : (d.name.endsWith(".md") ? path.join(sdir, d.name) : "");
            if (sk && fs.existsSync(sk))
                parts.push(`### skill: ${d.name}\n` + fs.readFileSync(sk, "utf8").slice(0, 4000));
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
            }
            else if (!fs.existsSync(dst)) {
                fs.writeFileSync(dst, "---\nname: coorquestrador\n---\n# Coorquestrador\nAnalise a demanda, quebre em tarefas e roteie engine/modelo.\n");
            }
            this.setActivePack("base");
        }
    }
    /** Garante a configuracao padrao do Coorquestrador no projeto aberto. */
    ensureProjectDefaults() {
        fs.mkdirSync(path.join(this.root, this.configDir), { recursive: true });
        writeIfMissing(this.enginesPath(), DEFAULT_ENGINES_YAML);
        writeIfMissing(this.costPath(), DEFAULT_COST_YAML);
        writeIfMissing(this.gatesPath(), DEFAULT_GATES_YAML);
        writeIfMissing(this.statePath(), JSON.stringify({ version: 1, demands: [] }, null, 2));
        const base = this.packDir("base");
        writeIfMissing(path.join(base, "coorquestrador.agent.md"), DEFAULT_AGENT);
        writeIfMissing(path.join(base, "pack.json"), DEFAULT_PACK_JSON);
        for (const [name, body] of Object.entries(DEFAULT_SKILLS)) {
            writeIfMissing(path.join(base, "skills", name, "SKILL.md"), body);
        }
        if (!fs.existsSync(this.activePackFile()))
            this.setActivePack("base");
    }
    loadEngines() { return readYaml(this.enginesPath()); }
    loadCost() { return readYaml(this.costPath()); }
    loadGates() { return readYaml(this.gatesPath()); }
    /** Lista projetos: subpastas diretas da raiz (exceto o configDir). */
    listProjects() {
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
exports.CoorqConfig = CoorqConfig;
//# sourceMappingURL=config.js.map