# Dependency install notes — remote site tools

## New dependency

```text
ssh2-sftp-client@^12.0.1
```

## Reason

Remote site tools use SFTP over SSH for bounded remote file operations against the ROMION VPS public site directory.

## Important deploy limitation

`deploy.ps1` copies files and runs validation, but it does not run:

```powershell
npm install
```

Therefore, after the staged `package.json` is deployed, the operator must run dependency installation before restarting MCP.

## Required operator step after deploy execute

```powershell
cd C:\Work\mcp
npm install
```

Expected result:
- `package-lock.json` updated,
- `node_modules` contains `ssh2-sftp-client`,
- `npm test` still passes.

## Validation after install

```powershell
npm test
```

Then restart:

```powershell
node C:\Work\mcp\server_tools.js
```

## Rollback note

If rollback is needed, run MCP rollback first, then restore dependency state if required with:

```powershell
git checkout -- package.json package-lock.json
npm install
```

or use the deployment backup/rollback record if package files were deployed through manifest.
