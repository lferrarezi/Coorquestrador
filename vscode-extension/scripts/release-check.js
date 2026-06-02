#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const vsix = path.join(root, `coorquestrador-${pkg.version}.release-check.vsix`);

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

try {
  if (fs.existsSync(vsix)) fs.unlinkSync(vsix);
  run("node", ["scripts/validate-version-policy.js"]);
  run("npm", ["run", "compile"]);
  run("node", ["test/core.test.js"]);
  run("npm", ["run", "bundle"]);
  run("node", ["-c", path.join(root, "dist", "extension.js")]);
  run("npx", ["vsce", "package", "--out", vsix]);
  run("unzip", ["-t", vsix]);
} finally {
  if (fs.existsSync(vsix)) fs.unlinkSync(vsix);
}
