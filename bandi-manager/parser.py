"""Parser / writer delle card bandi dentro index.html."""

from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from bs4 import BeautifulSoup, Tag, NavigableString


MARKER_START = "<!-- BANDI MANAGER START - non modificare a mano, usa l'app bandi-manager -->"
MARKER_END = "<!-- BANDI MANAGER END -->"


STATI = [
    ("aperto", "Aperto"),
    ("sportello", "Sportello aperto"),
    ("futuro", "In apertura"),
    ("sospeso", "Sospeso"),
    ("scaduto", "Scaduto"),
]

CTA_MODAL = "modal"
CTA_REPORT = "report_pdf"
CTA_LINK = "link_diretto"


@dataclass
class Bando:
    slug: str
    titolo: str
    titolo_breve: str
    descrizione_breve: str
    ente: str = ""
    badge_testo: str = ""
    badge_icona: str = "fa-bullhorn"
    badge_hot: bool = False
    featured: bool = False
    immagine: str = "img/business_funding_bg.jpg"
    alt_immagine: str = ""
    stato: str = "aperto"
    scadenza: str = ""
    importo: str = ""
    beneficiari: str = ""
    spese: str = ""
    nota: str = ""
    fonte: str = ""
    cta_tipo: str = CTA_MODAL
    cta_url: str = ""
    cta_label: str = ""
    cta_icon: str = ""
    report_filename: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


_ACCENTI = str.maketrans({
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a",
    "è": "e", "é": "e", "ê": "e", "ë": "e",
    "ì": "i", "í": "i", "î": "i", "ï": "i",
    "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o",
    "ù": "u", "ú": "u", "û": "u", "ü": "u",
    "ñ": "n", "ç": "c",
    "&": "e",
})


def slugify(text: str) -> str:
    text = (text or "").lower().strip().translate(_ACCENTI)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "bando"


def _extract_card(item: Tag) -> Optional[Bando]:
    card = item.find("div", class_="bando-card-new")
    if not card:
        return None

    titolo = (card.get("data-bando-titolo") or "").strip()
    h4 = card.find("h4", class_="bando-card-title-new")
    p = card.find("p", class_="bando-card-desc-new")
    titolo_breve = h4.get_text(strip=True) if h4 else ""
    descrizione = p.get_text(strip=True) if p else ""

    if not titolo:
        titolo = titolo_breve or "Bando senza titolo"

    classes = card.get("class", [])
    featured = "bando-card-featured-new" in classes

    img = card.find("img")
    img_src = ""
    img_alt = ""
    if img:
        img_alt = img.get("alt", "")
        raw_src = img.get("src", "")
        m = re.search(r"filename=['\"]([^'\"]+)['\"]", raw_src)
        img_src = m.group(1) if m else raw_src

    badge = card.find("span", class_="bando-novita-badge")
    badge_testo = ""
    badge_icona = "fa-bullhorn"
    badge_hot = False
    if badge:
        badge_hot = "bando-novita-hot" in badge.get("class", [])
        icon = badge.find("i")
        if icon:
            for cls in icon.get("class", []):
                if cls.startswith("fa-") and cls not in ("fa-1x", "fa-2x"):
                    badge_icona = cls
                    break
        parts = []
        for child in badge.children:
            if isinstance(child, NavigableString):
                t = str(child).strip()
                if t:
                    parts.append(t)
        badge_testo = " ".join(parts).strip()

    a = card.find("a", class_="btn-scarica-report-new")
    cta_tipo = CTA_MODAL
    cta_url = ""
    cta_label = ""
    cta_icon = ""
    if a:
        href = a.get("href", "")
        onclick = a.get("onclick", "")
        if href and href != "javascript:void(0)":
            if href.startswith("/download-report/"):
                cta_tipo = CTA_REPORT
            else:
                cta_tipo = CTA_LINK
                cta_url = href
        elif "openBandoModal" in onclick:
            cta_tipo = CTA_MODAL
        cta_label = a.get_text(strip=True)
        icon = a.find("i")
        if icon:
            for cls in icon.get("class", []):
                if cls.startswith("fa-") and cls not in ("fa-1x", "fa-2x"):
                    cta_icon = cls
                    break

    # Slug persistito (se presente nell'HTML), altrimenti derivato
    slug = (card.get("data-bando-slug") or "").strip()
    if not slug:
        slug = slugify(titolo_breve or titolo)

    return Bando(
        slug=slug,
        titolo=titolo,
        titolo_breve=titolo_breve,
        descrizione_breve=descrizione,
        ente=(card.get("data-bando-ente") or "").strip(),
        badge_testo=badge_testo,
        badge_icona=badge_icona,
        badge_hot=badge_hot,
        featured=featured,
        immagine=img_src,
        alt_immagine=img_alt,
        stato=(card.get("data-bando-stato") or "aperto").strip(),
        scadenza=(card.get("data-bando-scadenza") or "").strip(),
        importo=(card.get("data-bando-importo") or "").strip(),
        beneficiari=(card.get("data-bando-beneficiari") or "").strip(),
        spese=(card.get("data-bando-spese") or "").strip(),
        nota=(card.get("data-bando-nota") or "").strip(),
        fonte=(card.get("data-bando-fonte") or "").strip(),
        cta_tipo=cta_tipo,
        cta_url=cta_url,
        cta_label=cta_label,
        cta_icon=cta_icon,
        report_filename="",
    )


def read_bandi(index_html_path: Path, reports_json_path: Optional[Path] = None) -> List[Bando]:
    with open(index_html_path, "r", encoding="utf-8") as f:
        html_text = f.read()

    start_idx = html_text.find(MARKER_START)
    end_idx = html_text.find(MARKER_END)
    if start_idx == -1 or end_idx == -1:
        raise ValueError(f"Marker BANDI MANAGER non trovati in {index_html_path}")

    section_html = html_text[start_idx + len(MARKER_START):end_idx]
    soup = BeautifulSoup(section_html, "html.parser")

    bandi: List[Bando] = []
    for item in soup.find_all("div", class_="bandi-carousel-item"):
        b = _extract_card(item)
        if b:
            bandi.append(b)

    # Risolvi filename PDF
    if reports_json_path and reports_json_path.exists():
        try:
            with open(reports_json_path, "r", encoding="utf-8") as f:
                report_map = json.load(f)
        except (json.JSONDecodeError, OSError):
            report_map = {}
        for b in bandi:
            if b.cta_tipo == CTA_REPORT and b.slug in report_map:
                b.report_filename = report_map[b.slug]

    # Slug univoci (in caso di collisioni)
    seen = set()
    for b in bandi:
        base = b.slug
        i = 1
        while b.slug in seen:
            i += 1
            b.slug = f"{base}-{i}"
        seen.add(b.slug)

    return bandi


def _esc(value: str) -> str:
    if value is None:
        return ""
    return (value.replace("&", "&amp;")
                 .replace('"', "&quot;")
                 .replace("<", "&lt;")
                 .replace(">", "&gt;"))


def _render_card(b: Bando) -> str:
    classes = ["bando-card-new"]
    if b.featured:
        classes.append("bando-card-featured-new")
    card_class = " ".join(classes)

    badge_classes = ["bando-novita-badge"]
    if b.badge_hot:
        badge_classes.append("bando-novita-hot")
    badge_class = " ".join(badge_classes)

    data_attrs_pairs = [
        ("data-bando-slug", b.slug),
        ("data-bando-titolo", b.titolo),
        ("data-bando-ente", b.ente),
        ("data-bando-scadenza", b.scadenza),
        ("data-bando-stato", b.stato),
        ("data-bando-importo", b.importo),
        ("data-bando-beneficiari", b.beneficiari),
        ("data-bando-spese", b.spese),
        ("data-bando-nota", b.nota),
        ("data-bando-fonte", b.fonte),
    ]
    data_attrs_strs = [f'{k}="{_esc(v)}"' for k, v in data_attrs_pairs if v]
    if data_attrs_strs:
        data_attrs_block = "\n               " + "\n               ".join(data_attrs_strs)
    else:
        data_attrs_block = ""

    if b.cta_tipo == CTA_REPORT and b.report_filename:
        cta_href = f"/download-report/{_esc(b.slug)}"
        cta_onclick = ""
        default_icon = "fa-file-download"
        default_label = "Scarica Report Gratuito"
    elif b.cta_tipo == CTA_LINK and b.cta_url:
        cta_href = _esc(b.cta_url)
        cta_onclick = ""
        default_icon = "fa-file-download"
        default_label = "Scarica Report Gratuito"
    else:
        cta_href = "javascript:void(0)"
        cta_onclick = ' onclick="openBandoModal(this)"'
        default_icon = "fa-info-circle"
        default_label = "Scopri di piu"

    cta_icon = b.cta_icon or default_icon
    cta_label = b.cta_label or default_label

    return f'''        <div class="bandi-carousel-item">
          <div class="{card_class}"{data_attrs_block}>
            <div class="bando-card-image">
              <img src="{{{{ url_for('static', filename='{_esc(b.immagine)}') }}}}" alt="{_esc(b.alt_immagine or b.titolo_breve or b.titolo)}">
              <span class="{badge_class}"><i class="fas {_esc(b.badge_icona)} me-1"></i>{_esc(b.badge_testo)}</span>
            </div>
            <div class="bando-card-body">
              <h4 class="bando-card-title-new">{_esc(b.titolo_breve or b.titolo)}</h4>
              <p class="bando-card-desc-new">{_esc(b.descrizione_breve)}</p>
              <a href="{cta_href}"{cta_onclick} class="btn-scarica-report-new" style="text-decoration: none; display: inline-block;">
                <i class="fas {cta_icon} me-2"></i>{cta_label}
              </a>
            </div>
          </div>
        </div>'''


def write_bandi(
    index_html_path: Path,
    bandi: List[Bando],
    reports_json_path: Optional[Path] = None,
    backup_dir: Optional[Path] = None,
) -> Path:
    with open(index_html_path, "r", encoding="utf-8") as f:
        html_text = f.read()

    start_idx = html_text.find(MARKER_START)
    end_idx = html_text.find(MARKER_END)
    if start_idx == -1 or end_idx == -1:
        raise ValueError("Marker BANDI MANAGER non trovati. Impossibile salvare.")

    cards_html = "\n\n".join(_render_card(b) for b in bandi)
    new_section = MARKER_START + "\n\n" + cards_html + "\n\n        " + MARKER_END

    new_html = (
        html_text[:start_idx]
        + new_section
        + html_text[end_idx + len(MARKER_END):]
    )

    backup_path: Optional[Path] = None
    if backup_dir:
        backup_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = backup_dir / f"index.html.{ts}.bak"
        shutil.copy2(index_html_path, backup_path)

    tmp_path = index_html_path.with_suffix(index_html_path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8", newline="") as f:
        f.write(new_html)
    os.replace(tmp_path, index_html_path)

    if reports_json_path is not None:
        report_map = {b.slug: b.report_filename
                      for b in bandi
                      if b.cta_tipo == CTA_REPORT and b.report_filename}
        reports_json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(reports_json_path, "w", encoding="utf-8") as f:
            json.dump(report_map, f, indent=2, ensure_ascii=False)
            f.write("\n")

    return backup_path or index_html_path
