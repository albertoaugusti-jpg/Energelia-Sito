# Bandi Manager — Energelia

App locale per gestire le card dei bandi in evidenza sulla home di
energelia.it senza dover toccare HTML.

---

## Setup una tantum (lo fai una sola volta)

### 1. Crea la scorciatoia sul desktop

1. Apri **Esplora File** e vai in
   `Documenti\GitHub\Energelia-Sito\bandi-manager\`
2. Clic destro su **`avvia.bat`** → **Mostra altre opzioni** → **Crea collegamento**
3. Trascina il collegamento appena creato sul **Desktop**
4. Rinominalo come vuoi (es. *"Bandi Energelia"*)

### 2. Prima esecuzione

1. Doppio click sull'icona sul desktop
2. Si apre una finestra nera (Prompt dei comandi). Aspetta ~1 minuto: scarica
   Flask e BeautifulSoup nella cartella `.venv` (succede SOLO la prima volta)
3. Dopo che vedi `Apri il browser su: http://127.0.0.1:5005/`, si apre Chrome
   automaticamente sull'interfaccia

> **Se Python non è installato**: il .bat ti mostra il link
> [python.org/downloads](https://www.python.org/downloads/). Scarica, installa
> spuntando "Add Python to PATH", poi riprova.

---

## Uso quotidiano

### Aprire l'app
Doppio click sull'icona del desktop. Il browser si apre sulla **lista bandi**.

### Aggiungere un bando
1. Click su **"Aggiungi nuovo bando"** (in alto a destra)
2. Compila il form (i campi obbligatori sono solo *Titolo breve* e
   *Descrizione breve*)
3. Scegli il comportamento del bottone:
   - **Modal con dettagli** → mostra una finestra con tutti i dati del bando
     (default — questo è quello che usano tutti i bandi recenti)
   - **Download diretto di un PDF report** → carichi un PDF, l'app lo salva
     in `static/reports/` e crea il link diretto
   - **Link a una pagina del sito** → linka a una landing page custom (es.
     `/report-inail`)
4. Scegli **dove inserirlo** (in cima o in fondo al carosello)
5. Click su **"Crea bando"**

### Modificare un bando
Click su **"Modifica"** sulla card. Tutto come sopra.
Lo slug (id interno) NON cambia anche se cambi il titolo.

### Spostare l'ordine
Frecce **su/giù** sulla card.

### Duplicare un bando (utile per crearne uno simile)
Click su **"Duplica"**. Crea una copia con suffisso *"(copia)"* che puoi poi
modificare.

### Eliminare un bando
Click sull'icona cestino. C'è una conferma.

---

## Cosa succede quando salvi

Ogni modifica:
1. **Crea un backup** di `index.html` in `bandi-manager/backups/` con timestamp
2. **Riscrive** la sezione delle card dentro `index.html` (lascia intatto
   tutto il resto del file)
3. **Aggiorna** `static/reports/_reports.json` se hai modificato i PDF report

---

## Dopo aver modificato i bandi: commit + push

L'app modifica il file `index.html` sul tuo PC, ma il sito su
**energelia.it** non si aggiorna automaticamente. Devi:

1. Apri **GitHub Desktop**
2. Vedrai una lista di file modificati. Tipicamente:
   - `templates/life-insurance-website-template/index.html`  ✅ spunta
   - `templates/life-insurance-website-template/static/reports/_reports.json`
     ✅ spunta (se hai aggiunto/modificato PDF)
   - `templates/life-insurance-website-template/static/reports/<slug>.pdf`
     ✅ spunta (se hai caricato un PDF)
3. Scrivi un Summary breve, es. *"Aggiunto bando X"* o *"Aggiornato stato
   bando Y"*
4. **Commit to main** → **Push origin**
5. Aspetta ~2 minuti che Render rideploya
6. Vai su [energelia.it](https://energelia.it) e fai **Ctrl+F5** per forzare
   il refresh

---

## Cosa fa l'app, in dettaglio

- Legge le card bandi da `templates/life-insurance-website-template/index.html`
  tra i marker `<!-- BANDI MANAGER START -->` e `<!-- BANDI MANAGER END -->`
- Mostra un'interfaccia web nel browser per aggiungere/modificare/spostare
- Quando salvi, ri-genera SOLO la sezione tra i marker, lasciando intatto
  tutto il resto del file (`<head>`, sezioni hero/team/percorso/footer ecc.)
- I PDF report vanno in `templates/life-insurance-website-template/static/reports/`
  con nome `<slug>.pdf`
- La mappa slug → filename PDF sta in `static/reports/_reports.json` (gestita
  dall'app)

## Cartelle e file dell'app

```
bandi-manager/
├── app.py             # server Flask
├── parser.py          # legge/scrive le card in index.html
├── templates/         # UI dell'app (lista bandi, form di edit)
├── static/            # CSS dell'app (non del sito Energelia)
├── backups/           # backup automatici di index.html
├── requirements.txt   # dipendenze Python
├── avvia.bat          # script di avvio
├── .venv/             # virtual env (creato al primo avvio, ~30 MB)
├── .installed         # flag: dipendenze installate
└── README.md          # questo file
```

## Note

- L'app è **solo locale**: gira su `127.0.0.1:5005`, accessibile solo dal tuo
  PC. Nessun rischio di sicurezza.
- I file `.venv/`, `.installed` e `backups/` sono già esclusi dal `.gitignore`,
  quindi non vengono pushati.
- Per chiudere l'app: chiudi la finestra nera del Prompt dei comandi, oppure
  premi `Ctrl+C` dentro quella finestra.
- Se l'app non parte e vedi un errore strano: leggi l'errore nella finestra
  nera (di solito ti dice esattamente cosa serve installare).

## Problemi noti

- **Porta 5005 già in uso**: probabilmente hai un'altra istanza aperta.
  Chiudi tutte le finestre nere "Prompt dei comandi" e riprova.
- **"index.html non trovato"**: la cartella `bandi-manager` deve stare
  DENTRO `Energelia-Sito`. Se l'hai spostata altrove, riportala dentro.

## Backup

Ogni salvataggio crea un file in `bandi-manager/backups/index.html.YYYYMMDD_HHMMSS.bak`.
Sono **copie complete** del file `index.html` PRIMA della modifica. Se hai
fatto un casino, puoi ripristinare a mano sostituendo `index.html` con uno
di questi backup.

Periodicamente puoi cancellare i backup vecchi (sono in `bandi-manager/backups/`,
escluso dal git).
