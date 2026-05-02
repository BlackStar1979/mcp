import sys, json
from astropy.io import fits

data = json.load(sys.stdin)
path = data["path"]
max_header = int(data.get("max_header_cards", 80))
max_cols = int(data.get("max_columns", 120))

hdus = []
with fits.open(path, memmap=True) as hdul:
    for i, hdu in enumerate(hdul):
        header_items = list(hdu.header.items())[:max_header]
        header = {k: str(v) for k, v in header_items}

        columns = []
        if hasattr(hdu, "columns") and hdu.columns is not None:
            for col in list(hdu.columns)[:max_cols]:
                columns.append({
                    "name": col.name,
                    "format": col.format,
                    "unit": col.unit
                })

        hdus.append({
            "index": i,
            "type": type(hdu).__name__,
            "shape": getattr(hdu.data, "shape", None),
            "dtype": str(getattr(getattr(hdu.data, "dtype", None), "name", None)),
            "header": header,
            "columns": columns
        })

print(json.dumps({
    "path": path,
    "hdu_count": len(hdus),
    "hdus": hdus
}))