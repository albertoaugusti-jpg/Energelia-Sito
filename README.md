# Energelia.it — Sito aziendale

Sito Flask di Energelia Srl (consulenza finanza agevolata).

## Stack
- Python 3.11 + Flask 3
- PostgreSQL (per leads e consultations)
- Gunicorn (WSGI server in produzione)
- Hosting: Render.com
- DNS: Register.it

## Struttura
- `main2.py` — applicazione Flask (entry point)
- `templates/life-insurance-website-template/` — pagine HTML pubbliche + asset
- `templates/admin/` — pannello admin (`/forzasamp`)
- `static/` — file statici aggiuntivi (immagini, report PDF)
- `requirements.txt` — dipendenze Python
- `Procfile` — comando di avvio per Render
- `runtime.txt` — versione Python
- `render.yaml` — configurazione automatica Render (opzionale)

## Variabili d'ambiente richieste
- `DATABASE_URL` — stringa di connessione PostgreSQL (Render la fornisce automaticamente)
- `ADMIN_PASSWORD` — password pannello admin (default: `energelia2026`)
- `PORT` — Render la fornisce automaticamente

## Sviluppo locale
```bash
pip install -r requirements.txt
export DATABASE_URL="postgresql://..."
python main2.py
```

## Deploy
Push su `main` → Render fa il deploy automatico.

Vedi `INSTRUZIONI-DEPLOY.md` per la guida passo-passo.
