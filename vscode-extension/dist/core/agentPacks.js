"use strict";
// src/core/agentPacks.ts
// Importacao e validacao de Pacotes de Agentes (nucleo trocavel do Coorquestrador).
// Um pacote contem ao menos coorquestrador.agent.md; pode trazer skills/, agents/, tools/.
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
exports.readManifest = readManifest;
exports.importPack = importPack;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/** Lista nomes de skills de um pacote (subpastas com SKILL.md ou .md soltos). */
function listSkillNames(packDir) {
    const sdir = path.join(packDir, "skills");
    if (!fs.existsSync(sdir))
        return [];
    const out = [];
    for (const d of fs.readdirSync(sdir, { withFileTypes: true })) {
        if (d.isDirectory() && fs.existsSync(path.join(sdir, d.name, "SKILL.md")))
            out.push(d.name);
        else if (d.isFile() && d.name.endsWith(".md"))
            out.push(d.name.replace(/\.md$/, ""));
    }
    return out.sort();
}
function listDirNames(packDir, sub) {
    const d = path.join(packDir, sub);
    if (!fs.existsSync(d))
        return [];
    return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() || e.name.endsWith(".md")).map((e) => e.name.replace(/\.md$/, "")).sort();
}
/**
 * Lista os agentes especialistas do pacote. Usa a pasta agents/ se existir;
 * caso contrario varre recursivamente os *.agent.md (ex.: suites organizadas
 * em grupos numerados 01-..22-..), excluindo o cerebro coorquestrador.agent.md.
 */
function listAgents(packDir) {
    if (fs.existsSync(path.join(packDir, "agents")))
        return listDirNames(packDir, "agents");
    const out = [];
    const walk = (d, depth) => {
        if (depth > 6)
            return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "__MACOSX")
                continue;
            const fp = path.join(d, e.name);
            if (e.isDirectory())
                walk(fp, depth + 1);
            else if (e.name.endsWith(".agent.md") && e.name !== "coorquestrador.agent.md")
                out.push(e.name.replace(/\.agent\.md$/, ""));
        }
    };
    walk(packDir, 0);
    return [...new Set(out)].sort();
}
/** Extrai handoffs declarados no frontmatter do coorquestrador.agent.md. */
function handoffsFromAgent(packDir) {
    const a = path.join(packDir, "coorquestrador.agent.md");
    if (!fs.existsSync(a))
        return [];
    const fm = fs.readFileSync(a, "utf8").split(/^---$/m)[1] || "";
    const m = fm.match(/handoffs:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (!m)
        return [];
    return m[1].split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}
/** Le o pack.json de um pacote; se ausente, sintetiza a partir do conteudo. */
function readManifest(packDir, fallbackName = "") {
    const mf = path.join(packDir, "pack.json");
    if (fs.existsSync(mf)) {
        try {
            const m = JSON.parse(fs.readFileSync(mf, "utf8"));
            const nz = (a, fb) => (Array.isArray(a) && a.length ? a : fb);
            return {
                name: m.name || fallbackName || path.basename(packDir),
                version: String(m.version || "0.0.0"),
                description: m.description,
                skills: nz(m.skills, listSkillNames(packDir)),
                agents: nz(m.agents, listAgents(packDir)),
                handoffs: nz(m.handoffs, handoffsFromAgent(packDir)),
                generated: false,
            };
        }
        catch { /* cai para sintese */ }
    }
    return {
        name: fallbackName || path.basename(packDir),
        version: "0.0.0",
        description: undefined,
        skills: listSkillNames(packDir),
        agents: listAgents(packDir),
        handoffs: handoffsFromAgent(packDir),
        generated: true,
    };
}
function writeManifest(packDir, m) {
    fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify({
        name: m.name, version: m.version, description: m.description,
        skills: m.skills, agents: m.agents, handoffs: m.handoffs,
    }, null, 2), "utf8");
}
/** Copia recursiva simples. */
function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        if (e.name === ".DS_Store")
            continue;
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory())
            copyDir(s, d);
        else
            fs.copyFileSync(s, d);
    }
}
/** Procura recursivamente a pasta que contem coorquestrador.agent.md. */
function findAgentRoot(dir, depth = 0) {
    if (depth > 4)
        return null;
    if (fs.existsSync(path.join(dir, "coorquestrador.agent.md")))
        return dir;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && !e.name.startsWith(".")) {
            const found = findAgentRoot(path.join(dir, e.name), depth + 1);
            if (found)
                return found;
        }
    }
    // tambem aceita agent/coorquestrador.agent.md em qualquer nivel
    return null;
}
function countSkills(packDir) {
    const sdir = path.join(packDir, "skills");
    if (!fs.existsSync(sdir))
        return 0;
    return fs.readdirSync(sdir, { withFileTypes: true })
        .filter((d) => (d.isDirectory() && fs.existsSync(path.join(sdir, d.name, "SKILL.md"))) || d.name.endsWith(".md")).length;
}
/**
 * Importa um pacote a partir de uma pasta OU de um .zip.
 * Extrai/copia para .coorq/agent-packs/<name>/ e valida o agente.
 */
function importPack(conf, sourcePath, name) {
    conf.ensureAgentPacks();
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const target = conf.packDir(safeName);
    if (fs.existsSync(target))
        fs.rmSync(target, { recursive: true, force: true });
    let stageRoot = sourcePath;
    let tmp = null;
    if (sourcePath.toLowerCase().endsWith(".zip")) {
        tmp = path.join(conf.packsDir(), `.import-${Date.now()}`);
        fs.mkdirSync(tmp, { recursive: true });
        (0, child_process_1.execFileSync)("unzip", ["-qo", sourcePath, "-d", tmp]);
        stageRoot = tmp;
    }
    // localiza a raiz real do pacote (onde esta o agente)
    const agentRoot = findAgentRoot(stageRoot) || stageRoot;
    copyDir(agentRoot, target);
    if (tmp)
        fs.rmSync(tmp, { recursive: true, force: true });
    const agentFound = fs.existsSync(path.join(target, "coorquestrador.agent.md"));
    // le manifesto existente ou sintetiza; persiste um pack.json normalizado.
    const manifest = readManifest(target, safeName);
    manifest.name = safeName;
    if (manifest.generated)
        manifest.generated = false; // a partir de agora tem pack.json
    writeManifest(target, manifest);
    return { name: safeName, agentFound, skills: countSkills(target), path: target, manifest };
}
//# sourceMappingURL=agentPacks.js.map