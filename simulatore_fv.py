"""
Simulatore fotovoltaico — energelia.it

Modulo indipendente. Non tocca main2.py se non per la registrazione:

    from simulatore_fv import simulatore_bp, init_simulatore_db
    app.register_blueprint(simulatore_bp)
    init_simulatore_db()

(la seconda riga va messa subito dopo l'attuale init_db(), la prima subito
dopo init_crm(app))

Dipendenze nuove da aggiungere a requirements.txt:
    anthropic
    pypdf
    requests        (quasi certamente già presente per altri usi)

Variabili d'ambiente da impostare su Render:
    ANTHROPIC_API_KEY   -> obbligatoria, per l'estrazione dati dalla bolletta (Claude Haiku)
    ALGOLIA_APP_ID      -> opzionale, default LHI8XKBFMN (stesso App ID di ItalBandi)
    ALGOLIA_SEARCH_KEY  -> opzionale ma consigliata, chiave di SOLA RICERCA Algolia
                           (quella di ItalBandi va bene: f55131344ae840ea7f27c6dcb0782654 è
                           già impostata come default qui sotto, ma è meglio spostarla in env)
    ALGOLIA_INDEX       -> opzionale, default ceu_searchable_posts

NON VERIFICATO — da controllare con un caso reale prima di fidarsi ciecamente:
- il rapporto kWp / potenza impegnata usato come tetto (RAPPORTO_MAX_KWP_SU_POTENZA_IMPEGNATA)
- i coefficienti di producibilità specifica per macro-area (PRODUCIBILITA_KWH_KWP)
- il prezzo di ritiro dedicato usato per stimare il ricavo sull'energia immessa
- le curve di producibilità mensile (stime indicative, non dati PVGIS puntuali sul sito)
- il nome esatto dell'attributo Algolia per un filtro geografico stretto (qui la
  regione è usata come testo di ricerca libero, non come facetFilter dedicato,
  perché non ho la conferma dello schema esatto dell'indice ceu_searchable_posts
  su questo campo)

AGGIORNAMENTO 18/09/2026 (Alberto): Energelia non ha clienti privati/residenziali,
solo aziende (Microbusiness). Di conseguenza:
- la vecchia quota di autoconsumo fissa al 35% (pensata per un profilo di consumo
  domestico serale) è stata alzata al 55%, come già fatto nell'Offertatore FV
  desktop per lo stesso motivo: un'azienda consuma tipicamente nelle ore diurne,
  proprio quando il fotovoltaico produce.
- soprattutto, la quota fissa resta ora solo un FALLBACK: il metodo di
  riferimento è calcola_vantaggi_mensili, che confronta mese per mese la
  produzione stimata con lo storico di consumo reale (da bolletta, o costruito
  distribuendo il consumo annuo sui 12 mesi se lo storico manca) — stesso
  principio e stesse curve di producibilità già validate nell'Offertatore FV.
"""

import os
import json
import requests
from flask import Blueprint, render_template, request, jsonify

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader

import anthropic

simulatore_bp = Blueprint('simulatore_fv', __name__)

# ==================== CONFIG ====================

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
HAIKU_MODEL = os.environ.get('SIMULATORE_FV_MODEL', 'claude-haiku-4-5-20251001')

ALGOLIA_APP_ID = os.environ.get('ALGOLIA_APP_ID', 'LHI8XKBFMN')
ALGOLIA_SEARCH_KEY = os.environ.get('ALGOLIA_SEARCH_KEY', 'f55131344ae840ea7f27c6dcb0782654')
ALGOLIA_INDEX = os.environ.get('ALGOLIA_INDEX', 'ceu_searchable_posts')

VALID_BANDO_TAG = 'simulatore_fv'

# Producibilità specifica media (kWh/kWp/anno) in condizioni ottimali (sud, 30°),
# valori indicativi PVGIS/ENEA per macro-area. Grossolano per costruzione.
PRODUCIBILITA_KWH_KWP = {
    'nord': 1200,
    'centro': 1325,
    'sud': 1450,
}

PROVINCE_NORD = {'AO', 'TO', 'VC', 'NO', 'CN', 'AT', 'AL', 'BI', 'VB', 'SP', 'GE', 'IM', 'SV',
                  'VA', 'CO', 'SO', 'MI', 'BG', 'BS', 'PV', 'CR', 'MN', 'LC', 'LO', 'MB',
                  'BZ', 'TN', 'VR', 'VI', 'BL', 'TV', 'VE', 'PD', 'RO', 'UD', 'GO', 'TS', 'PN',
                  'PC', 'PR', 'RE', 'MO', 'BO', 'FE', 'RA', 'FC', 'RN'}
PROVINCE_CENTRO = {'MS', 'LU', 'PT', 'FI', 'LI', 'PI', 'AR', 'SI', 'GR', 'PO', 'PG', 'TR',
                    'PU', 'AN', 'MC', 'FM', 'AP', 'VT', 'RI', 'RM', 'LT', 'FR', 'PE', 'TE', 'CH', 'AQ'}
PROVINCE_SUD = {'CB', 'IS', 'CE', 'BN', 'AV', 'NA', 'SA', 'FG', 'BT', 'BA', 'TA', 'BR', 'LE',
                 'PZ', 'MT', 'CS', 'CZ', 'KR', 'VV', 'RC', 'TP', 'PA', 'ME', 'AG', 'CL', 'EN',
                 'CT', 'RG', 'SR', 'SS', 'NU', 'CA', 'OR', 'SU'}

NOMI_REGIONE_PER_SIGLA = {
    'GE': 'Liguria', 'SP': 'Liguria', 'SV': 'Liguria', 'IM': 'Liguria',
    'MI': 'Lombardia', 'BG': 'Lombardia', 'BS': 'Lombardia', 'CO': 'Lombardia',
    'VA': 'Lombardia', 'PV': 'Lombardia', 'CR': 'Lombardia', 'MN': 'Lombardia',
    'TO': 'Piemonte', 'CN': 'Piemonte', 'AL': 'Piemonte', 'NO': 'Piemonte', 'VC': 'Piemonte',
    'RM': 'Lazio', 'LT': 'Lazio', 'FR': 'Lazio', 'VT': 'Lazio', 'RI': 'Lazio',
    'FI': 'Toscana', 'PI': 'Toscana', 'LU': 'Toscana', 'SI': 'Toscana', 'AR': 'Toscana',
    'BO': 'Emilia-Romagna', 'MO': 'Emilia-Romagna', 'PR': 'Emilia-Romagna', 'RE': 'Emilia-Romagna',
    'NA': 'Campania', 'SA': 'Campania', 'CE': 'Campania', 'AV': 'Campania', 'BN': 'Campania',
    'BA': 'Puglia', 'TA': 'Puglia', 'LE': 'Puglia', 'FG': 'Puglia', 'BR': 'Puglia',
    'PA': 'Sicilia', 'CT': 'Sicilia', 'ME': 'Sicilia', 'SR': 'Sicilia', 'TP': 'Sicilia',
    'CA': 'Sardegna', 'SS': 'Sardegna', 'NU': 'Sardegna', 'OR': 'Sardegna',
    'VE': 'Veneto', 'VR': 'Veneto', 'PD': 'Veneto', 'VI': 'Veneto', 'TV': 'Veneto',
    'GE_TODO': None,
}

# Rapporto massimo kWp / potenza impegnata: tetto grossolano per non proporre
# impianti spropositati rispetto al punto di prelievo. Da tarare con Alberto.
RAPPORTO_MAX_KWP_SU_POTENZA_IMPEGNATA = 1.3

# Quota di autoconsumo "senza batteria" usata solo come FALLBACK quando manca
# uno storico di consumo mensile da cui calcolare il vantaggio mese per mese
# (vedi calcola_vantaggi_mensili, il metodo di riferimento). Alzata dal 35%
# al 55%: Energelia non ha clienti privati/residenziali (consumo serale), solo
# aziende che consumano tipicamente nelle ore diurne, proprio quando il
# fotovoltaico produce — lo stesso motivo per cui l'Offertatore FV desktop usa
# 55% per il Microbusiness.
QUOTA_AUTOCONSUMO_SENZA_BATTERIA = 0.55
QUOTA_AUTOCONSUMO_CON_BATTERIA = 0.65

# Prezzo di ritiro dedicato stimato (€/kWh) applicato all'energia immessa in
# rete. Il GSE paga il maggiore tra Prezzo Zonale Orario (PZO, media 2026
# indicativamente ~0,12-0,13 €/kWh) e Prezzo Minimo Garantito (PMG 2026 per
# fotovoltaico: 0,0475 €/kWh, fino a 1.500.000 kWh/anno). Allineato a 0,10
# €/kWh, lo stesso valore usato nell'Offertatore FV desktop (era 0,11 qui,
# discrepanza minore senza una ragione specifica).
PREZZO_RITIRO_DEDICATO_STIMATO = 0.10

# Testi informativi statici sui meccanismi che determinano il vantaggio annuo,
# mostrati in chiaro nella pagina risultati. Aggiornare se cambia la normativa
# (fonti: pagine GSE Ritiro Dedicato, delibera ARERA 78/2025/R/efr su chiusura
# Scambio sul Posto ai nuovi impianti, guide fiscali 2026 su detrazioni FV).
INFO_NORMATIVA = {
    'autoconsumo': {
        'titolo': 'Risparmio da autoconsumo',
        'testo': ("L'energia che l'impianto produce e che usi subito (o quasi subito) in casa o "
                  "in azienda non la paghi più al fornitore: il risparmio si calcola valorizzando "
                  "quell'energia al prezzo medio che oggi paghi in bolletta."),
    },
    'ritiro_dedicato': {
        'titolo': 'Ritiro Dedicato (GSE)',
        'testo': ("L'energia prodotta e non autoconsumata viene immessa in rete e venduta al GSE "
                  "tramite il servizio di Ritiro Dedicato. Il GSE paga il maggiore tra il Prezzo "
                  "Zonale Orario (il prezzo di mercato dell'energia nella tua zona, variabile "
                  "nel tempo) e un Prezzo Minimo Garantito fissato ogni anno, così da tutelare il "
                  "produttore anche quando i prezzi di mercato scendono. Dal 2025 lo Scambio sul "
                  "Posto non è più attivabile per i nuovi impianti: per chi installa oggi il "
                  "meccanismo di riferimento è il Ritiro Dedicato."),
    },
    'vantaggi_fiscali': {
        'titolo': 'Ulteriori vantaggi fiscali (non inclusi nel numero sopra)',
        'testo': ("A seconda della tua situazione possono aggiungersi: detrazione IRPEF 50% "
                  "sull'abitazione principale per impianti fino a 20 kW (ripartita in 10 rate "
                  "annuali), detrazione 36% per le altre unità immobiliari, IVA agevolata al 10% "
                  "su acquisto e installazione (4% su nuove costruzioni), e per le imprese il "
                  "Conto Termico 3.0 come misura di accompagnamento. Non li includiamo nella "
                  "stima del vantaggio annuo perché dipendono dalla tua situazione specifica: "
                  "se rientri tra i possibili beneficiari te ne parliamo in fase di valutazione."),
    },
}

# Prezzo medio bolletta di fallback (€/kWh) se non lo ricaviamo dai dati.
PREZZO_MEDIO_FALLBACK = 0.25


def get_db_connection():
    # Import ritardato apposta: così questo modulo si carica ed espone
    # /api/simulatore-fv/analizza anche in un ambiente senza psycopg2/Postgres
    # (es. il pacchetto demo per test locale), e serve psycopg2 solo quando
    # davvero si arriva a salvare un lead.
    import psycopg2
    return psycopg2.connect(os.environ.get('DATABASE_URL'))


def init_simulatore_db():
    """Crea la tabella simulazioni_fv se non esiste. Non tocca la tabella leads esistente."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS simulazioni_fv (
                id SERIAL PRIMARY KEY,
                lead_id INTEGER REFERENCES leads(id),
                indirizzo VARCHAR(255),
                provincia VARCHAR(10),
                consumo_annuo_kwh NUMERIC,
                spesa_annua_eur NUMERIC,
                potenza_impegnata_kw NUMERIC,
                kwp_stimato NUMERIC,
                produzione_annua_kwh NUMERIC,
                risparmio_annuo_eur NUMERIC,
                fonte VARCHAR(20),
                dati_bolletta JSONB,
                bandi_trovati JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Errore init_simulatore_db: {e}")


# ==================== ESTRAZIONE DATI BOLLETTA ====================

ESTRAZIONE_PROMPT = """Sei un assistente che legge bollette elettriche italiane di qualsiasi fornitore
(Enel, Axpo, Iren, A2A, Edison, Sorgenia, ecc.) e ne estrae i dati in JSON.

Testo della bolletta:
---
{testo}
---

Restituisci SOLO un oggetto JSON (nessun testo prima o dopo, nessun blocco
markdown) con questi campi, usa null se un dato non è presente nel testo:
{{
  "consumo_annuo_kwh": <numero, consumo annuo totale in kWh, somma F1+F2+F3 se diviso in fasce>,
  "spesa_annua_eur": <numero, spesa annua totale in euro se presente, altrimenti spesa della bolletta corrente>,
  "potenza_impegnata_kw": <numero, potenza impegnata o contrattualmente disponibile in kW>,
  "potenza_massima_prelevata_kw": <numero, il valore più alto tra i picchi mensili di potenza prelevata se presenti>,
  "indirizzo_fornitura": <stringa, indirizzo completo del punto di fornitura>,
  "provincia": <sigla provincia a 2 lettere dedotta dall'indirizzo, es. GE, MI>,
  "tipologia_cliente": <"domestico" oppure "altri usi/business", dedotto dal testo>,
  "prezzo_medio_kwh_eur": <numero, prezzo medio euro/kWh se calcolabile>,
  "mese_bolletta": <stringa "MM/AAAA" del periodo fatturato dalla bolletta corrente, es. "06/2026">,
  "consumo_mese_kwh": <numero, consumo del solo mese fatturato dalla bolletta corrente (non l'annuo)>,
  "prezzo_energia_kwh_eur": <numero, SOLO la componente "spesa per vendita energia elettrica"/materia prima al kWh, esclusi rete, accise, IVA>,
  "prezzo_rete_kwh_eur": <numero, SOLO la componente "spesa per la rete e oneri generali di sistema" al kWh, esclusa l'energia>,
  "accisa_kwh_eur": <numero, aliquota dell'imposta erariale di consumo (accisa) al kWh, se riportata esplicitamente>,
  "aliquota_iva_pct": <numero, aliquota IVA applicata in bolletta, es. 22 o 10>,
  "storico_consumo_mensile": [<lista di oggetti {{"mese": "MM/AAAA", "kwh": numero}} per ogni mese storico
      riportato in bolletta (tabella "consumi ultimi N mesi" o simile), il più completo possibile;
      lista vuota [] se la bolletta non riporta uno storico mensile>]
}}
"""


def estrai_dati_bolletta(testo_pdf):
    """Chiama Claude Haiku per estrarre i dati strutturati dal testo della bolletta.
    Ritorna un dict oppure solleva ValueError se l'estrazione fallisce."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY non configurata sul server")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=800,
        messages=[{
            "role": "user",
            "content": ESTRAZIONE_PROMPT.format(testo=testo_pdf[:12000])
        }]
    )
    raw = message.content[0].text.strip()
    # Il modello a volte racchiude il JSON in ```json ... ``` nonostante l'istruzione:
    # lo ripuliamo prima di fare il parse.
    if raw.startswith('```'):
        raw = raw.strip('`')
        if raw.lower().startswith('json'):
            raw = raw[4:]
    try:
        dati = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Risposta del modello non in JSON valido: {e}")
    return dati


def testo_da_pdf(file_storage):
    """Estrae il testo da un PDF caricato.
    LIMITE NOTO: nessun OCR in questa versione. Se il PDF è una scansione
    immagine senza testo incorporato, torna una stringa vuota o quasi, e la
    route restituisce un errore chiedendo il PDF originale o l'inserimento manuale."""
    reader = PdfReader(file_storage)
    parti = []
    for page in reader.pages:
        try:
            parti.append(page.extract_text() or '')
        except Exception:
            continue
    return "\n".join(parti).strip()


# ==================== DIMENSIONAMENTO E VANTAGGI ORDINARI ====================

def macro_area(provincia):
    if not provincia:
        return 'centro'  # fallback neutro se non riusciamo a dedurre la provincia
    p = provincia.strip().upper()
    if p in PROVINCE_NORD:
        return 'nord'
    if p in PROVINCE_SUD:
        return 'sud'
    return 'centro'


def dimensiona_impianto(consumo_annuo_kwh, potenza_impegnata_kw, provincia):
    """Dimensionamento grossolano: kWp = consumo annuo / producibilità specifica
    di zona, con un tetto dato dalla potenza impegnata in bolletta."""
    area = macro_area(provincia)
    producibilita_specifica = PRODUCIBILITA_KWH_KWP[area]

    kwp_da_consumo = round(consumo_annuo_kwh / producibilita_specifica, 1) if consumo_annuo_kwh else 0

    kwp_tetto = None
    if potenza_impegnata_kw:
        kwp_tetto = round(potenza_impegnata_kw * RAPPORTO_MAX_KWP_SU_POTENZA_IMPEGNATA, 1)

    kwp_proposto = kwp_da_consumo
    limitato_da_potenza = False
    if kwp_tetto and kwp_da_consumo > kwp_tetto:
        kwp_proposto = kwp_tetto
        limitato_da_potenza = True

    produzione_annua_kwh = round(kwp_proposto * producibilita_specifica)

    return {
        'macro_area': area,
        'producibilita_specifica_kwh_kwp': producibilita_specifica,
        'kwp_da_consumo': kwp_da_consumo,
        'kwp_tetto_potenza_impegnata': kwp_tetto,
        'kwp_proposto': kwp_proposto,
        'limitato_da_potenza_impegnata': limitato_da_potenza,
        'produzione_annua_kwh_stimata': produzione_annua_kwh,
    }


def calcola_vantaggi_ordinari(produzione_annua_kwh, prezzo_medio_kwh_eur):
    """Metodo VECCHIO, a quota fissa annua: usato ora solo come ultima
    risorsa quando manca perfino il consumo annuo per costruire uno storico
    mensile (vedi calcola_vantaggi_mensili, il metodo di riferimento)."""
    prezzo = prezzo_medio_kwh_eur or PREZZO_MEDIO_FALLBACK

    risultati = {}
    for label, quota in (('senza_batteria', QUOTA_AUTOCONSUMO_SENZA_BATTERIA),
                          ('con_batteria', QUOTA_AUTOCONSUMO_CON_BATTERIA)):
        energia_autoconsumata = produzione_annua_kwh * quota
        energia_immessa = produzione_annua_kwh * (1 - quota)
        risparmio_autoconsumo = energia_autoconsumata * prezzo
        ricavo_ritiro_dedicato = energia_immessa * PREZZO_RITIRO_DEDICATO_STIMATO
        risultati[label] = {
            'quota_autoconsumo': quota,
            'risparmio_autoconsumo_eur': round(risparmio_autoconsumo),
            'ricavo_ritiro_dedicato_eur': round(ricavo_ritiro_dedicato),
            'vantaggio_annuo_totale_eur': round(risparmio_autoconsumo + ricavo_ritiro_dedicato),
            'metodo': 'quota_fissa',
        }
    return risultati


# ---------------------------------------------------------------------------
# Metodo di riferimento: calcolo mese per mese sul consumo reale da bolletta
#
# Stessa logica, stesse curve e stesse costanti già validate nell'Offertatore
# FV desktop (offerta_fv.py) il 18/09/2026: un impianto ben dimensionato deve
# fare in modo che, quando c'è sole, tutto quello che produce venga
# autoconsumato. Invece di una quota fissa di autoconsumo uguale tutto l'anno,
# si confronta mese per mese la produzione stimata (curva di producibilità
# stagionale) con il consumo reale di quel mese (storico da bolletta, o
# costruito se manca): quello che l'impianto produce e che nel mese resta
# sotto il consumo viene autoconsumato, quello che eccede viene ceduto col
# Ritiro Dedicato.
# Approssimazione nota: si confrontano i totali mensili, non i profili orari
# infragiornalieri, quindi si assume che produzione e consumo dello stesso
# mese si sovrappongano nel tempo — ragionevole per un'azienda che consuma di
# giorno (il caso di tutti i clienti Energelia, che non ha clienti privati).
# ---------------------------------------------------------------------------

# Curve di producibilità mensile (quota della produzione annua per mese),
# stima indicativa per un tetto ben orientato: il Nord ha un'escursione
# stagionale più marcata (inverni più bui) di centro/sud. Sono percentuali
# indicative, non dati PVGIS puntuali sul sito specifico: da affinare se in
# futuro si vuole più precisione.
CURVA_PRODUCIBILITA_MENSILE = {
    'nord':   {1: .045, 2: .060, 3: .090, 4: .105, 5: .120, 6: .125,
               7: .130, 8: .115, 9: .090, 10: .065, 11: .040, 12: .035},
    'centro': {1: .055, 2: .065, 3: .085, 4: .095, 5: .110, 6: .115,
               7: .120, 8: .110, 9: .090, 10: .070, 11: .050, 12: .045},
    'sud':    {1: .060, 2: .070, 3: .085, 4: .090, 5: .105, 6: .110,
               7: .115, 8: .105, 9: .090, 10: .075, 11: .055, 12: .050},
}

# Quota dell'eccedenza mensile che una batteria di taglia tipica riesce a
# spostare su autoconsumo serale invece di cederla in rete: stima di primo
# taglio, non calcolata su una capacità di accumulo specifica.
BATTERIA_QUOTA_ECCEDENZA_RECUPERATA = 0.70

# Aliquota IVA standard per utenze "altri usi"/business e accisa media
# stimata quando la bolletta non riporta il dettaglio: usate solo come
# fallback in calcola_prezzo_evitato_kwh.
ALIQUOTA_IVA_ENERGIA_BUSINESS = 0.22
ACCISA_EUR_KWH_STIMATA = 0.0125


def _curva_normalizzata(macro_area_scelta):
    curva = CURVA_PRODUCIBILITA_MENSILE.get(macro_area_scelta, CURVA_PRODUCIBILITA_MENSILE['centro'])
    totale = sum(curva.values())
    return {mese: quota / totale for mese, quota in curva.items()}


def calcola_prezzo_evitato_kwh(prezzo_energia_kwh_eur=None, prezzo_rete_kwh_eur=None,
                               accisa_kwh_eur=None, aliquota_iva=None,
                               prezzo_medio_kwh_eur=None):
    """Prezzo pieno risparmiato per ogni kWh autoconsumato (non prelevato
    dalla rete): energia + rete/oneri + accisa, IVA inclusa. Se non abbiamo
    il dettaglio della bolletta usiamo il prezzo medio inserito a mano come
    approssimazione (probabilmente per difetto, perché di solito non include
    accisa e IVA)."""
    if prezzo_energia_kwh_eur is not None or prezzo_rete_kwh_eur is not None:
        ante_iva = (prezzo_energia_kwh_eur or 0) + (prezzo_rete_kwh_eur or 0) + \
                   (accisa_kwh_eur if accisa_kwh_eur is not None else ACCISA_EUR_KWH_STIMATA)
        return ante_iva * (1 + (aliquota_iva if aliquota_iva is not None else ALIQUOTA_IVA_ENERGIA_BUSINESS))
    return prezzo_medio_kwh_eur or PREZZO_MEDIO_FALLBACK


def costruisci_storico_consumo_mensile(consumo_annuo_kwh, storico_bolletta=None):
    """Ritorna un dizionario {1..12: kWh} con il consumo mese per mese.

    Se la bolletta fornisce uno storico (lista di {'mese': 'MM/AAAA' o
    'MM/AA', 'kwh': numero}) lo usiamo, mappando ogni voce sul mese di
    calendario (1-12) e tenendo, in caso di doppioni sullo stesso mese, la
    voce più recente. Se lo storico manca, lo ARERA impone comunque che sia
    in bolletta, ma non tutti i fornitori lo mettono con lo stesso dettaglio:
    in quel caso lo costruiamo noi, distribuendo il consumo annuo in parti
    uguali sui 12 mesi (fallback grossolano, meglio di niente)."""
    storico = {}
    if storico_bolletta:
        for voce in storico_bolletta:
            mese_raw = str(voce.get('mese', '')).strip()
            kwh = voce.get('kwh')
            if not mese_raw or kwh is None:
                continue
            try:
                mese_num = int(mese_raw.split('/')[0])
            except (ValueError, IndexError):
                continue
            if 1 <= mese_num <= 12:
                storico[mese_num] = kwh  # l'ultima voce letta per quel mese vince
    if len(storico) >= 12:
        return {m: storico[m] for m in range(1, 13)}
    if not consumo_annuo_kwh:
        return {m: 0 for m in range(1, 13)}
    consumo_mensile_medio = consumo_annuo_kwh / 12
    return {m: consumo_mensile_medio for m in range(1, 13)}


def calcola_vantaggi_mensili(produzione_annua_kwh, macro_area_scelta, storico_consumo_mensile,
                             prezzo_evitato_kwh_eur, fonte_storico='stimato',
                             prezzo_ritiro_dedicato=None):
    """Metodo di riferimento per il vantaggio economico: confronta mese per
    mese produzione stimata e consumo reale (o stimato) invece di applicare
    una quota di autoconsumo fissa uguale tutto l'anno. Ritorna lo stesso
    formato di calcola_vantaggi_ordinari (chiavi senza_batteria/con_batteria)
    così il resto del programma (route /analizza, salvataggio lead) funziona
    senza modifiche."""
    prezzo_ritiro_dedicato = prezzo_ritiro_dedicato or PREZZO_RITIRO_DEDICATO_STIMATO
    curva = _curva_normalizzata(macro_area_scelta)
    risultati = {}
    for label, quota_recupero_batteria in (('senza_batteria', 0.0),
                                           ('con_batteria', BATTERIA_QUOTA_ECCEDENZA_RECUPERATA)):
        autoconsumo_totale = 0.0
        eccedenza_totale = 0.0
        for mese in range(1, 13):
            produzione_mese = produzione_annua_kwh * curva.get(mese, 0)
            consumo_mese = storico_consumo_mensile.get(mese, 0) or 0
            autoconsumo_diretto = min(produzione_mese, consumo_mese)
            eccedenza_mese = max(produzione_mese - consumo_mese, 0)
            recuperata_da_batteria = eccedenza_mese * quota_recupero_batteria
            autoconsumo_totale += autoconsumo_diretto + recuperata_da_batteria
            eccedenza_totale += eccedenza_mese - recuperata_da_batteria
        risparmio_autoconsumo = autoconsumo_totale * prezzo_evitato_kwh_eur
        ricavo_ritiro_dedicato = eccedenza_totale * prezzo_ritiro_dedicato
        risultati[label] = {
            'quota_autoconsumo': (round(autoconsumo_totale / produzione_annua_kwh, 3)
                                  if produzione_annua_kwh else 0),
            'risparmio_autoconsumo_eur': round(risparmio_autoconsumo),
            'ricavo_ritiro_dedicato_eur': round(ricavo_ritiro_dedicato),
            'vantaggio_annuo_totale_eur': round(risparmio_autoconsumo + ricavo_ritiro_dedicato),
            'metodo': 'mensile',
            'fonte_storico_consumo': fonte_storico,
        }
    return risultati


# ==================== BANDI STRAORDINARI (ITALBANDI / ALGOLIA) ====================

def cerca_bandi_correlati(provincia):
    """Interroga l'indice Algolia di ItalBandi cercando bandi aperti o di
    prossima apertura in tema fotovoltaico/energia, pertinenti alla regione
    dedotta dalla provincia dell'indirizzo di fornitura.

    Vedi nota in cima al file: il filtro geografico qui è testo libero, non
    facetFilters, perché non ho la conferma dell'attributo esatto sull'indice."""
    if not ALGOLIA_SEARCH_KEY:
        return []

    regione = NOMI_REGIONE_PER_SIGLA.get((provincia or '').strip().upper()) or ''
    query_testo = "fotovoltaico energia rinnovabile"
    if regione:
        query_testo += f" {regione}"

    url = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX}/query"
    headers = {
        'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'Content-Type': 'application/json',
    }
    payload = {'query': query_testo, 'hitsPerPage': 5}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=8)
        resp.raise_for_status()
        hits = resp.json().get('hits', [])
    except Exception as e:
        print(f"Errore ricerca Algolia bandi: {e}")
        return []

    bandi = []
    for hit in hits:
        scadenza_testo = hit.get('scadenza_testo', '')
        if scadenza_testo not in ('Bandi aperti', 'Bandi prossima apertura'):
            continue
        bandi.append({
            'titolo': hit.get('title') or hit.get('post_title', ''),
            'scadenza_testo': scadenza_testo,
            'url': hit.get('permalink') or hit.get('url', ''),
        })
    return bandi[:3]


# ==================== ROUTES ====================

def _to_float(value):
    try:
        return float(str(value).replace(',', '.')) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


@simulatore_bp.route('/simulatore-fotovoltaico')
def pagina_simulatore():
    return render_template('life-insurance-website-template/simulatore-fotovoltaico.html')


@simulatore_bp.route('/api/simulatore-fv/analizza', methods=['POST'])
def analizza():
    """Riceve o un PDF di bolletta (campo 'bolletta') o dati manuali via form,
    esegue estrazione + dimensionamento + ricerca bandi, e ritorna il risultato
    in JSON. Non salva ancora il lead: quello avviene su /api/simulatore-fv/lead
    quando l'utente lascia i contatti per vedere il risultato completo."""
    fonte = 'manuale'
    dati_bolletta = {}

    file_bolletta = request.files.get('bolletta')
    if file_bolletta and file_bolletta.filename:
        fonte = 'bolletta'
        try:
            testo = testo_da_pdf(file_bolletta)
        except Exception as e:
            return jsonify({'success': False, 'error': f'PDF non leggibile: {e}'}), 400

        if len(testo) < 200:
            return jsonify({
                'success': False,
                'error': ("Non riesco a leggere il testo di questo PDF (probabilmente è una "
                          "scansione immagine). Prova a caricare il PDF originale scaricato dal "
                          "sito del fornitore, oppure usa l'inserimento manuale dei dati.")
            }), 422

        try:
            dati_bolletta = estrai_dati_bolletta(testo)
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 502
    else:
        form = request.form
        dati_bolletta = {
            'consumo_annuo_kwh': _to_float(form.get('consumo_annuo_kwh')),
            'spesa_annua_eur': _to_float(form.get('spesa_annua_eur')),
            'potenza_impegnata_kw': _to_float(form.get('potenza_impegnata_kw')),
            'indirizzo_fornitura': form.get('indirizzo_fornitura', ''),
            'provincia': (form.get('provincia') or '').strip().upper(),
            'tipologia_cliente': form.get('tipologia_cliente', ''),
            'prezzo_medio_kwh_eur': _to_float(form.get('prezzo_medio_kwh_eur')),
        }

    consumo = dati_bolletta.get('consumo_annuo_kwh') or 0
    if not consumo:
        return jsonify({'success': False, 'error': 'Non è stato possibile determinare il consumo annuo in kWh'}), 422

    potenza_impegnata = (dati_bolletta.get('potenza_impegnata_kw') or
                          dati_bolletta.get('potenza_massima_prelevata_kw') or 0)
    provincia = dati_bolletta.get('provincia') or ''

    dimensionamento = dimensiona_impianto(consumo, potenza_impegnata, provincia)

    # Metodo di riferimento: mese per mese sullo storico di consumo (reale se
    # la bolletta lo riporta, altrimenti costruito distribuendo il consumo
    # annuo sui 12 mesi). Il prezzo evitato usa il dettaglio energia/rete/
    # accisa/IVA della bolletta quando disponibile, altrimenti il prezzo
    # medio inserito/estratto.
    storico_bolletta = dati_bolletta.get('storico_consumo_mensile') or []
    fonte_storico = 'bolletta' if len(storico_bolletta) >= 12 else 'stimato'
    storico_mensile = costruisci_storico_consumo_mensile(consumo, storico_bolletta)
    prezzo_evitato = calcola_prezzo_evitato_kwh(
        prezzo_energia_kwh_eur=dati_bolletta.get('prezzo_energia_kwh_eur'),
        prezzo_rete_kwh_eur=dati_bolletta.get('prezzo_rete_kwh_eur'),
        accisa_kwh_eur=dati_bolletta.get('accisa_kwh_eur'),
        aliquota_iva=(dati_bolletta['aliquota_iva_pct'] / 100) if dati_bolletta.get('aliquota_iva_pct') else None,
        prezzo_medio_kwh_eur=dati_bolletta.get('prezzo_medio_kwh_eur'))
    vantaggi = calcola_vantaggi_mensili(
        dimensionamento['produzione_annua_kwh_stimata'], dimensionamento['macro_area'],
        storico_mensile, prezzo_evitato, fonte_storico=fonte_storico)

    bandi = cerca_bandi_correlati(provincia)

    return jsonify({
        'success': True,
        'fonte': fonte,
        'dati_bolletta': dati_bolletta,
        'dimensionamento': dimensionamento,
        'vantaggi_ordinari': vantaggi,
        'bandi_correlati': bandi,
        'info_normativa': INFO_NORMATIVA,
    })


@simulatore_bp.route('/api/simulatore-fv/lead', methods=['POST'])
def salva_lead_simulatore():
    """Salva il contatto lasciato dall'utente dopo aver visto la simulazione,
    riusando la tabella leads esistente (bando='simulatore_fv') e aggiungendo
    il dettaglio della simulazione in simulazioni_fv, collegata via lead_id."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    simulazione = data.get('simulazione') or {}

    if not email or '@' not in email or len(email) > 255:
        return jsonify({'success': False, 'error': 'Email non valida'}), 400

    dati_bolletta = simulazione.get('dati_bolletta', {}) or {}
    dimensionamento = simulazione.get('dimensionamento', {}) or {}
    vantaggio_stimato = (
        simulazione.get('vantaggi_ordinari', {})
        .get('senza_batteria', {})
        .get('vantaggio_annuo_totale_eur')
    )

    lead_id = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO leads (email, phone, bando) VALUES (%s, %s, %s) RETURNING id",
            (email, phone, VALID_BANDO_TAG)
        )
        lead_id = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO simulazioni_fv
                (lead_id, indirizzo, provincia, consumo_annuo_kwh, spesa_annua_eur,
                 potenza_impegnata_kw, kwp_stimato, produzione_annua_kwh,
                 risparmio_annuo_eur, fonte, dati_bolletta, bandi_trovati)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            lead_id,
            dati_bolletta.get('indirizzo_fornitura'),
            dati_bolletta.get('provincia'),
            dati_bolletta.get('consumo_annuo_kwh'),
            dati_bolletta.get('spesa_annua_eur'),
            dati_bolletta.get('potenza_impegnata_kw'),
            dimensionamento.get('kwp_proposto'),
            dimensionamento.get('produzione_annua_kwh_stimata'),
            vantaggio_stimato,
            simulazione.get('fonte'),
            json.dumps(dati_bolletta),
            json.dumps(simulazione.get('bandi_correlati', [])),
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Errore salva_lead_simulatore: {e}")
        return jsonify({'success': False, 'error': f'Errore: {e}'}), 500

    # Notifica email in background, riusando la funzione già definita in main2.py
    # (import ritardato qui dentro per evitare un import circolare con main2.py,
    # che a sua volta importa questo modulo all'avvio).
    try:
        from main2 import notify_new_lead
        kwp = dimensionamento.get('kwp_proposto')
        etichetta = f'Lead — Simulatore fotovoltaico (~{kwp} kWp)' if kwp else 'Lead — Simulatore fotovoltaico'
        notify_new_lead(etichetta, email=email, phone=phone, bando=VALID_BANDO_TAG)
    except Exception as e:
        print(f"Errore notifica lead simulatore: {e}")

    return jsonify({'success': True})
