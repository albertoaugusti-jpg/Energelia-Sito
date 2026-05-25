"""Bandi Manager — interfaccia locale per gestire le card bandi del sito Energelia.

Avvio: `python app.py` (oppure doppio click sul .bat di avvio).
Si apre http://127.0.0.1:5005 nel browser.
"""

from __future__ import annotations

import os
import shutil
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Optional

from flask import (
    Flask, render_template, request, redirect, url_for, flash,
    send_from_directory, abort
)
from werkzeug.utils import secure_filename

from parser import (
    Bando, read_bandi, write_bandi, slugify,
    CTA_MODAL, CTA_REPORT, CTA_LINK, STATI,
)


# ----------------- Path setup -----------------

APP_DIR = Path(__file__).resolve().parent
REPO_DIR = APP_DIR.parent
TEMPLATE_SITE_DIR = REPO_DIR / "templates" / "life-insurance-website-template"
INDEX_HTML = TEMPLATE_SITE_DIR / "index.html"
IMG_DIR = TEMPLATE_SITE_DIR / "img"
REPORTS_DIR = TEMPLATE_SITE_DIR / "static" / "reports"
REPORTS_JSON = REPORTS_DIR / "_reports.json"
BACKUPS_DIR = APP_DIR / "backups"

# Assicurati che le cartelle esistano
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ----------------- Flask app -----------------

app = Flask(__name__, template_folder=str(APP_DIR / "templates"),
            static_folder=str(APP_DIR / "static"))
app.secret_key = "bandi-manager-local-only"
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32 MB max upload


# ----------------- Helpers -----------------

def _load_bandi() -> list[Bando]:
    return read_bandi(INDEX_HTML, REPORTS_JSON)


def _save_bandi(bandi: list[Bando]) -> Path:
    return write_bandi(INDEX_HTML, bandi, REPORTS_JSON, BACKUPS_DIR)


def _find(bandi: list[Bando], slug: str) -> Optional[Bando]:
    for b in bandi:
        if b.slug == slug:
            return b
    return None


def _list_immagini() -> list[str]:
    if not IMG_DIR.exists():
        return []
    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
    files = sorted(p.name for p in IMG_DIR.iterdir()
                   if p.is_file() and p.suffix.lower() in exts)
    return [f"img/{name}" for name in files]


def _form_to_bando(form, files, esistente: Optional[Bando] = None) -> Bando:
    """Costruisce un Bando dai dati del form."""
    titolo_breve = form.get("titolo_breve", "").strip()
    titolo = form.get("titolo", "").strip() or titolo_breve

    # Slug: se modifica, mantieni il vecchio; se nuovo, genera da titolo
    slug = esistente.slug if esistente else slugify(titolo_breve or titolo)

    cta_tipo = form.get("cta_tipo", CTA_MODAL)

    # Gestione upload PDF (per cta_tipo=report_pdf)
    report_filename = esistente.report_filename if esistente else ""
    pdf = files.get("pdf_report") if files else None
    if pdf and pdf.filename:
        safe = secure_filename(pdf.filename)
        if not safe.lower().endswith(".pdf"):
            safe += ".pdf"
        # Salva come <slug>.pdf per evitare collisioni
        target_name = f"{slug}.pdf"
        target_path = REPORTS_DIR / target_name
        pdf.save(str(target_path))
        report_filename = target_name

    # Gestione upload immagine (opzionale)
    immagine = form.get("immagine", "").strip()
    if not immagine and esistente:
        immagine = esistente.immagine
    img = files.get("immagine_upload") if files else None
    if img and img.filename:
        safe = secure_filename(img.filename)
        target_path = IMG_DIR / safe
        img.save(str(target_path))
        immagine = f"img/{safe}"

    return Bando(
        slug=slug,
        titolo=titolo,
        titolo_breve=titolo_breve,
        descrizione_breve=form.get("descrizione_breve", "").strip(),
        ente=form.get("ente", "").strip(),
        badge_testo=form.get("badge_testo", "").strip(),
        badge_icona=form.get("badge_icona", "fa-bullhorn").strip() or "fa-bullhorn",
        badge_hot=bool(form.get("badge_hot")),
        featured=bool(form.get("featured")),
        immagine=immagine or "img/business_funding_bg.jpg",
        alt_immagine=form.get("alt_immagine", "").strip(),
        stato=form.get("stato", "aperto"),
        scadenza=form.get("scadenza", "").strip(),
        importo=form.get("importo", "").strip(),
        beneficiari=form.get("beneficiari", "").strip(),
        spese=form.get("spese", "").strip(),
        nota=form.get("nota", "").strip(),
        fonte=form.get("fonte", "").strip(),
        cta_tipo=cta_tipo,
        cta_url=form.get("cta_url", "").strip(),
        cta_label=form.get("cta_label", "").strip(),
        cta_icon=form.get("cta_icon", "").strip(),
        report_filename=report_filename if cta_tipo == CTA_REPORT else "",
    )


# ----------------- Routes -----------------

@app.route("/")
def lista():
    bandi = _load_bandi()
    return render_template("lista.html", bandi=bandi, totale=len(bandi),
                           index_path=str(INDEX_HTML))


@app.route("/nuovo", methods=["GET", "POST"])
def nuovo():
    if request.method == "POST":
        nuovo_b = _form_to_bando(request.form, request.files)
        bandi = _load_bandi()
        # Posizione: di default in cima
        posizione = request.form.get("posizione", "fondo")
        if posizione == "cima":
            bandi.insert(0, nuovo_b)
        else:
            bandi.append(nuovo_b)
        # Disambigua slug se duplicato
        slugs = set()
        for b in bandi:
            base = b.slug
            i = 1
            while b.slug in slugs:
                i += 1
                b.slug = f"{base}-{i}"
            slugs.add(b.slug)
        _save_bandi(bandi)
        flash(f"Bando '{nuovo_b.titolo_breve}' creato.", "success")
        return redirect(url_for("lista"))

    # GET: form vuoto
    return render_template("form.html", bando=None,
                           immagini=_list_immagini(),
                           stati=STATI, azione="nuovo")


@app.route("/modifica/<slug>", methods=["GET", "POST"])
def modifica(slug):
    bandi = _load_bandi()
    b = _find(bandi, slug)
    if not b:
        abort(404)

    if request.method == "POST":
        aggiornato = _form_to_bando(request.form, request.files, esistente=b)
        # Mantieni la posizione
        idx = bandi.index(b)
        bandi[idx] = aggiornato
        _save_bandi(bandi)
        flash(f"Bando '{aggiornato.titolo_breve}' aggiornato.", "success")
        return redirect(url_for("lista"))

    return render_template("form.html", bando=b,
                           immagini=_list_immagini(),
                           stati=STATI, azione="modifica")


@app.route("/elimina/<slug>", methods=["POST"])
def elimina(slug):
    bandi = _load_bandi()
    b = _find(bandi, slug)
    if not b:
        abort(404)
    bandi = [x for x in bandi if x.slug != slug]
    _save_bandi(bandi)
    flash(f"Bando '{b.titolo_breve}' eliminato.", "success")
    return redirect(url_for("lista"))


@app.route("/duplica/<slug>", methods=["POST"])
def duplica(slug):
    bandi = _load_bandi()
    b = _find(bandi, slug)
    if not b:
        abort(404)
    nuovo_b = Bando(**b.as_dict())
    nuovo_b.titolo_breve = (b.titolo_breve + " (copia)").strip()
    nuovo_b.titolo = (b.titolo + " (copia)").strip()
    nuovo_b.slug = slugify(nuovo_b.titolo_breve)
    # Disambigua
    existing = {x.slug for x in bandi}
    base = nuovo_b.slug
    i = 1
    while nuovo_b.slug in existing:
        i += 1
        nuovo_b.slug = f"{base}-{i}"
    idx = bandi.index(b)
    bandi.insert(idx + 1, nuovo_b)
    _save_bandi(bandi)
    flash(f"Bando duplicato come '{nuovo_b.titolo_breve}'.", "success")
    return redirect(url_for("modifica", slug=nuovo_b.slug))


@app.route("/sposta/<slug>/<direzione>", methods=["POST"])
def sposta(slug, direzione):
    bandi = _load_bandi()
    b = _find(bandi, slug)
    if not b:
        abort(404)
    idx = bandi.index(b)
    if direzione == "su" and idx > 0:
        bandi[idx - 1], bandi[idx] = bandi[idx], bandi[idx - 1]
    elif direzione == "giu" and idx < len(bandi) - 1:
        bandi[idx + 1], bandi[idx] = bandi[idx], bandi[idx + 1]
    _save_bandi(bandi)
    return redirect(url_for("lista"))


@app.route("/anteprima-img/<path:filename>")
def anteprima_img(filename):
    """Serve immagini dalla cartella img/ del sito per anteprima."""
    return send_from_directory(str(IMG_DIR), filename)


# ----------------- Avvio -----------------

def _open_browser():
    time.sleep(1.0)
    webbrowser.open("http://127.0.0.1:5005/")


def main():
    print("=" * 60)
    print("  BANDI MANAGER — Energelia")
    print("=" * 60)
    print(f"  Repo:      {REPO_DIR}")
    print(f"  Index:     {INDEX_HTML}")
    print(f"  Reports:   {REPORTS_DIR}")
    print(f"  Backups:   {BACKUPS_DIR}")
    print()
    print("  Apri il browser su: http://127.0.0.1:5005/")
    print("  Per chiudere: premi Ctrl+C in questa finestra")
    print("=" * 60)

    if not INDEX_HTML.exists():
        print(f"\n[ERRORE] index.html non trovato in {INDEX_HTML}")
        print("  Verifica che la cartella bandi-manager sia dentro al repo Energelia-Sito.")
        sys.exit(1)

    threading.Thread(target=_open_browser, daemon=True).start()
    app.run(host="127.0.0.1", port=5005, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
