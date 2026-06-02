// src/core/agentPacks.ts
// Importacao e validacao de Pacotes de Agentes (nucleo trocavel do Coorquestrador).
// Um pacote contem ao menos coorquestrador.agent.md; pode trazer skills/, agents/, tools/.

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { CoorqConfig } from "./config";

export interface PackManifest {
  name: string;
  version: string;
  description?: string;
  skills?: string[];
  agents?: string[];
  handoffs?: string[];
  generated?: boolean;   // true quando sintetizado (sem pack.json original)
}

export interface ImportResult { name: string; agentFound: boolean; skills: number; path: string; manifest: PackManifest; }

/** Lista nomes de skills de um pacote (subpastas com SKILL.md ou .md soltos). */
function listSkillNames(packDir: string): string[] {
  const sdir = path.join(packDir, "skills");
  if (!fs.existsSync(sdir)) return [];
  const out: string[] = [];
  for (const d of fs.readdirSync(sdir, { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(sdir, d.name, "SKILL.md"))) out.push(d.name);
    else if (d.isFile() && d.name.endsWith(".md")) out.push(d.name.replace(/\.md$/, ""));
  }
  return out.sort();
}

function listDirNames(packDir: string, sub: string): string[] {
  const d = path.join(packDir, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() || e.name.endsWith(".md")).map((e) => e.name.replace(/\.md$/, "")).sort();
}

/** Extrai handoffs declarados no frontmatter do coorquestrador.agent.md. */
function handoffsFromAgent(packDir: string): string[] {
  const a = path.join(packDir, "coorquestrador.agent.md");
  if (!fs.existsSync(a)) return [];
  const fm = fs.readFileSync(a, "utf8").split(/^---$/m)[1] || "";
  const m = fm.match(/handoffs:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (!m) return [];
  return m[1].split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}

/** Le o pack.json de um pacote; se ausente, sintetiza a partir do conteudo. */
export function readManifest(packDir: string, fallbackName = ""): PackManifest {
  const mf = path.join(packDir, "pack.json");
  if (fs.existsSync(mf)) {
    try {
      const m = JSON.parse(fs.readFileSync(mf, "utf8"));
      return {
        name: m.name || fallbackName || path.basename(packDir),
        version: String(m.version || "0.0.0"),
        description: m.description,
        skills: m.skills || listSkillNames(packDir),
        agents: m.agents || listDirNames(packDir, "agents"),
        handoffs: m.handoffs || handoffsFromAgent(packDir),
        generated: false,
      };
    } catch { /* cai para sintese */ }
  }
  return {
    name: fallbackName || path.basename(packDir),
    version: "0.0.0",
    description: undefined,
    skills: listSkillNames(packDir),
    agents: listDirNames(packDir, "agents"),
    handoffs: handoffsFromAgent(packDir),
    generated: true,
  };
}

function writeManifest(packDir: string, m: PackManifest) {
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify({
    name: m.name, version: m.version, description: m.description,
    skills: m.skills, agents: m.agents, handoffs: m.handoffs,
  }, null, 2), "utf8");
}

/** Copia recursiva simples. */
function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Procura recursivamente a pasta que contem coorquestrador.agent.md. */
function findAgentRoot(dir: string, depth = 0): string | null {
  if (depth > 4) return null;
  if (fs.existsSync(path.join(dir, "coorquestrador.agent.md"))) return dir;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".")) {
      const found = findAgentRoot(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  // tambem aceita agent/coorquestrador.agent.md em qualquer nivel
  return null;
}

function countSkills(packDir: string): number {
  const sdir = path.join(packDir, "skills");
  if (!fs.existsSync(sdir)) return 0;
  return fs.readdirSync(sdir, { withFileTypes: true })
    .filter((d) => (d.isDirectory() && fs.existsSync(path.join(sdir, d.name, "SKILL.md"))) || d.name.endsWith(".md")).length;
}

/**
 * Importa um pacote a partir de uma pasta OU de um .zip.
 * Extrai/copia para .coorq/agent-packs/<name>/ e valida o agente.
 */
export function importPack(conf: CoorqConfig, sourcePath: string, name: string): ImportResult {
  conf.ensureAgentPacks();
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = conf.packDir(safeName);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });

  let stageRoot = sourcePath;
  let tmp: string | null = null;
  if (sourcePath.toLowerCase().endsWith(".zip")) {
    tmp = path.join(conf.packsDir(), `.import-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync("unzip", ["-qo", sourcePath, "-d", tmp]);
    stageRoot = tmp;
  }

  // localiza a raiz real do pacote (onde esta o agente)
  const agentRoot = findAgentRoot(stageRoot) || stageRoot;
  copyDir(agentRoot, target);
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });

  const agentFound = fs.existsSync(path.join(target, "coorquestrador.agent.md"));

  // le manifesto existente ou sintetiza; persiste um pack.json normalizado.
  const manifest = readManifest(target, safeName);
  manifest.name = safeName;
  if (manifest.generated) manifest.generated = false;  // a partir de agora tem pack.json
  writeManifest(target, manifest);

  return { name: safeName, agentFound, skills: countSkills(target), path: target, manifest };
}
