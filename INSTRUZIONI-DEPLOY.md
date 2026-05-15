# Guida deploy Energelia su Render — passo passo

Tempo stimato: 30 minuti. Tutto si fa dal browser, niente terminale.

## Cosa fai oggi
Carichi questo progetto su GitHub, lo colleghi a Render, fai partire il sito sul dominio temporaneo `energelia.onrender.com`. Solo quando funziona, sposti il dominio energelia.it.

---

## STEP 1 — Crea account GitHub (se non ce l'hai)

1. Vai su https://github.com/signup
2. Email, password, username (es. `albertoaugusti`)
3. Verifica email

Se ce l'hai già: login su https://github.com

---

## STEP 2 — Crea un repository per il sito

1. In alto a destra su GitHub: clicca il `+` → **New repository**
2. Repository name: `energelia-sito`
3. Lascia **Public** (oppure Private se preferisci, indifferente)
4. **NON** spuntare "Add a README" — lo abbiamo già
5. Clicca **Create repository**

Ti porta a una pagina con istruzioni. Ignorale, useremo l'interfaccia web.

---

## STEP 3 — Carica i file su GitHub

Il modo più semplice senza usare il terminale:

1. Sulla pagina del repository appena creato, clicca **uploading an existing file** (link al centro), oppure il pulsante **Add file → Upload files**
2. **Trascina dentro tutta la cartella `energelia-render`** che ti ho preparato — GitHub carica tutti i file e le sottocartelle
3. In fondo, dove c'è "Commit changes": scrivi `Primo upload` e clicca **Commit changes**
4. Aspetta che finisca l'upload (può volerci qualche minuto perché ci sono ~90 MB)

**Importante**: GitHub ha un limite di 100 file per upload via drag&drop. Se ti dà errore, carica una cartella alla volta:
- Prima `templates/` (la più grossa)
- Poi `static/`
- Poi tutti i file singoli (main2.py, Procfile, requirements.txt, ecc.)

---

## STEP 4 — Crea account Render

1. Vai su https://render.com
2. **Get Started** → registrati con il tuo account GitHub (più semplice)
3. Autorizza Render a vedere i tuoi repository

---

## STEP 5 — Crea il database PostgreSQL

1. Dashboard Render → **New +** (in alto a destra) → **PostgreSQL**
2. Name: `energelia-db`
3. Region: **Frankfurt** (più vicino all'Italia)
4. Plan: **Free** (90 giorni gratis, poi $7/mese)
5. Clicca **Create Database**
6. Aspetta 1-2 minuti che diventi "Available"
7. **Copia** la stringa **Internal Database URL** (formato `postgresql://...`) — ti servirà fra poco

---

## STEP 6 — Crea il web service

1. Dashboard Render → **New +** → **Web Service**
2. Connetti il repository `energelia-sito` (clicca **Connect** accanto al nome)
3. Configura:
   - **Name**: `energelia`
   - **Region**: Frankfurt
   - **Branch**: `main`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --bind 0.0.0.0:$PORT --workers 2 main2:app`
   - **Plan**: **Starter** ($7/mese) — il Free piano va in sleep dopo 15 min di inattività, non adatto per un sito aziendale. Se vuoi testare prima, prendi Free e poi upgrade.
4. Scorri in fondo → **Advanced** → **Add Environment Variable**:
   - `DATABASE_URL` → incolla la stringa che hai copiato allo Step 5
   - `ADMIN_PASSWORD` → `energelia2026` (o cambiala in qualcosa di più sicuro)
5. Clicca **Create Web Service**

Render inizia il build automaticamente. Vai sulla tab **Logs** e guardi: in 3-5 minuti vedrai `Listening on 0.0.0.0:10000` o simile. Significa che è partito.

---

## STEP 7 — Test sul dominio temporaneo

Render ti dà un URL tipo `https://energelia.onrender.com`. 

**Aprilo nel browser**. Devi vedere il sito Energelia che funziona — home, link, immagini, tutto. Prova anche:
- `/contact` o `/finanza` (qualche pagina)
- `/forzasamp` (admin login)

Se funziona qui, è fatta.

---

## STEP 8 — Collega il dominio energelia.it

Solo quando lo step 7 è OK.

### 8a — Su Render
1. Web Service `energelia` → tab **Settings** → scorri a **Custom Domains**
2. **Add Custom Domain** → `energelia.it`
3. Render ti mostra un record da impostare nel DNS. Solitamente:
   - Tipo: `A`
   - Host: `@`
   - Value: un indirizzo IP tipo `216.24.57.x`
   - Oppure ti chiede un record `CNAME` con un valore tipo `xxx.onrender.com`
4. Aggiungi anche `www.energelia.it` come secondo custom domain → ti darà un altro record CNAME

**Annota tutto su un foglio**: tipo, host, valore.

### 8b — Su Register.it
1. Login su https://register.it → Pannello DNS per `energelia.it`
2. **Cancella** il vecchio record A che punta a `34.111.179.208` o `34.36.142.150` (Replit/Google)
3. **Aggiungi** i nuovi record che ti ha dato Render
4. **Salva e pubblica la zona** (questo è il passaggio dove il tuo cambio andò perso prima — assicurati di vedere "zona pubblicata")

### 8c — Attesa propagazione
Da 1 a 24 ore. Di solito 2-4. Verifica da PowerShell sul tuo PC:
```
Resolve-DnsName energelia.it -Server 8.8.8.8
```
Quando risponde con l'IP/CNAME di Render, hai finito.

### 8d — HTTPS
Render genera automaticamente il certificato Let's Encrypt una volta che il DNS punta a lui. Aspetta altri 5-10 minuti e il sito sarà su `https://energelia.it`.

---

## STEP 9 — Elimina il vecchio progetto Replit
Solo dopo aver verificato che energelia.it funziona via Render:
- Su Replit: vai sul vecchio deployment → **Stop deployment**
- Eventualmente cancella il Repl (occhio: irreversibile, fai backup se vuoi)

---

## Manutenzione futura

Quando vuoi modificare il sito:
1. Modifica i file in locale con VS Code (o anche da web su GitHub direttamente)
2. Commit + push su GitHub
3. Render rileva il push e fa il deploy automatico in 2-3 minuti

Fine. Niente più "publish", "republish", file persi, configurazioni misteriose.

---

## Se qualcosa va storto

- **Build fallisce** → guarda i log su Render, copiameli e ti dico cosa cambiare in `requirements.txt`
- **Sito dà errore 500** → guarda **Logs** su Render, l'errore Python è lì in chiaro
- **Domino non funziona dopo 24h** → controlla che Register.it abbia davvero salvato la zona
- **Email/lead non arrivano** → controlla che `DATABASE_URL` sia ben configurata

---

## Costi mensili totali (stima)
- Render Web Service Starter: $7
- Render PostgreSQL Free: $0 (90 giorni), poi $7
- Register.it dominio: già pagato
- **Totale**: ~$7-14/mese
