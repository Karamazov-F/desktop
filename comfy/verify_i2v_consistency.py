#!/usr/bin/env python3
"""Compare idle vs wave frames; require closed-loop similarity first/last."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

SPRITES = Path(__file__).resolve().parents[1] / "packs" / "sample-human" / "sprites"
REF = Path(__file__).resolve().parents[1] / "packs" / "sample-human" / "ref" / "ref_idle.png"
OUT = Path(__file__).resolve().parent / "verify"


def rgba_mean(path: Path) -> np.ndarray:  # kept for debugging
    img = Image.open(path).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    arr = np.asarray(img).astype(np.float32)
    # ignore near-transparent
    a = arr[..., 3] > 16
    if a.sum() < 100:
        return arr[..., :3].mean(axis=(0, 1))
    return arr[..., :3][a].mean(axis=0)


def mse_opaque(a: Path, b: Path) -> float:
    ia = Image.open(a).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    ib = Image.open(b).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    aa = np.asarray(ia).astype(np.float32)
    bb = np.asarray(ib).astype(np.float32)
    mask = (aa[..., 3] > 16) | (bb[..., 3] > 16)
    if mask.sum() < 50:
        return 9999.0
    d = (aa[..., :3] - bb[..., :3])[mask]
    return float((d * d).mean())


def contact_sheet(paths: list[Path], dst: Path) -> None:
    imgs = [Image.open(p).convert("RGBA") for p in paths]
    w = sum(i.width for i in imgs)
    h = max(i.height for i in imgs)
    sheet = Image.new("RGBA", (w, h), (30, 30, 30, 255))
    x = 0
    for im in imgs:
        sheet.paste(im, (x, 0), im)
        x += im.width
    dst.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dst)


def main() -> int:
    def _idx(p: Path) -> int:
        try:
            return int(p.stem.rsplit("_", 1)[-1])
        except ValueError:
            return -1

    idles = sorted(
        (p for p in SPRITES.glob("idle_*.png") if _idx(p) >= 0), key=_idx
    )
    meows = sorted(
        (p for p in SPRITES.glob("meow_*.png") if _idx(p) >= 0), key=_idx
    )
    contact = SPRITES / "contact.png"
    idle = SPRITES / "idle.png"
    report = {
        "idle": str(idle),
        "meow_count": len(meows),
        "ok": True,
        "issues": [],
        "idle_loop_count": len(idles),
    }
    if not idles and not idle.exists():
        report["ok"] = False
        report["issues"].append("missing idle loop / idle.png")
    if len(meows) < 24:
        report["ok"] = False
        report["issues"].append(f"meow frames < 24 (got {len(meows)}) — raise density")
    if len(idles) < 16:
        report["ok"] = False
        report["issues"].append(f"idle loop frames < 16 (got {len(idles)})")
    bridge_ref = contact if contact.exists() else (idles[0] if idles else idle)
    if meows and bridge_ref.exists():
        first = mse_opaque(bridge_ref, meows[0])
        last = mse_opaque(bridge_ref, meows[-1])
        report["mse_contact_vs_meow0"] = round(first, 2)
        report["mse_contact_vs_meow_last"] = round(last, 2)
        # After seam_bridge, first/last must be pixel-identical to contact
        if first > 1.0 or last > 1.0:
            report["ok"] = False
            report["issues"].append("meow first/last not bridged to contact (run seam_bridge.py)")
        if idles:
            i0 = mse_opaque(bridge_ref, idles[0])
            report["mse_contact_vs_idle0"] = round(i0, 2)
            # idle last is intentionally NOT contact (pingpong loop); only pin frame0
            if i0 > 1.0:
                report["ok"] = False
                report["issues"].append("idle_0 not bridged to contact")

        sheet_frames = [bridge_ref]
        if idles:
            step = max(1, len(idles) // 6)
            sheet_frames += idles[::step][:6]
        step_m = max(1, len(meows) // 8)
        sheet_frames += meows[::step_m][:8]
        contact_sheet(sheet_frames, OUT / "idle_meow_sheet.png")
        report["sheet"] = str(OUT / "idle_meow_sheet.png")
    if REF.exists() and idle.exists():
        # ref is green-screen; only rough check after noting both exist
        report["ref_exists"] = True
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "i2v_consistency.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
