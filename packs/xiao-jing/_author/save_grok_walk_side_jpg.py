import base64
from pathlib import Path

src = Path(
    r"C:\Users\Administrator\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-09-20T09-42-07-749Z.json"
)
blob = src.read_text(encoding="utf-8")
marker = "base64,"
idx = blob.find(marker)
if idx < 0:
    raise SystemExit("no data url")
start = idx + len(marker)
end = blob.find('"', start)
raw = base64.b64decode(blob[start:end])
out = Path(__file__).resolve().parents[1] / "ref" / "grok_walk_side.jpg"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(raw)
print("wrote", out, "bytes", len(raw))
