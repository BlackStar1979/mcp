# MCP

Lokalny projekt MCP oparty o Node.js, Express i `@modelcontextprotocol/sdk`.

Repozytorium zawiera dwa serwery MCP:

- `server.js` — podstawowy read-only MCP dla skonfigurowanych workspace rootów. Bare paths i `.` wskazują primary root `C:\Work`, a dodatkowe rooty są adresowane jawnie jako `@alias/...`.
- `server_tools.js` — modularny MCP tools profile z narzędziami FS, index, science, connector-safe code tools i connector-safe registry control-plane.
- `stc_safe.js` — osobny connector-safe MCP profile z wyłącznie `search` i `fetch`, bez mutation-capable tools.

## Status

Projekt jest lokalnym runtime MCP z kontrolowanym deploy/rollback. Dokumentacja canonical znajduje się w `docs/`.

Repozytorium GitHub:

```text
https://github.com/BlackStar1979/mcp
```

## Wymagania

### Node.js

- Node.js 18 lub nowszy
- npm
- Windows, z katalogiem roboczym `C:\Work\mcp`, primary workspace root `C:\Work` i runtime/control-plane w `C:\Work\mcp`
- w środowiskach nie-Windows (np. CI na Ubuntu) domyślne rooty są wyprowadzane z checkoutu repo, chyba że jawnie ustawisz `MCP_WORK_ROOT` i `MCP_RUNTIME_DIR`

### Python dla narzędzi science

Część narzędzi z `core/science_tools.js` uruchamia helpery Python przez komendę `python`.

Wymagane pakiety Python:

- `astropy` — dla `fits_info`
- `h5py` — dla `hdf5_info`

`table_profile` używa wyłącznie standard library Pythona.

Szczegóły operacyjne:

```text
docs/PYTHON_RUNTIME_REQUIREMENTS.md
```

## Instalacja Node.js

```bash
npm install
```

## Uruchomienie

### Modularny MCP tools profile

```bash
npm start
```

Domyślny punkt wejścia:

```text
server_tools.js
```

Alternatywnie bezpośrednio:

```bash
node C:\Work\mcp\server_tools.js
```

Tryby auth:

```bash
node C:\Work\mcp\server_tools.js --auth access
node C:\Work\mcp\server_tools.js --auth bearer --token-file C:\Work\mcp\.secrets\mcp_token.txt
node C:\Work\mcp\server_tools.js --auth oauth2
```

Module gating przy starcie (`server_tools.js`):

```bash
node C:\Work\mcp\server_tools.js --auth access --modules index,filesystem,science,code_safe,registry_safe,web,truth,process,remote_site
node C:\Work\mcp\server_tools.js --auth access --disable-modules process,remote_site
```

Ważne:

- to jest lista CSV (wartości oddzielone przecinkami), nie plik `.csv`
- separator to przecinek `,` (nie średnik `;`)
- identyfikatory modułów:
  - `index`
  - `filesystem`
  - `science`
  - `code_safe`
  - `registry_safe`
  - `web`
  - `truth`
  - `process`
  - `remote_site`
- precedence:
  - CLI (`--modules`, `--disable-modules`) ma priorytet
  - ENV (`MCP_ENABLED_MODULES`, `MCP_DISABLED_MODULES`) działa jako domyślna konfiguracja
- po starcie serwer wypisuje posture modułów:
  - `enabled_ids`
  - `disabled_ids`
  - `enabled_labels`

Uwaga:

- `--auth oauth2` jest jeszcze zarezerwowany i niezaimplementowany
- bearer mode akceptuje `Authorization: Bearer ...` i zachowuje legacy `?token=...` fallback dla kompatybilności klienta
- nie ma jeszcze skrótowych przełączników typu `ALL/NONE/TRUE/FACADE/LEGACY/MIXRESP/SPLIT`
- odpowiednik `ALL` to brak `--modules` i brak `--disable-modules` (domyślnie wszystko włączone)
- odpowiednik `NONE` celowo nie istnieje: bootstrap kończy się błędem, jeśli po gatingu nie zostaje żaden moduł

### Connector-safe MCP profile

```bash
npm run start:safe
```

Alternatywnie:

```bash
node C:\Work\mcp\stc_safe.js
```

Self-test:

```bash
node C:\Work\mcp\stc_safe.js --self-test
```

Profil `stc_safe.js`:

- domyślny port `3010`
- strict connector shape `2025-05-strict-v1`
- tylko `search` i `fetch`
- bez mutation-capable imports
- bez `StreamableHTTPServerTransport`
- `outputSchema` + `structuredContent` + JSON mirror w `content[0].text`
- `fetch` capped domyślnie do `2500` znaków z metadanymi:
  - `connectorShapeVersion`
  - `truncated`
  - `original_chars`
  - `cap_chars`
- audit connector-safe nie loguje surowych `query` / `id`; używa hash-only summary i flag markerów
- publiczny host sprawdzony praktycznie:
  - `https://mcp-stc-safe.romionologic.dev/mcp`
- profil jest zgodny z kierunkiem przykładów stateless HTTP z oficjalnych SDK MCP; nie jest to jednorazowy hack tylko celowy, minimalny runtime
- referencyjnym canary dla tego profilu pozostaje:
  - `C:\Work\mcp-tests\server.js`

Ważna uwaga:

- dla publicznego MCP używanego przez ChatGPT Desktop preferuj hostname z myślnikami
- hostname z underscore może działać po HTTP, a mimo to nie przejść procesu tworzenia łącznika w Desktop app
- część wrażliwie wyglądających argumentów może zostać zatrzymana przez ChatGPT Desktop approval/preflight zanim trafi do serwera; to nie jest problem, który da się naprawić wyłącznie w samym MCP runtime

### Read-only MCP

```bash
node server.js
```

## Workspace roots

Domyślny model:

```text
primary root: C:\Work
runtime/control-plane: C:\Work\mcp
```

Dodatkowe rooty można dodać bez kolejnego redesignu przez zmienną środowiskową.
W środowiskach nie-Windows domyślne rooty bazują na checkoutcie repo, ale model aliasów i `MCP_EXTRA_ROOTS` pozostaje taki sam.

Przez zmienną środowiskową:

```text
MCP_EXTRA_ROOTS=portfolio=C:\Portfolio;thesis=C:\Users\mczyz\Documents\Praca licencjacka
```

Adresowanie:

```text
.                    -> C:\Work
romionsim/docs       -> C:\Work\romionsim\docs
@portfolio           -> C:\Portfolio
@portfolio/assets    -> C:\Portfolio\assets
@thesis/chapters     -> C:\Users\mczyz\Documents\Praca licencjacka\chapters
```

## Testy

```bash
npm test
```

Testy sprawdzają między innymi:

- konfigurację ścieżek runtime,
- multi-root config parsing i alias-based path policy,
- blokady zapisu w katalogach chronionych,
- przekierowanie importów do modułów w `core`,
- brak startup dependency od legacy `core/code_tools.js`,
- minimalny kontrakt descriptorów MCP,
- bazowy result-shape helperów MCP,
- registry safe layer,
- deploy / rollback / perf scripts.

## Deploy / rollback

Zmiany operacyjne powinny przechodzić przez manifest i skrypty:

```powershell
.\deploy.ps1 -Mode Prepare -Manifest <manifest>
.\deploy.ps1 -Mode Execute -Manifest <manifest>
```

Rollback:

```powershell
.\rollback.ps1 -DeploymentId <deployment_id>
```

Nie należy kopiować zmian bezpośrednio do runtime z pominięciem deploy/rollback.

## Struktura

```text
.
├── core/                 # moduły wewnętrzne modularnego MCP i helpery Python
├── docs/                 # dokumentacja canonical/current/reference/history
├── tests/                # testy node:test
├── .mcp_warzone/         # lokalny staging zmian, nie source-of-truth repo
├── .mcp_deploy/          # manifesty i recordy deploy
├── .mcp_deploy_backup/   # backupy deploy
├── server.js             # read-only MCP
├── server_tools.js       # modularny MCP tools profile
├── deploy.ps1
├── rollback.ps1
├── perf.ps1
├── package.json
└── package-lock.json
```

Uwaga: wcześniejszy katalog `science_py/` nie jest aktywną strukturą runtime. Helpery Python znajdują się obecnie w `core/`.

## Dokumentacja

Dokumentacja projektowa jest w katalogu:

```text
docs/
```

Czytanie zacznij od:

```text
docs/README.md
docs/CURRENT_STATE.md
docs/RUNTIME_CONTRACTS_CURRENT.md
docs/ROADMAP_REGISTRY_EXECUTION.md
docs/DOCS_CATALOG.md
```

## Pliki lokalne wyłączone z repozytorium

Repozytorium nie powinno zawierać:

- `node_modules/`,
- `.mcp_audit/`,
- `.mcp_audit.log`,
- `.mcp_backups/`,
- `.mcp_index/`,
- `.mcp_trash/`,
- `.mcp_warzone/`,
- `.mcp_deploy_backup/`,
- logów, cache i środowisk wirtualnych.

Reguły wykluczeń są zapisane w `.gitignore`.

## Audit i performance logging

Audit i performance logging są aktywne w lokalnym runtime operatorskim:

- `core/audit.js`
- `core/perf.js`
- `perf.ps1`
- `.mcp_audit.log`
- `.mcp_perf.log`
- `.mcp_perf_on`

Artefakty `.mcp_audit*` i `.mcp_perf*` są lokalnymi źródłami dowodowymi, ale nie są canonical documentation ani częścią publikowanego repozytorium.

## Bezpieczeństwo

Serwer wykonuje operacje na lokalnym systemie plików, dlatego powinien być uruchamiany wyłącznie w zaufanym środowisku.

`server_tools.js` używa teraz rozdzielonego modelu auth przez CLI:

- `--auth access` — tor Cloudflare Access / Codex na `3001`
- `--auth bearer --token-file ...` — tor bearer na `3002`
- `--auth oauth2` — zarezerwowany tor `3003`, jeszcze niezaimplementowany

W trybie bearer publiczny host nie jest wymagany; lokalny runtime akceptuje `Authorization: Bearer ...` oraz legacy `?token=...` fallback dla klienta, który nie potrafi wysłać bearer headera podczas handshake.

`stc_safe.js` jest profilem connector-safe i nie powinien być mieszany z mutation-capable tool surface `server_tools.js`.

## Licencja

Licencja nie została jeszcze wybrana. Do czasu dodania pliku `LICENSE` projekt należy traktować jako kod bez udzielonej publicznej licencji.

⚠️ Registry uses controlled outputSchema rollout (deploy + runtime validation required).


