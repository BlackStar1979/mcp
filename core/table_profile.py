import sys, json, csv

data = json.load(sys.stdin)
path = data["path"]
max_lines = int(data.get("max_lines", 10000))
sample_rows = int(data.get("sample_rows", 20))

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = []
    for i, line in enumerate(f):
        if i >= max_lines:
            break
        lines.append(line.rstrip("\n"))

if not lines:
    print(json.dumps({"path": path, "lines": 0}))
    sys.exit(0)

sniffer = csv.Sniffer()
delimiter = ","
try:
    delimiter = sniffer.sniff("\n".join(lines[:50])).delimiter
except Exception:
    pass

reader = csv.reader(lines, delimiter=delimiter)
rows = list(reader)
columns = rows[0] if rows else []

samples = rows[1:1+sample_rows]

print(json.dumps({
    "path": path,
    "lines_read": len(lines),
    "delimiter": delimiter,
    "columns": columns,
    "sample_rows": samples
}))