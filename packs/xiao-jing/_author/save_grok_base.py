import json
import base64
from pathlib import Path

src = Path(r"C:\Users\Administrator\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-09-20T09-10-11-329Z.json")
data = json.loads(src.read_text(encoding="utf-8"))
blob = json.dumps(data)
marker = "data:image/jpeg;base64,"
idx = blob.find(marker)
if idx < 0:
    raise SystemExit("no jpeg data url")
start = idx + len(marker)
end = blob.find('"', start)
raw = base64.b64decode(blob[start:end])
out_dir = Path(r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\xiao-jing\ref")
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / "grok_idle_base.jpg"
out.write_bytes(raw)
print("wrote", out, "bytes", len(raw))
