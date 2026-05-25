import os
import re
import html
import smtplib
import threading
import psycopg2
import feedparser
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, unquote
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, render_template, abort, request, redirect, send_from_directory,jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__,
            template_folder='templates',
            static_folder=os.path.join('templates', 'life-insurance-website-template'),
            static_url_path='/static')

# Riconosce HTTPS correttamente dietro proxy come Replit, Nginx, ecc.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Genera URL con https:// invece di http:// nei template
app.config['PREFERRED_URL_SCHEME'] = 'https'


@app.before_request
def enforce_https_in_production():
    """Forza HTTPS se non siamo in debug e arriva una richiesta HTTP.
    Escludi localhost per non bloccare il health check del deployment."""
    if not request.is_secure and not app.debug:
        # Salta il redirect per health check interni (localhost/127.0.0.1)
        host = request.host.split(':')[0]
        if host in ('localhost', '127.0.0.1', '0.0.0.0'):
            return
        url = request.url.replace("http://", "https://", 1)
        return redirect(url, code=301)


@app.route('/')
def home():
    return render_template('life-insurance-website-template/index.html')


@app.route('/<page>')
def render_page(page):
    """
    Cerca un file <page>.html (case-insensitive) in
    templates/life-insurance-website-template e lo serve.
    """
    tpl_dir = os.path.join(app.template_folder,
                           'life-insurance-website-template')
    target = None

    for fname in os.listdir(tpl_dir):
        if fname.lower() == f"{page.lower()}.html":
            target = fname
            break

    if not target:
        abort(404)

    return render_template(f"life-insurance-website-template/{target}")


# ✅ Favicon servita direttamente alla radice (richiesta automatica dai browser)
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.static_folder, 'img'),
        'favicon.ico',
        mimetype='image/vnd.microsoft.icon'
    )


# ✅ Health check endpoint per servizi di keep-alive (UptimeRobot ecc.)
# Risponde 200 OK con un payload minimo e SENZA Google Analytics:
# così il container Render non va mai in sleep e le statistiche restano pulite.
@app.route('/healthz')
def healthz():
    return ('OK', 200, {'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-store'})


# ✅ Route per servire i file statici in modo trasparente
@app.route('/<path:filename>')
def static_files(filename):
    static_dir = app.static_folder
    file_path = os.path.join(static_dir, filename)
    if os.path.isfile(file_path):
        return send_from_directory(static_dir, filename)
    abort(404)


# ==================== EMAIL NOTIFICATIONS ====================

# Configurazione SMTP via env vars (impostarle su Render).
# Default: SMTP di Gmail. Se SMTP_USER/SMTP_PASS/LEAD_NOTIFY_TO non sono settate,
# l'invio è silenziosamente saltato (il sito funziona comunque, salvataggio DB ok).
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')
LEAD_NOTIFY_TO = os.environ.get('LEAD_NOTIFY_TO', 'a.castagnaro@energelia.it')
LEAD_NOTIFY_FROM_NAME = os.environ.get('LEAD_NOTIFY_FROM_NAME', 'Sito Energelia')


def _send_lead_email(subject, body):
    """Invio reale SMTP (chiamato dentro un thread)."""
    if not (SMTP_USER and SMTP_PASS and LEAD_NOTIFY_TO):
        return
    try:
        msg = MIMEMultipart()
        msg['From'] = f"{LEAD_NOTIFY_FROM_NAME} <{SMTP_USER}>"
        msg['To'] = LEAD_NOTIFY_TO
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    except Exception as e:
        # Niente raise: la mancata notifica non deve far fallire la richiesta utente
        print(f"[notify-email] errore invio: {e}")


def notify_new_lead(source, email='', phone='', bando=''):
    """Avvia in background l'invio della notifica email per un nuovo contatto."""
    when = datetime.now().strftime('%d/%m/%Y %H:%M')
    subject = f"Nuovo contatto su energelia.it — {source}"
    lines = [
        "Nuovo contatto ricevuto dal sito energelia.it",
        "",
        f"Tipo:      {source}",
        f"Data/ora:  {when}",
        f"Email:     {email or '—'}",
        f"Telefono:  {phone or '—'}",
    ]
    if bando:
        lines.append(f"Bando:     {bando}")
    lines.extend([
        "",
        "Pannello admin: https://energelia.it/forzasamp",
        "",
        "— Notifica automatica del sito Energelia",
    ])
    body = "\n".join(lines)

    threading.Thread(
        target=_send_lead_email,
        args=(subject, body),
        daemon=True
    ).start()


def get_db_connection():
    return psycopg2.connect(os.environ.get('DATABASE_URL'))


def init_db():
    """Crea le tabelle se non esistono"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                bando VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS consultations (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Errore init_db: {e}")


init_db()


VALID_BANDI = {'isi_inail', 'parco_agrisolare', 'botteghe_entroterra'}


@app.route('/api/lead', methods=['POST'])
def save_lead():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip()
    phone = data.get('phone', '').strip()
    bando = data.get('bando', '').strip()
    
    if not email or '@' not in email or len(email) > 255:
        return jsonify({'success': False, 'error': 'Email non valida'}), 400
    
    if not bando or bando not in VALID_BANDI:
        return jsonify({'success': False, 'error': 'Bando non valido'}), 400
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                bando VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute(
            "INSERT INTO leads (email, phone, bando) VALUES (%s, %s, %s)",
            (email, phone, bando)
        )
        conn.commit()
        cur.close()
        conn.close()
        # Notifica email in background (non blocca la risposta)
        notify_new_lead('Lead — download report', email=email, phone=phone, bando=bando)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Errore save_lead: {e}")
        return jsonify({'success': False, 'error': f'Errore: {str(e)}'}), 500


@app.route('/api/consultation', methods=['POST'])
def save_consultation():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip()
    phone = data.get('phone', '').strip()
    
    if not email or '@' not in email or len(email) > 255:
        return jsonify({'success': False, 'error': 'Email non valida'}), 400
    
    if not phone or len(phone) < 6 or len(phone) > 50:
        return jsonify({'success': False, 'error': 'Telefono non valido'}), 400
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS consultations (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute(
            "INSERT INTO consultations (email, phone) VALUES (%s, %s)",
            (email, phone)
        )
        conn.commit()
        cur.close()
        conn.close()
        # Notifica email in background (non blocca la risposta)
        notify_new_lead('Richiesta consulenza / Ricerca Bandi', email=email, phone=phone)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Errore save_consultation: {e}")
        return jsonify({'success': False, 'error': f'Errore: {str(e)}'}), 500


@app.route('/scarica-sito')
def scarica_sito():
    # File pesante (~73MB) escluso dal repo Git per restare sotto i limiti GitHub.
    # Se serve riattivarlo: caricare 'energelia-sito.zip' nella root e rimuovere il 404.
    zip_path = os.path.join(os.path.abspath('.'), 'energelia-sito.zip')
    if not os.path.isfile(zip_path):
        abort(404)
    return send_from_directory(os.path.abspath('.'), 'energelia-sito.zip', as_attachment=True)

@app.route('/download-report/<bando>')
def download_report(bando):
    reports = {
        'isi_inail': 'report_inail_2025.pdf',
        'parco_agrisolare': 'parco_agrisolare.pdf',
        'resto_sud': 'resto_sud.pdf'
    }

    if bando not in reports:
        abort(404)

    reports_dir = os.path.join('static', 'reports')
    return send_from_directory(reports_dir, reports[bando], as_attachment=True)


# ==================== ADMIN PANEL ====================

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'energelia2026')

@app.route('/forzasamp')
def admin_login_page():
    return render_template('admin/login.html')

@app.route('/forzasamp/dashboard')
def admin_dashboard():
    return render_template('admin/dashboard.html')

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(silent=True) or {}
    password = data.get('password', '')
    
    if password == ADMIN_PASSWORD:
        return jsonify({'success': True, 'token': 'admin_authenticated'})
    return jsonify({'success': False, 'error': 'Password errata'}), 401

@app.route('/api/admin/leads', methods=['GET'])
def get_all_leads():
    auth = request.headers.get('Authorization', '')
    if auth != 'Bearer admin_authenticated':
        return jsonify({'success': False, 'error': 'Non autorizzato'}), 401
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, email, phone, bando, tag, created_at 
            FROM leads 
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        leads = []
        for row in rows:
            leads.append({
                'id': row[0],
                'email': row[1],
                'phone': row[2],
                'bando': row[3],
                'tag': row[4],
                'created_at': row[5].isoformat() if row[5] else None
            })
        
        return jsonify({'success': True, 'leads': leads})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/consultations', methods=['GET'])
def get_all_consultations():
    auth = request.headers.get('Authorization', '')
    if auth != 'Bearer admin_authenticated':
        return jsonify({'success': False, 'error': 'Non autorizzato'}), 401
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, email, phone, created_at 
            FROM consultations 
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        consultations = []
        for row in rows:
            consultations.append({
                'id': row[0],
                'email': row[1],
                'phone': row[2],
                'created_at': row[3].isoformat() if row[3] else None
            })
        
        return jsonify({'success': True, 'consultations': consultations})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/lead/<int:lead_id>/tag', methods=['PUT'])
def update_lead_tag(lead_id):
    auth = request.headers.get('Authorization', '')
    if auth != 'Bearer admin_authenticated':
        return jsonify({'success': False, 'error': 'Non autorizzato'}), 401
    
    data = request.get_json(silent=True) or {}
    tag = data.get('tag')
    
    valid_tags = [None, '', 'da_richiamare', 'da_scrivere_whatsapp', 'contattato', 'interessato', 'non_interessato']
    if tag not in valid_tags:
        return jsonify({'success': False, 'error': 'Tag non valido'}), 400
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE leads SET tag = %s WHERE id = %s", (tag if tag else None, lead_id))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    auth = request.headers.get('Authorization', '')
    if auth != 'Bearer admin_authenticated':
        return jsonify({'success': False, 'error': 'Non autorizzato'}), 401
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT bando, COUNT(*) FROM leads GROUP BY bando")
        bando_stats = dict(cur.fetchall())
        
        cur.execute("SELECT tag, COUNT(*) FROM leads WHERE tag IS NOT NULL GROUP BY tag")
        tag_stats = dict(cur.fetchall())
        
        cur.execute("SELECT COUNT(*) FROM leads")
        total_leads = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM consultations")
        total_consultations = cur.fetchone()[0]
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'stats': {
                'total_leads': total_leads,
                'total_consultations': total_consultations,
                'by_bando': bando_stats,
                'by_tag': tag_stats
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== NEWS TICKER (Google Alerts RSS) ====================

NEWS_RSS_URL = os.environ.get(
    'NEWS_RSS_URL',
    'https://www.google.com/alerts/feeds/13028029149471216123/13353592071105047130'
)
NEWS_CACHE = {'items': [], 'fetched_at': None}
NEWS_CACHE_DURATION = timedelta(minutes=30)


def _clean_google_redirect(url):
    """Google Alerts wraps article links in a google.com/url?...&url=REAL redirect.
    Extract the real article URL."""
    try:
        parsed = urlparse(url)
        if 'google.com' in parsed.netloc and parsed.path.startswith('/url'):
            params = parse_qs(parsed.query)
            if 'url' in params:
                return unquote(params['url'][0])
    except Exception:
        pass
    return url


# Pattern usati per ripulire i titoli del feed Google Alerts
_HTML_TAG_RE = re.compile(r'<[^>]+>')
_GOOGLE_TRACK_RE = re.compile(
    r'&(?:ct|cd|usg|echo|sa|ved|hl|gl|tbm|biw|bih)=[^&\s]*',
    re.IGNORECASE
)
_WHITESPACE_RE = re.compile(r'\s+')


def _clean_title(raw_title):
    """Ripulisce il titolo di una voce Google Alerts:
       - rimuove tag HTML (<b>...</b> usati per evidenziare le keyword)
       - decodifica le entità HTML (&amp; -> &, &quot; -> ", ecc.)
       - rimuove resti di parametri di tracciamento Google (&ct=, &echo=, ecc.)
       - normalizza gli spazi multipli
    """
    if not raw_title:
        return ''
    # 1. Strip dei tag HTML (mantiene il testo interno)
    cleaned = _HTML_TAG_RE.sub('', raw_title)
    # 2. Decodifica entità HTML (può servire farlo due volte: il feed a volte fa doppio encoding)
    cleaned = html.unescape(cleaned)
    cleaned = html.unescape(cleaned)
    # 3. Rimuove parametri tracciamento Google che a volte sbordano nei titoli
    cleaned = _GOOGLE_TRACK_RE.sub('', cleaned)
    # 4. Normalizza spazi
    cleaned = _WHITESPACE_RE.sub(' ', cleaned).strip()
    return cleaned


def _fetch_news():
    """Legge l'RSS del Google Alert e popola la cache.
    Cache valida per NEWS_CACHE_DURATION minuti."""
    now = datetime.now()
    if (NEWS_CACHE['fetched_at'] is not None and
            (now - NEWS_CACHE['fetched_at']) < NEWS_CACHE_DURATION):
        return NEWS_CACHE['items']

    try:
        feed = feedparser.parse(NEWS_RSS_URL)
        items = []
        for entry in feed.entries[:15]:
            title = _clean_title(entry.get('title', ''))
            link = _clean_google_redirect(entry.get('link', ''))
            published = entry.get('published', '') or entry.get('updated', '')
            if title and link:
                items.append({
                    'title': title,
                    'link': link,
                    'published': published,
                })
        NEWS_CACHE['items'] = items
        NEWS_CACHE['fetched_at'] = now
    except Exception as e:
        print(f"Errore fetch news RSS: {e}")
        # Se non c'è cache precedente, restituiamo lista vuota
        if NEWS_CACHE['fetched_at'] is None:
            return []
    return NEWS_CACHE['items']


@app.route('/api/news')
def api_news():
    """Restituisce le ultime news dal feed Google Alert (formato JSON)."""
    items = _fetch_news()
    return jsonify({'items': items, 'count': len(items)})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
