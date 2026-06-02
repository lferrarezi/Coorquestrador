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