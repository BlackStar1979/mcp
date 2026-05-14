# Core Package Role Index

Data: 2026-05-14  
Status: current_reference

Cel: jednoznacznie opisać rolę plików `core/`, żeby uniknąć mylenia:

- `package facade`,
- `true module`,
- `legacy adapter/container`.

## 1. Package facades (entrypointy rodzin narzędzi)

Te pliki mają być cienkie i tylko składać podmoduły:

- `core/tools_fs.js` -> `core/filesystem/*`
- `core/web_tools.js` -> `core/web/*`
- `core/truth_tools.js` -> `core/truth/*`
- `core/remote_site_tools.js` -> `core/remote_site/*`
- `core/code_tools_safe.js` -> `core/code/*`

Reguła:

- brak ciężkiej logiki domenowej w fasadzie,
- brak duplikowania helperów już przeniesionych do podpakietu.

## 2. True modules (single responsibility)

Przykładowe stabilne moduły:

- `core/audit.js`
- `core/perf.js`
- `core/paths.js`
- `core/server_tools_bootstrap.js`
- `core/auth.js`
- `core/auth_bearer.js`
- `core/responses.js`

Reguła:

- jedna odpowiedzialność, jasny kontrakt eksportów.

## 3. Legacy / compatibility zone

- `core/code_tools.js` pozostaje legacy i nie jest bazą do nowych zmian.
- `core/auth_gpt.js` jest compatibility/tymczasowy i nie jest docelowym modelem auth.

Reguła:

- nowy development idzie przez aktywne facady/podpakiety, nie przez legacy.

## 4. Naming normalization policy

Dla nowych rodzin:

- `core/<domain>/shared_runtime.js` dla wspólnych helperów i schematów runtime,
- `core/<domain>/*_tools.js` dla rejestracji tooli danej poddomeny,
- `core/<domain>_tools.js` tylko jako cienka fasada, jeśli domena ma podpakiet.

Przykład:

- `core/web_tools.js` (facade)
- `core/web/runtime.js` (shared runtime)
- `core/web/http_tools.js`, `package_tools.js`, `github_tools.js` (rejestratory)

