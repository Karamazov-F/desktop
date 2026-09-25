import os
import sys
import tarfile
import zipfile

src, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
low = src.lower()
if low.endswith(".zip"):
    with zipfile.ZipFile(src) as z:
        z.extractall(dest)
elif low.endswith(".bz2") or low.endswith(".gz") or low.endswith(".tgz") or low.endswith(".tar"):
    mode = "r:bz2" if low.endswith(".bz2") else "r:gz" if (low.endswith(".gz") or low.endswith(".tgz")) else "r"
    kw = {}
    if hasattr(tarfile, "data_filter"):
        kw["filter"] = "data"
    with tarfile.open(src, mode) as t:
        t.extractall(dest, **kw)
else:
    raise SystemExit(f"unsupported archive: {src}")
