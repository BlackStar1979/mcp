import sys, json
import h5py

data = json.load(sys.stdin)
path = data["path"]
max_items = int(data.get("max_items", 500))
include_attrs = bool(data.get("include_attrs", True))
max_attrs = int(data.get("max_attrs", 20))

items = []
count = 0
truncated = False

def walk(name, obj):
    global count, truncated
    if truncated:
        return

    entry = {"path": name, "type": type(obj).__name__}

    if isinstance(obj, h5py.Dataset):
        entry.update({
            "shape": obj.shape,
            "dtype": str(obj.dtype),
            "chunks": obj.chunks,
            "compression": obj.compression
        })

    if include_attrs and hasattr(obj, "attrs"):
        attrs = {}
        for i, (k, v) in enumerate(obj.attrs.items()):
            if i >= max_attrs:
                break
            attrs[str(k)] = str(v)
        entry["attrs"] = attrs

    items.append(entry)
    count += 1

    if count >= max_items:
        truncated = True
        return

with h5py.File(path, "r") as f:
    f.visititems(walk)

print(json.dumps({
    "path": path,
    "returned_items": len(items),
    "truncated": truncated,
    "items": items
}))