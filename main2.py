import os
import re
import html
import smtplib
import threading
import hmac
import secrets
import psycopg2
import feedparser
import requests
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, unquote
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, render_template, abort, request, redirect, send_from_directory, jsonify, session
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__,
            template_folder='templates',
            static_folder=os.path.join('templates', 'life-insurance-website-template'),
            static_url_path='/static')

# Riconosce HTTPS correttamente dietro proxy come Replit, Nginx, ecc.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Genera URL con https:// invece di http:// nei template
app.config['PREFERRED_URL_SCHEME'] = 'https'
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
                  SESSION_COOKIE_SECURE=os.environ.get('SESSION_COOKIE_SECURE', '1') != '0')

from privacy import register_privacy
register_privacy(app)

from crm import init_crm
init_crm(app)

from simulatore_fv import simulatore_bp, init_simulatore_db
app.register_blueprint(simulatore_bp)


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
    if page.lower() in ('privacy-policy.html', 'cookie-policy.html'):
        return redirect('/' + page[:-5], code=308)
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


def _send_lead_email(subject, body, recipient=None):
    """Invio reale SMTP (chiamato dentro un thread)."""
    actual_to = recipient or LEAD_NOTIFY_TO
    if not (SMTP_USER and SMTP_PASS and actual_to):
        return
    try:
        msg = MIMEMultipart()
        msg['From'] = f"{LEAD_NOTIFY_FROM_NAME} <{SMTP_USER}>"
        msg['To'] = actual_to
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


from retention import register_retention, record_new_contact
register_retention(app, lambda: get_db_connection())


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
        cur.execute('ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone VARCHAR(50), ADD COLUMN IF NOT EXISTS tag VARCHAR(50)')
        from digital_requests import migrate
        migrate(cur)
        from retention import migrate_retention
        migrate_retention(cur)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        print(f"Errore init_db: {e}")


init_db()
init_simulatore_db()


VALID_BANDI = {'isi_inail', 'parco_agrisolare', 'botteghe_entroterra', 'resto_sud'}


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
            "INSERT INTO leads (email, phone, bando) VALUES (%s, %s, %s) RETURNING id",
            (email, phone, bando)
        )
        record_new_contact(cur, 'leads', cur.fetchone()[0])
        conn.commit()
        cur.close()
        conn.close()
        # Notifica email in background (non blocca la risposta)
        notify_new_lead('Lead — download report', email=email, phone=phone, bando=bando)
        return jsonify({'success': True})
    except Exception as e:
        app.logger.error("Errore save_lead: %s", type(e).__name__)
        return jsonify({'success': False, 'error': 'Servizio temporaneamente non disponibile. Riprova più tardi.'}), 500


# Servizi digitali: percorso di contatto indipendente dai lead sui bandi.
# Configurare DIGITAL_NOTIFY_TO prima della pubblicazione del nuovo modulo.
DIGITAL_NOTIFY_TO = os.environ.get('DIGITAL_NOTIFY_TO', '').strip()
DIGITAL_NOTIFY_FROM = os.environ.get('DIGITAL_NOTIFY_FROM', '').strip()
DIGITAL_RESEND_API_KEY = (os.environ.get('DIGITAL_RESEND_API_KEY', '').strip()
                          or os.environ.get('RESEND_API_KEY', '').strip())
DIGITAL_PROJECT_FORM_ENABLED = os.environ.get('DIGITAL_PROJECT_FORM_ENABLED', '').strip() == '1'
# Digital requests reuse the site's PostgreSQL and the existing CRM identity.
from digital_requests import register_digital_requests, DigitalNotificationError, SERVICES as DIGITAL_SERVICES, TIMELINES as DIGITAL_TIMELINES
from crm import utente_corrente, BASE as CRM_BASE


def _digital_notification_ready():
    return bool(DIGITAL_RESEND_API_KEY and DIGITAL_NOTIFY_FROM and DIGITAL_NOTIFY_TO)


def _digital_notification_payload(row):
    # No customer contacts, project free text or internal notes leave the CRM.
    body = (f"Nuova richiesta digitale #{row['id']} registrata.\n"
            f"Servizio: {DIGITAL_SERVICES.get(row['category'], row['category'])}\n"
            f"Tempistica: {DIGITAL_TIMELINES.get(row['timeline'], 'Da valutare insieme')}\n"
            f"Dettaglio nell'area riservata: https://energelia.it/crm/richieste-digitali/{row['id']}\n")
    return {'from': DIGITAL_NOTIFY_FROM,
            'to': [address.strip() for address in DIGITAL_NOTIFY_TO.split(',') if address.strip()],
            'subject': f"Nuova richiesta digitale #{row['id']} — Energelia", 'text': body}


def _send_digital_notification(row):
    try:
        response = requests.post('https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {DIGITAL_RESEND_API_KEY}',
                     'Idempotency-Key': row['notification_key']},
            json=row['notification_payload'], timeout=(3.05, 10), allow_redirects=False)
    except requests.RequestException:
        raise DigitalNotificationError('provider_connection_error') from None
    if response.status_code != 200:
        try:
            error_name = response.json().get('name')
        except (ValueError, AttributeError):
            error_name = None
        if response.status_code == 409 and error_name == 'invalid_idempotent_request':
            raise DigitalNotificationError('idempotency_conflict', retryable=False)
        try:
            retry_after = min(86400, max(0, int(response.headers.get('Retry-After', '0'))))
        except (ValueError, TypeError):
            retry_after = 0
        raise DigitalNotificationError(f'provider_http_{response.status_code}',
            retryable=response.status_code in (408, 429) or response.status_code >= 500 or
                      (response.status_code == 409 and error_name == 'concurrent_idempotent_requests'),
            retry_after=retry_after)
    try:
        provider_id = response.json()['id']
    except (ValueError, TypeError, KeyError):
        raise DigitalNotificationError('invalid_provider_response') from None
    return provider_id


register_digital_requests(
    app, lambda: get_db_connection(), lambda: DIGITAL_PROJECT_FORM_ENABLED,
    _send_digital_notification, lambda: _digital_notification_ready(), utente_corrente, CRM_BASE,
    notification_payload=_digital_notification_payload)




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
            "INSERT INTO consultations (email, phone) VALUES (%s, %s) RETURNING id",
            (email, phone)
        )
        record_new_contact(cur, 'consultations', cur.fetchone()[0])
        conn.commit()
        cur.close()
        conn.close()
        # Notifica email in background (non blocca la risposta)
        notify_new_lead('Richiesta consulenza / Ricerca Bandi', email=email, phone=phone)
        return jsonify({'success': True})
    except Exception as e:
        app.logger.error("Errore save_consultation: %s", type(e).__name__)
        return jsonify({'success': False, 'error': 'Servizio temporaneamente non disponibile. Riprova più tardi.'}), 500


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

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

@app.route('/forzasamp')
def admin_login_page():
    return render_template('admin/login.html')

@app.route('/forzasamp/dashboard')
def admin_dashboard():
    if not session.get('web_admin'):
        return redirect('/forzasamp')
    return render_template('admin/dashboard.html')

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    if request.headers.get('Origin', request.host_url.rstrip('/')) != request.host_url.rstrip('/') or request.headers.get('Sec-Fetch-Site') == 'cross-site':
        abort(403)
    data = request.get_json(silent=True) or {}
    password = data.get('password', '')

    if isinstance(password, str) and ADMIN_PASSWORD and hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
        session.clear()
        session.permanent = True
        session['web_admin'] = True
        session['web_admin_token'] = secrets.token_urlsafe(32)
        return jsonify({'success': True, 'token': session['web_admin_token']})
    return jsonify({'success': False, 'error': 'Password errata'}), 401

@app.post('/api/admin/logout')
def admin_logout():
    if request.headers.get('Sec-Fetch-Site') == 'cross-site':
        abort(403)
    session.pop('web_admin', None)
    session.pop('web_admin_token', None)
    return jsonify(success=True)


@app.route('/api/admin/leads', methods=['GET'])
def get_all_leads():
    auth = request.headers.get('Authorization', '')
    if not session.get('web_admin') or not hmac.compare_digest(auth, 'Bearer ' + session.get('web_admin_token', '')):
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
        return jsonify({'success': False, 'error': 'Servizio temporaneamente non disponibile.'}), 500

@app.route('/api/admin/consultations', methods=['GET'])
def get_all_consultations():
    auth = request.headers.get('Authorization', '')
    if not session.get('web_admin') or not hmac.compare_digest(auth, 'Bearer ' + session.get('web_admin_token', '')):
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
        return jsonify({'success': False, 'error': 'Servizio temporaneamente non disponibile.'}), 500

@app.route('/api/admin/lead/<int:lead_id>/tag', methods=['PUT'])
def update_lead_tag(lead_id):
    if request.headers.get('Origin', request.host_url.rstrip('/')) != request.host_url.rstrip('/') or request.headers.get('Sec-Fetch-Site') == 'cross-site':
        abort(403)
    auth = request.headers.get('Authorization', '')
    if not session.get('web_admin') or not hmac.compare_digest(auth, 'Bearer ' + session.get('web_admin_token', '')):
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
        return jsonify({'success': False, 'error': 'Servizio temporaneamente non disponibile.'}), 500

@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    auth = request.headers.get('Authorization', '')
    if not session.get('web_admin') or not hmac.compare_digest(auth, 'Bearer ' + session.get('web_admin_token', '')):
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
        return jsonify({'success': False, 'error': 'Servizio temporaneamente non disponibile.'}), 500


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
