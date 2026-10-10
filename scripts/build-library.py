#!/usr/bin/env python3
"""Scan music/ and picture/ and write library.json. Do not edit library.json by hand."""
from __future__ import annotations

import json
import re
from pathlib import Path

try:
    from mutagen import File as MutagenFile
except Exception:
    MutagenFile = None

ROOT = Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "music"
PICTURE_DIR = ROOT / "picture"
OUT = ROOT / "library.json"

AUDIO_EXT = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma", ".opus"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"}

KNOWN = {
    "inhalethethrone": ("Cho Young-Wuk", "Inhale the Throne"),
    "espersomaciato": ("Tommy", "Esperso Maciyato"),
    "edsheeranazizam": ("Ed Sheeran", "Azizam"),
    "edsheeranazizamremix": ("Ed Sheeran", "Azizam"),
}


def strip_ext(name: str) -> str:
    return re.sub(
        r"\.(mp3|wav|flac|m4a|ogg|aac|wma|opus|jpg|jpeg|png|webp|gif|bmp|avif)$",
        "",
        name,
        flags=re.I,
    )


def clean_junk(s: str) -> str:
    s = s.replace("\u2013", "-").replace("\u2014", "-")
    s = re.sub(r"\.mp3$", "", s, flags=re.I)
    s = re.sub(r"^\s*\d+[\.\-_]\s*", "", s)
    s = re.sub(
        r"[\(\[\{_\-\s]*(?:64|128|192|256|320)\s*(?:kbps)?[\)\]\}\_\-\s]*",
        " ",
        s,
        flags=re.I,
    )
    s = re.sub(r"(?:www\.|https?://|@|telegram|t\.me)[\w\./\-]*", " ", s, flags=re.I)
    s = re.sub(r"\s{2,}", " ", s).strip(" -_.")
    return s


def norm(s: str) -> str:
    s = clean_junk(strip_ext(s)).lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def title_case(s: str) -> str:
    parts = re.split(r"(\s+|-)", s)
    out = []
    for p in parts:
        if not p or p.isspace() or p == "-":
            out.append(p)
        else:
            out.append(p[:1].upper() + p[1:] if len(p) > 1 else p.upper())
    return "".join(out).strip()


def parse_song(fname: str):
    cleaned = clean_junk(strip_ext(fname))
    key = norm(cleaned)
    if key in KNOWN:
        return KNOWN[key]
    parts = re.split(r"\s+-\s*", cleaned, maxsplit=1)
    if len(parts) == 2 and parts[0] and parts[1]:
        artist = parts[0].replace("E-d Sheeran", "Ed Sheeran").replace("E-d sheeran", "Ed Sheeran")
        return title_case(artist), title_case(parts[1])
    bits = cleaned.split("-")
    if len(bits) >= 4 and " " not in cleaned:
        return title_case(" ".join(bits[:2])), title_case(" ".join(bits[2:]))
    return "Unknown", title_case(cleaned)


EMBED_DIR = PICTURE_DIR / "_embedded"


def embedded_cover(music_path: Path, slug: str):
    """Write the cover stored inside the audio file. Returns a site path or None."""
    if MutagenFile is None or not music_path.is_file():
        return None
    try:
        audio = MutagenFile(music_path)
    except Exception:
        return None
    if audio is None:
        return None
    pictures = []
    if getattr(audio, "pictures", None):
        pictures = list(audio.pictures)
    tags = getattr(audio, "tags", None)
    if tags is not None and hasattr(tags, "getall"):
        pictures.extend(tags.getall("APIC"))
    if not pictures:
        return None
    pic = pictures[0]
    mime = (getattr(pic, "mime", "") or "").lower()
    ext = ".png" if "png" in mime else ".webp" if "webp" in mime else ".jpg"
    EMBED_DIR.mkdir(parents=True, exist_ok=True)
    out = EMBED_DIR / f"{slug}{ext}"
    out.write_bytes(getattr(pic, "data", b""))
    if not out.stat().st_size:
        return None
    return "picture/_embedded/" + out.name


def find_cover(artist, title, orig, covers):
    keys = [norm(title), norm(artist + " " + title), norm(orig)]
    for c in covers:
        if c["norm"] in keys or c["title_norm"] in keys:
            return "picture/" + c["file"]
    tn = norm(title)
    if tn:
        for c in covers:
            if tn in c["norm"] or c["norm"] in tn or tn in c["title_norm"]:
                return "picture/" + c["file"]
    return "logo.jpg"


def main() -> None:
    music_files = sorted(
        p.name for p in MUSIC_DIR.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_EXT
    )
    covers = []
    if PICTURE_DIR.exists():
        for p in PICTURE_DIR.iterdir():
            if p.is_file() and p.suffix.lower() in IMAGE_EXT:
                cleaned = clean_junk(strip_ext(p.name))
                title_part = cleaned.split("-")[-1].strip() if "-" in cleaned else cleaned
                covers.append(
                    {
                        "file": p.name,
                        "norm": norm(p.name),
                        "title_norm": norm(title_part),
                    }
                )

    songs = []
    used = set()
    for fname in music_files:
        artist, title = parse_song(fname)
        slug = norm(artist + " " + title) or norm(fname)
        base = slug
        n = 2
        while slug in used:
            slug = f"{base}{n}"
            n += 1
        used.add(slug)
        songs.append(
            {
                "id": slug,
                "title": title,
                "artist": artist,
                "cover": embedded_cover(MUSIC_DIR / fname, slug) or find_cover(artist, title, fname, covers),
                "music": "music/" + fname,
                "hasMusic": True,
            }
        )

    OUT.write_text(json.dumps(songs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(songs)} tracks to {OUT}")


if __name__ == "__main__":
    main()
