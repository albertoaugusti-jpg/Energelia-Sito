"""Estrazione automatica dei campi di un bando da un PDF report (formato Energelia).

Il PDF di riferimento (generato dal sistema Energelia) ha un layout fisso a due
colonne, con sezioni identificate da titoli in maiuscolo (es. "CHI PUO' PARTECIPARE").
Questa funzione prova a leggerlo e a restituire un dizionario compatibile con i campi
del form di Bandi Manager (titolo_breve, ente, descrizione_breve, importo, beneficiari,
spese, nota, ...). Tutti i campi restano comunque modificabili a mano nel form.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

import pdfplumber


SECTION_MAP = {
    "ENTE / FINALITA'": "finalita",
    "CHI PUO' PARTECIPARE": "beneficiari",
    "COSA E' FINANZIABILE": "spese",
    "SPESE NON AMMISSIBILI": "spese_non_ammissibili",
    "CONTRIBUTO / INTENSITA'": "contributo_intensita",
    "CRITERI / VALUTAZIONE": "criteri",
    "COME PRESENTARE": "come_presentare",
    "PERCHE' E' INTERESSANTE": "perche",
    "CRITICITA' E ATTENZIONI": "criticita",
}

BULLET_RE = re.compile(r"^l\s+")


def _is_header(line: str) -> bool:
    return line.strip() in SECTION_MAP


def _parse_column(text: str) -> Dict[str, List[str]]:
    """Divide il testo di una colonna in sezioni {nome: [bullet, ...]}."""
    lines = text.split("\n")
    start = None
    for i, l in enumerate(lines):
        if _is_header(l):
            start = i
            break
    if start is None:
        return {}

    sections: Dict[str, List[str]] = {}
    current = None
    bullets: List[str] = []
    for l in lines[start:]:
        if _is_header(l):
            if current:
                sections[SECTION_MAP[current]] = bullets
            current = l.strip()
            bullets = []
            continue
        stripped = l.strip()
        if not stripped:
            continue
        if BULLET_RE.match(stripped):
            bullets.append(BULLET_RE.sub("", stripped))
        else:
            # riga di continuazione (testo andato a capo nel PDF)
            if bullets:
                bullets[-1] = (bullets[-1] + " " + stripped).strip()
            else:
                bullets.append(stripped)
    if current:
        sections[SECTION_MAP[current]] = bullets
    return sections


def _fmt_bullets(items: List[str]) -> str:
    return "\n".join(f"- {b}" for b in items)


def extract_bando_da_pdf(file_obj: Any) -> Dict[str, str]:
    """Legge un PDF (path o file-like) e prova a estrarre i campi di un bando.

    Solleva ValueError se il PDF non sembra avere il formato atteso
    (in tal caso il form va semplicemente compilato a mano).
    """
    with pdfplumber.open(file_obj) as pdf:
        if not pdf.pages:
            raise ValueError("Il PDF non contiene pagine leggibili.")
        page = pdf.pages[0]
        w, h = page.width, page.height

        naive = page.extract_text() or ""
        naive_lines = [l for l in naive.split("\n")]
        if not naive_lines or not naive_lines[0].strip():
            raise ValueError("Non sono riuscito a leggere testo dal PDF.")

        titolo = naive_lines[0].strip()

        ente, descrizione = "", ""
        if len(naive_lines) > 1:
            parts = re.split(r"\s*\u00b7\s*", naive_lines[1].strip(), maxsplit=1)
            ente = parts[0].strip()
            descrizione = parts[1].strip() if len(parts) > 1 else ""

        riferimento_legale = naive_lines[2].strip() if len(naive_lines) > 2 else ""

        importo_lines = []
        if len(naive_lines) > 4:
            importo_lines.append(naive_lines[3].strip())
            importo_lines.append(naive_lines[4].strip())
            if len(naive_lines) > 5 and naive_lines[5].strip():
                importo_lines.append(naive_lines[5].strip())

        left_text = page.crop((0, 0, w / 2, h)).extract_text() or ""
        right_text = page.crop((w / 2, 0, w, h)).extract_text() or ""
        sections = {**_parse_column(left_text), **_parse_column(right_text)}

        return {
            "titolo_breve": titolo[:80],
            "titolo": titolo[:200],
            "ente": ente[:200],
            "badge_testo": ente[:50],
            "descrizione_breve": descrizione[:240],
            "importo": "\n".join(importo_lines)[:500],
            "beneficiari": _fmt_bullets(sections.get("beneficiari", []))[:800],
            "spese": _fmt_bullets(sections.get("spese", []))[:800],
            "nota": riferimento_legale[:500],
        }
