import json
import base64
from pathlib import Path

src = Path(r"C:\Users\Administrator\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-09-20T09-12-29-741Z.json")
blob = src.read_text(encoding="utf-8")
marker = "data:video/mp4;base64,"
idx = blob.find(marker)
if idx < 0:
    raise SystemExit("no mp4 data url")
start = idx + len(marker)
end = blob.find('"', start)
raw = base64.b64decode(blob[start:end])
out = Path(r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\xiao-jing\ref\grok_idle.mp4")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(raw)
print("wrote", out, "bytes", len(raw))
