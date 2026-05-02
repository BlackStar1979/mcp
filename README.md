# MCP

Lokalny projekt MCP oparty o Node.js, Express i `@modelcontextprotocol/sdk`.

Repozytorium zawiera dwa serwery MCP:

- `server.js` — podstawowy read-only MCP dla plików w `C:\Work\mcp`.
- `server_tools.js` — modularny MCP z narzędziami FS, policy engine i lokalnym dostępem do plików.

## Status

Projekt jest przygotowywany do publikacji w repozytorium GitHub:

```text
https://github.com/BlackStar1979/mcp
```

## Wymagania

- Node.js 18 lub nowszy
- npm
- Windows, z katalogiem roboczym `C:\Work\mcp`

## Instalacja

```bash
npm install
```

## Uruchomienie

### Modularny MCP

```bash
npm start
```

Domyślny punkt wejścia:

```text
server_tools.js
```

### Read-only MCP

```bash
node server.js
```

Read-only MCP działa lokalnie i ogranicza zakres do:

```text
C:\Work\mcp
```

## Testy

```bash
npm test
```

Testy sprawdzają między innymi:

- konfigurację ścieżek runtime,
- blokady zapisu w katalogach chronionych,
- przekierowanie importów do modułów w `core`,
- politykę ryzyka dla operacji na kodzie.

## Struktura

```text
.
├── core/                 # moduły wewnętrzne modularnego MCP
├── docs/                 # dokumentacja projektowa i decyzje architektoniczne
├── science_py/           # pomocnicze moduły Python
├── tests/                # testy node:test
├── validation/           # skrypty walidacyjne
├── server.js             # read-only MCP
├── server_tools.js       # modularny MCP tools
├── package.json
└── package-lock.json
```

## Dokumentacja

Dokumentacja projektowa jest w katalogu:

```text
docs/
```

Kluczowy dokument decyzyjny:

```text
docs/ARCHITECTURE_DECISIONS.md
```

Status narzędzi:

```text
docs/status/mcp_tools_status.md
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
- logów, cache i środowisk wirtualnych.

Reguły wykluczeń są zapisane w `.gitignore`.

## Audit i performance logging

Audyt i performance logging są obecnie traktowane jako nieaktywne funkcje docelowe. Historyczne artefakty `.mcp_audit`, `.mcp_audit.log`, `.mcp_perf.log` i `.mcp_perf_on` nie są częścią publikowanego repozytorium.

Przywrócenie tych mechanizmów wymaga osobnej implementacji z testami i spójną dokumentacją.

## Bezpieczeństwo

Serwer wykonuje operacje na lokalnym systemie plików, dlatego powinien być uruchamiany wyłącznie w zaufanym środowisku. Nie wystawiaj go publicznie bez dodatkowej kontroli dostępu, ograniczeń sieciowych i świadomej konfiguracji tokenów.

## Publikacja na GitHub

Przykładowa sekwencja pierwszej publikacji:

```bash
git init
git branch -M main
git remote add origin https://github.com/BlackStar1979/mcp.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

Jeżeli repozytorium lokalne jest już zainicjalizowane, wystarczy sprawdzić:

```bash
git status
git remote -v
```

## Licencja

Licencja nie została jeszcze wybrana. Do czasu dodania pliku `LICENSE` projekt należy traktować jako kod bez udzielonej publicznej licencji.
