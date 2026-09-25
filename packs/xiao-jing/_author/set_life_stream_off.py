import json
from pathlib import Path

p = Path(r"C:\Users\Administrator\AppData\Roaming\desktop-pet-custom\desktop-pet-custom\settings.json")
d = json.loads(p.read_text(encoding="utf-8"))
d["lifeStream"] = False
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("lifeStream", d.get("lifeStream"), "packId", d.get("packId"))
