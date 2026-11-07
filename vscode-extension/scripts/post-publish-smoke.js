#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const extensionRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const extensionId = `${packageJson.publisher}.${packageJson.name}`;
const openVsxPath = `${packageJson.publisher}/${packageJson.name}`;
const repository = String(packageJson.repository?.url || "").replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    out[key] = argv[i + 1]?.startsWith("--") || argv[i + 1] == null ? true : argv[++i];
  }
  return out;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readVsixEntry(vsix, entry) {
  return run("unzip", ["-p", vsix, entry]);
}

function verifyVsix(vsix, version) {
  assert(fs.existsSync(vsix), `VSIX ausente: ${vsix}`);
  const manifest = readVsixEntry(vsix, "extension.vsixmanifest");
  const packageText = readVsixEntry(vsix, "extension/package.json");
  const manifestVersion = manifest.match(/<Identity\b[^>]*\bVersion="([^"]+)"/)?.[1];
  const packaged = JSON.parse(packageText);
  assert(manifestVersion === version, `VSIX manifest version ${manifestVersion} != ${version}`);
  assert(packaged.version === version, `VSIX package version ${packaged.version} != ${version}`);
  assert(packaged.main === "./dist/extension.js", "VSIX sem entrypoint esperado");
  console.log(`VSIX OK: ${path.basename(vsix)} (${version})`);
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 10000);
  const { timeoutMs: _ignoredTimeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { "user-agent": "coorquestrador-post-publish-smoke", accept: "application/json", ...(options.headers || {}) };
  try {
    const response = await fetch(url, { ...fetchOptions, headers, signal: controller.signal });
    const body = await response.text();
    let json;
    try { json = JSON.parse(body); } catch { json = null; }
    return { response, json, body };
  } catch (error) {
    return { response: { ok: false, status: 0 }, json: null, body: "", error };
  } finally {
    clearTimeout(timer);
  }
}

async function registryStatus(version) {
  const openVsx = await fetchJson(`https://open-vsx.org/api/${openVsxPath}`);
  const openVsxVersion = openVsx.json?.version;
  const openVsxOk = openVsx.response.ok && openVsxVersion === version && openVsx.json?.preRelease === false;

  const marketplace = await fetchJson("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json;api-version=3.0-preview.1" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: extensionId }] }], flags: 914 }),
  });
  const marketplaceExtension = marketplace.json?.results?.[0]?.extensions?.[0];
  const marketplaceVersionEntry = marketplaceExtension?.versions?.[0];
  const marketplaceVersion = marketplaceVersionEntry?.version;
  const marketplaceFlags = `${marketplaceExtension?.flags || ""} ${marketplaceVersionEntry?.flags || ""}`.toLowerCase();
  const marketplaceProductive = marketplaceFlags.includes("validated") && !/(pre|preview|prerelease)/.test(marketplaceFlags);
  const marketplaceOk = marketplace.response.ok && marketplaceVersion === version && marketplaceProductive;

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const github = await fetchJson(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const assetName = `coorquestrador-${version}.vsix`;
  const githubOk = github.response.ok
    && github.json?.prerelease === false
    && github.json?.tag_name === `v${version}`
    && github.json?.assets?.some((asset) => asset.name === assetName);

  return {
    ok: openVsxOk && marketplaceOk && githubOk,
    details: {
      openVsx: `${openVsx.response.status} ${openVsxVersion || "missing"}${openVsx.json?.preRelease === false ? " productive" : ""}`,
      marketplace: `${marketplace.response.status} ${marketplaceVersion || "missing"}${marketplaceProductive ? " productive" : ""}`,
      github: `${github.response.status} ${github.json?.tag_name || "missing"}${github.json?.prerelease === false ? " productive" : ""}`,
    },
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyRegistries(version, attempts, intervalSeconds) {
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("attempts deve ser um inteiro positivo");
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) throw new Error("interval-seconds deve ser um numero nao negativo");
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await registryStatus(version);
    console.log(`Registries tentativa ${attempt}/${attempts}: ${JSON.stringify(last.details)}`);
    if (last.ok) return;
    if (attempt < attempts) await wait(intervalSeconds * 1000);
  }
  throw new Error(`Registries nao convergiram para ${version}: ${JSON.stringify(last.details)}`);
}

function editorSmoke(editor, vsix, version, runtimeTest) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-editor-smoke-"));
  const extensionsDir = path.join(tempRoot, "extensions");
  const userDataDir = path.join(tempRoot, "user-data");
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  run(editor, ["--install-extension", vsix, "--force", "--extensions-dir", extensionsDir, "--user-data-dir", userDataDir], { stdio: "inherit", timeout: 180000 });
  const listed = run(editor, ["--list-extensions", "--show-versions", "--extensions-dir", extensionsDir, "--user-data-dir", userDataDir], { timeout: 30000 });
  assert(listed.split(/\r?\n/).some((line) => line.trim() === `${extensionId}@${version}`), `${editor} nao listou ${extensionId}@${version}`);

  const installed = fs.readdirSync(extensionsDir).find((name) => name.startsWith(`${extensionId}-${version}`));
  assert(installed, `${editor} nao criou a pasta instalada da extensao`);
  const installedPath = path.join(extensionsDir, installed);
  run(editor, [
    `--extensionDevelopmentPath=${installedPath}`,
    `--extensionTestsPath=${path.resolve(runtimeTest)}`,
    workspace,
    "--disable-gpu",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--extensions-dir", extensionsDir,
    "--user-data-dir", userDataDir,
  ], { stdio: "inherit", timeout: 180000 });
  console.log(`Runtime OK: ${editor} ativou ${extensionId}@${version}`);
}

async function main() {
  const options = argsFrom(process.argv.slice(2));
  const version = String(options.version || packageJson.version);
  const vsix = path.resolve(String(options.vsix || path.join(extensionRoot, `coorquestrador-${version}.vsix`)));
  verifyVsix(vsix, version);
  if (options.editor) editorSmoke(String(options.editor), vsix, version, String(options["runtime-test"] || path.join(extensionRoot, "smoke", "runtime-test.js")));
  if (options["check-registries"]) {
    const attempts = options.attempts == null ? 1 : options.attempts === true ? Number.NaN : Number(options.attempts);
    const intervalSeconds = options["interval-seconds"] == null ? 15 : options["interval-seconds"] === true ? Number.NaN : Number(options["interval-seconds"]);
    await verifyRegistries(version, attempts, intervalSeconds);
  }
}

main().catch((error) => {
  console.error(`Post-publish smoke falhou: ${error.message}`);
  process.exitCode = 1;
});
