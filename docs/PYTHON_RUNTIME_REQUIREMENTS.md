# Python Runtime Requirements

Data: 2026-05-03
Status: current_reference
Zakres: rzeczywiste wymagania Python dla `core/science_tools.js` w projekcie `C:\Work\mcp`

## Cel

Ten dokument opisuje wymagania środowiskowe dla narzędzi scientific/data wystawianych przez `server_tools.js` przez moduł:

- `core/science_tools.js`

Nie opisuje całego runtime Node.js. Wymagania Node.js są w `package.json` i root `README.md`.

## Aktywny mechanizm uruchomienia

`core/science_tools.js` uruchamia helpery Python przez:

```js
spawn("python", [scriptPath(script)], ...)
```

Wniosek operacyjny:

- w aktywnym środowisku musi działać komenda `python`,
- helpery muszą być dostępne w katalogu `core/`,
- zależności Python nie są instalowane przez `npm install`.

## Helpery Python

| Tool MCP | Helper | Typ zależności |
|---|---|---|
| `fits_info` | `core/fits_info.py` | Python + `astropy` |
| `hdf5_info` | `core/hdf5_info.py` | Python + `h5py` |
| `table_profile` | `core/table_profile.py` | Python standard library |

## Importy potwierdzone w kodzie

### `core/fits_info.py`

```python
import sys, json
from astropy.io import fits
```

Wymaga:

- `astropy`

### `core/hdf5_info.py`

```python
import sys, json
import h5py
```

Wymaga:

- `h5py`

### `core/table_profile.py`

```python
import sys, json, csv
```

Wymaga:

- brak pakietów zewnętrznych; używa standard library.

## Minimalna checklista środowiskowa

W PowerShell:

```powershell
python --version
python -c "import astropy; print(astropy.__version__)"
python -c "import h5py; print(h5py.__version__)"
```

Wynik poprawny:

- `python --version` zwraca wersję Pythona,
- import `astropy` przechodzi bez błędu,
- import `h5py` przechodzi bez błędu.

## Instalacja zależności Python

Jeśli pakietów brakuje, minimalna instalacja w używanym środowisku Python:

```powershell
python -m pip install astropy h5py
```

Ten projekt nie wymusza konkretnego virtualenv. Jeżeli środowisko ma być odtwarzalne na innym komputerze, należy dodać osobny plik requirements/lock w kolejnym kroku.

## Granice odpowiedzialności

Ten dokument potwierdza tylko obecny stan:

- helpery Python żyją w `core/`,
- aktywny runtime uruchamia je przez komendę `python`,
- zewnętrzne pakiety Python to `astropy` i `h5py`.

Nie potwierdza:

- że każda maszyna ma już zainstalowane te pakiety,
- że Python jest zarządzany przez virtualenv,
- że wersje pakietów są zablokowane.

## Status luki F2

Luka „wymagania Python nie są jawnie opisane” jest zamknięta na poziomie dokumentacji operacyjnej.

Otwarte pozostaje ewentualne przyszłe utwardzenie:

- `requirements.txt` albo inny manifest zależności,
- jawna procedura tworzenia virtualenv,
- test środowiskowy sprawdzający import `astropy` i `h5py`.
