const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

module.exports.run = async function run() {
  const extension = vscode.extensions.getExtension("lferrarezi.coorquestrador");
  assert(extension, "extensao Coorquestrador nao encontrada no host");
  await extension.activate();
  assert(extension.isActive, "extensao Coorquestrador nao foi ativada");

  const commands = await vscode.commands.getCommands(true);
  assert(commands.includes("coorq.newDemand"), "comando coorq.newDemand nao registrado");
  assert(commands.includes("coorq.executeApproved"), "comando coorq.executeApproved nao registrado");

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert(workspace, "workspace de smoke ausente");
  assert(fs.existsSync(path.join(workspace, ".coorq", "engines.yaml")), ".coorq nao inicializado no runtime");
};
