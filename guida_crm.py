"""
guida_crm.py - Testi della guida laterale del CRM Energelia.

Una voce per ogni pagina (la chiave e' il nome del modello in crm.py).
Ogni voce ha:
  serve    : una frase, a cosa serve la pagina
  passi    : cosa si fa, in ordine
  legenda  : (simbolo o parola, significato)
  consiglio: facoltativo, un suggerimento pratico
Per cambiare un testo basta modificarlo qui: il resto del CRM non va toccato.
"""

GUIDA = {
    "dashboard": {
        "titolo": "Dashboard",
        "serve": "Il colpo d'occhio: come va il lavoro oggi e cosa richiede attenzione.",
        "passi": [
            "Guarda i numeri in alto: clienti, pratiche aperte, soldi richiesti e concessi.",
            "La barra Pipeline mostra quante pratiche ci sono in ogni fase: clicca una fase per vederle.",
            "Controlla le Scadenze entro 60 giorni e parti da quelle in rosso.",
            "In fondo trovi i Clienti da ricontattare: chiamali e registra la chiamata nella loro scheda.",
        ],
        "legenda": [
            ("Rosso", "scadenza tra meno di 15 giorni"),
            ("Arancio", "scadenza tra 15 e 60 giorni"),
            ("Da ricontattare", "cliente non sentito da 30 giorni o più"),
            ("Success fee maturata", "percentuale sul concesso delle pratiche andate bene"),
        ],
        "consiglio": "Apri la Dashboard ogni mattina: in un minuto sai cosa fare per primo.",
    },
    "clienti": {
        "titolo": "Clienti",
        "serve": "L'elenco delle aziende che seguiamo.",
        "passi": [
            "Cerca un cliente con i filtri (canale, consulente) e premi Filtra.",
            "Clicca il nome per aprire la sua scheda.",
            "Per aggiungerne uno premi Nuovo cliente.",
            "Hai un elenco in Excel? Usa Importa clienti da file.",
        ],
        "legenda": [
            ("Canale", "da dove è arrivato il cliente (sito, passaparola, scraping...)"),
            ("Pratiche", "quante pratiche ha aperte"),
            ("Ultimo contatto", "l'ultima volta che l'abbiamo sentito"),
        ],
        "consiglio": "Esporta in Excel scarica l'elenco così come lo vedi filtrato.",
    },
    "cliente_form": {
        "titolo": "Scheda cliente da compilare",
        "serve": "Inserisci o correggi i dati di un cliente.",
        "passi": [
            "Se hai la visura camerale, caricala e premi Estrai dalla visura: i dati principali si compilano da soli.",
            "Mancano telefono o email? Premi Cerca online.",
            "Controlla i campi (l'AI può sbagliare) e completa quelli vuoti.",
            "Premi Salva cliente. Finché non salvi, niente viene registrato.",
        ],
        "legenda": [
            ("*", "campo obbligatorio"),
            ("Titolari effettivi", "solo legale rappresentante ed eventuali titolari, non tutti i soci"),
            ("Codice SDI", "il codice per ricevere la fattura elettronica"),
        ],
        "consiglio": "L'AI non sovrascrive mai un campo che hai già scritto tu.",
    },
    "cliente": {
        "titolo": "Scheda cliente",
        "serve": "Tutto su un cliente: dati, pratiche, documenti e contatti avuti.",
        "passi": [
            "In alto i dati: premi Modifica per correggerli.",
            "Registra un'attività ogni volta che lo senti (chiamata, email, riunione): resta nel diario.",
            "Per farti mandare documenti, copia il link in Documenti dal cliente e mandaglielo (o premi Invia via email).",
            "I documenti arrivano come «da smistare»: scegli la pratica di destinazione.",
            "Per un nuovo bando premi Nuova pratica; se è ancora solo un'idea, Avvia trattativa.",
        ],
        "legenda": [
            ("Da smistare", "documento arrivato ma non ancora legato a una pratica"),
            ("Diario", "la cronologia di tutto quello che è successo col cliente"),
            ("Trattativa", "un'opportunità non ancora firmata"),
            ("Pratica", "un lavoro vero su un bando"),
        ],
        "consiglio": "Il link documenti non richiede password: il cliente può usarlo più volte.",
    },
    "pratiche": {
        "titolo": "Pratiche",
        "serve": "Tutte le domande di contributo che stiamo seguendo.",
        "passi": [
            "Filtra per fase o priorità, oppure tieni solo quelle in lavorazione.",
            "Clicca il codice o il bando per aprire la pratica.",
            "Premi Nuova pratica per aprirne una (meglio partire da un bando salvato).",
        ],
        "legenda": [
            ("Fasi", "Analisi, Preventivo inviato, Contratto firmato, Documenti, Presentata, In graduatoria, Ammessa, Respinta, Rendicontazione, Chiusa"),
            ("Pri.", "priorità: Alta, Media, Bassa"),
            ("Rosso / arancio", "scadenza entro 15 / entro 60 giorni"),
            ("Richiesto / Concesso", "quanto abbiamo chiesto / quanto è stato dato"),
        ],
    },
    "pratica_form": {
        "titolo": "Pratica da compilare",
        "serve": "Apri o modifica una pratica.",
        "passi": [
            "Se il bando è già nei Bandi, sceglilo in alto: i dati del bando si compilano da soli.",
            "Scegli il cliente (obbligatorio).",
            "Imposta fase, priorità e prossimo step.",
            "Compila il compenso Energelia e il conto su cui il cliente paga.",
            "Premi Salva pratica.",
        ],
        "legenda": [
            ("Corrispettivo", "compenso fisso"),
            ("Success fee %", "percentuale sul contributo concesso"),
            ("Prossimo step", "la prossima cosa da fare, in poche parole"),
        ],
    },
    "pratica": {
        "titolo": "Pratica",
        "serve": "Il lavoro su un bando per un cliente, dall'inizio alla firma.",
        "passi": [
            "In alto: fase, scadenza, importi. Premi Modifica per aggiornarli.",
            "Documenti della pratica: ogni riga è un documento e fa tre passi, A, B e C.",
            "A (Modulo vuoto): prendi il modulo dal bando, oppure da «Doc ricevuti non assegnati» con la spunta.",
            "B (Compilato): scarica il modulo da A, compilalo sul tuo PC e ricaricalo con Carica compilato.",
            "C (Firmato): manda al cliente il Link firma; quando lo rimanda lo trovi nel Basket verde e lo assegni. Se te lo manda per mail usa Carica diretto.",
            "Registra un'attività per ogni passo importante: resta nel diario della pratica.",
        ],
        "legenda": [
            ("A arancio", "manca il modulo"),
            ("B blu", "il modulo c'è, va compilato e caricato"),
            ("C viola", "compilato fatto, aspettiamo la firma del cliente"),
            ("Completati", "righe con il firmato: finite"),
            ("Basket verde", "firmati arrivati dal cliente, da mettere nella riga giusta"),
            ("Doc ricevuti", "documenti del cliente non ancora messi in una riga"),
        ],
        "consiglio": "Il cestino accanto a un file lo toglie dalla riga ma non lo cancella da Drive.",
    },
    "attivita": {
        "titolo": "Attività",
        "serve": "Il diario di tutti i contatti con i clienti, di tutti i colleghi.",
        "passi": [
            "Filtra per tipo o per collega e premi Filtra.",
            "Per aggiungerne una vai nella scheda del cliente o della pratica.",
        ],
        "legenda": [
            ("Tipi", "Chiamata, Email, Riunione, Documenti, Nota"),
        ],
    },
    "lead": {
        "titolo": "Lead",
        "serve": "I contatti trovati con lo scraping: potenziali clienti ancora da sentire.",
        "passi": [
            "Importa il file dello scraper (xlsx o csv) così com'è: le colonne le riconosce da solo.",
            "Filtra per stato, fonte, regione o provincia.",
            "Se è interessato: Avvia trattativa. Se diventa subito cliente: Converti.",
            "Se non interessa: Scarta (con Ripristina torna tra i nuovi).",
        ],
        "legenda": [
            ("nuovo", "mai contattato"),
            ("contattato", "sentito almeno una volta"),
            ("scartato", "non interessa"),
            ("convertito", "è diventato cliente"),
        ],
        "consiglio": "Esporta CSV scarica solo i lead che vedi con i filtri attivi.",
    },
    "documenti": {
        "titolo": "Documenti",
        "serve": "La scrivania: tutti i file caricati dai clienti, da mettere al posto giusto.",
        "passi": [
            "Guarda i documenti «da smistare» (arrivati dai link dei clienti).",
            "Per ognuno scegli cliente e pratica di destinazione.",
            "Spunta quelli pronti e premi Assegna selezionati.",
            "Notifica collaboratori manda ai colleghi un avviso sui documenti spuntati.",
        ],
        "legenda": [
            ("Da smistare", "non ancora legato a una pratica"),
            ("Assegnato", "già nella sua pratica"),
            ("Scrivania", "il tasto rimette il documento tra quelli da smistare"),
        ],
    },
    "bandi": {
        "titolo": "Bandi",
        "serve": "L'archivio dei bandi che conosciamo, da usare per aprire pratiche.",
        "passi": [
            "Premi Nuovo bando e carica la scheda PDF: l'AI compila i campi.",
            "Clicca un bando per leggerlo per intero.",
            "Crea pratica apre subito una pratica già compilata con i dati del bando.",
        ],
        "legenda": [
            ("Contributo max", "il massimo che si può ottenere"),
            ("Scadenza", "ultimo giorno per presentare la domanda"),
        ],
    },
    "bando_form": {
        "titolo": "Bando da compilare",
        "serve": "Aggiungi o correggi un bando.",
        "passi": [
            "Carica la scheda PDF e premi Estrai dal PDF.",
            "Controlla e correggi i campi: l'AI può sbagliare.",
            "Premi Salva.",
        ],
        "legenda": [
            ("*", "campo obbligatorio"),
            ("Scheda discorsiva", "le parti da leggere: chi partecipa, cosa si finanzia, come si presenta"),
        ],
    },
    "bando": {
        "titolo": "Scheda bando",
        "serve": "Tutto su un bando: regole, documenti ufficiali e guide.",
        "passi": [
            "Leggi la scheda: chi può partecipare, cosa è finanziabile, criticità.",
            "Carica i Documenti ufficiali (moduli, allegati): diventano la colonna A delle pratiche.",
            "Genera la Guida alla compilazione e l'Approfondimento con l'AI.",
            "Premi Crea pratica per un cliente.",
        ],
        "legenda": [
            ("Documenti ufficiali", "i moduli del bando, che poi si importano nelle pratiche"),
            ("Approfondimento", "compare anche in ogni pratica nata da questo bando"),
        ],
    },
    "trattative": {
        "titolo": "Trattative",
        "serve": "Le opportunità commerciali non ancora firmate.",
        "passi": [
            "Premi Nuova trattativa (oppure Avvia trattativa da un lead o da un cliente).",
            "Apri una trattativa per seguirla.",
            "Quando si chiude: Vinta o Persa.",
            "Una persa si può riprendere con Ripesca.",
        ],
        "legenda": [
            ("Aperte", "in corso"),
            ("Vinte", "diventate cliente e pratiche"),
            ("Perse (cestello)", "non andate a buon fine, recuperabili"),
        ],
    },
    "trattativa_form": {
        "titolo": "Nuova trattativa",
        "serve": "Apri una trattativa.",
        "passi": [
            "Scegli un cliente già esistente, oppure scrivi la ragione sociale se è un soggetto nuovo.",
            "Collega uno o più bandi (facoltativo).",
            "Premi Crea trattativa.",
        ],
        "legenda": [
            ("Lead", "per partire da un lead usa Avvia trattativa dalla lista Lead"),
        ],
    },
    "trattativa": {
        "titolo": "Trattativa",
        "serve": "Segui un'opportunità fino al sì o al no.",
        "passi": [
            "Completa i dati: carica la visura e premi Estrai dalla visura.",
            "Collega i bandi: carica la scheda e premi Estrai e collega.",
            "Registra un contatto ogni volta che senti il soggetto.",
            "Segna vinta: nasce il cliente (se non c'era) e una pratica per ogni bando collegato.",
            "Segna persa: va nel cestello, da cui puoi ripescarla.",
        ],
        "legenda": [
            ("Vinta", "crea cliente e pratiche in automatico"),
            ("Ripesca", "apre una trattativa nuova sullo stesso soggetto"),
        ],
    },
    "trattativa_modifica": {
        "titolo": "Modifica trattativa",
        "serve": "Correggi i dati del soggetto della trattativa.",
        "passi": [
            "Modifica i campi che servono.",
            "Premi Salva.",
        ],
        "legenda": [
            ("Dati economici", "servono solo quando la trattativa diventa cliente"),
        ],
    },
    "impostazioni": {
        "titolo": "Impostazioni",
        "serve": "Solo per gli amministratori: utenti, conti, importazioni, esportazioni.",
        "passi": [
            "Utenti: crea l'accesso per un collega.",
            "Conti bancari: i conti su cui i clienti pagano Energelia.",
            "Cambia la tua password.",
            "Importa o esporta clienti, pratiche e lead in Excel.",
        ],
        "legenda": [
            ("Admin", "vede anche questa pagina"),
        ],
    },
}
