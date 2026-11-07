<!-- bmad:context -->
<!-- Verified 2026-11-07 against 54e090a. Managed by bmad-project-context; edits inside this block are replaced on refresh. -->

## Coorquestrador

Extensão VS Code em TypeScript para planejar, rotear e executar tarefas por CLIs de IA. O escopo operacional deste contexto é `vscode-extension/`; `sample-root/` é apenas ambiente de exemplo. Planejamento e decisões históricas ficam em `README.md` e `docs/HANDOFF.md`; a implementação fica em `vscode-extension/src/`.

## Policy

- Trabalhe de forma direta e automatizada quando a tarefa estiver dentro do escopo, preservando histórico, versionamento e rastreabilidade.
- Use GitHub Actions como autoridade de CI e distribuição; não declare uma versão publicada apenas por validação local.
- Preserve a separação entre o motor determinístico TypeScript e o raciocínio configurável dos agentes.
- Quando uma versão estiver pronta, mantenha a sequência de release automatizada por `npm run release:check` e pelo workflow de publicação baseado em tags `v*` ou disparo manual.

## Where things are

- Núcleo determinístico: `vscode-extension/src/core/`
- Interface e integração VS Code: `vscode-extension/src/ui/` e `vscode-extension/src/extension.ts`
- Testes: `vscode-extension/test/core.test.js`
- Scripts de verificação e release: `vscode-extension/scripts/`
- CI: `.github/workflows/ci.yml`
- Distribuição para VS Code Marketplace, Open VSX e GitHub Releases: `.github/workflows/publish.yml`
- Contexto arquitetural e operacional: `README.md` e `docs/HANDOFF.md`

## Running and verifying

- Execute comandos da extensão a partir de `vscode-extension/`; a raiz não possui scripts equivalentes.
- Use Node.js 20 localmente para manter paridade com o GitHub Actions.
- Use `npm ci` para instalar dependências reproduzíveis.
- Use `npm run release:check` antes de considerar uma versão pronta; ele valida versão, compila, testa, gera o bundle, empacota o VSIX e verifica sua integridade.
- O CI roda `npm run release:check` em pull requests e pushes para `main`.

## Conventions that differ from defaults

- Minor ímpar representa pre-release; minor par representa release final. Correções incrementam apenas o patch dentro da trilha vigente.
- O Gate 1 de aprovação de plano e cota permanece obrigatório antes da execução de tarefas.
- Entradas destinadas a CLIs devem usar os mecanismos de quoting e redaction já implementados em `commandBuilder.ts` e `commandSecurity.ts`.

## Known pitfalls

- Não use `JSON.stringify` para quoting de prompts em argumentos shell; use o quoting seguro existente.
- Feche `stdin` quando o modo de entrada não for `stdin`, pois algumas CLIs aguardam EOF indefinidamente.
- Mantenha `package.json` e `package-lock.json` sincronizados; valide a versão antes de um release.
<!-- /bmad:context -->
