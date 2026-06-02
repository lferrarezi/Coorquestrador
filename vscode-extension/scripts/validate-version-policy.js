#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const pkg = require(path.join(__dirname, "..", "package.json"));
const version = String(pkg.version || "");
const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);

function fail(message) {
  console.error(`Version policy error: ${message}`);
  process.exit(1);
}

if (!match) fail(`invalid SemVer version: ${version}`);

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);
if (![major, minor, patch].every(Number.isInteger)) fail(`invalid numeric version: ${version}`);

const releaseKind = minor % 2 === 1 ? "pre-release" : "release";
console.log(`Version policy OK: ${version} => ${releaseKind} lane`);
