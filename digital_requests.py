"""Digital enquiries: existing PostgreSQL connection and existing CRM identity only."""
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, current_app, jsonify, redirect, render_template, request, session, url_for
from jinja2 import ChoiceLoader, DictLoader
from psycopg2.extras import RealDictCursor, Json

SERVICES = {'sito': 'Siti web', 'app-software': 'App/software', 'gestionale': 'Gestionali',
            'automazioni': 'Automazioni / AI', 'da-definire': 'Consulenza: soluzione da definire'}
LEGACY = {'legacy-gestionale': 'App / gestionale (richiesta storica)', 'legacy-altro': 'Altro (storico)'}
GOALS = {
    'sito': {'contatti': 'Ricevere più contatti', 'presenza': 'Presentare la mia attività', 'vendita': 'Vendere online'},
    'app-software': {'servizio': 'Offrire un servizio digitale', 'prenotazioni': 'Gestire prenotazioni', 'portale': 'Creare un portale clienti'},
    'gestionale': {'clienti': 'Organizzare clienti e contatti', 'attivita': 'Gestire attività e interventi', 'dati': 'Riunire dati e documenti'},
    'automazioni': {'ripetizioni': 'Ridurre attività ripetitive', 'integrazioni': 'Collegare gli strumenti', 'ai': 'Usare AI su dati e documenti'},
    'da-definire': {'orientamento': 'Capire da dove iniziare', 'processo': 'Migliorare un processo', 'fattibilita': 'Valutare un’idea'}
}
TIMELINES = {'': 'Da valutare insieme', 'presto': 'Appena possibile', '1-3-mesi': 'Entro 1–3 mesi', '3-6-mesi': 'Entro 3–6 mesi', 'esplorativa': 'Sto esplorando le possibilità'}
STATUSES = {'nuova': 'Nuova', 'da-contattare': 'Da contattare', 'in-confronto': 'Confronto in corso', 'proposta': 'Proposta inviata', 'chiusa': 'Chiusa'}
OUTCOMES = {'da-valutare': 'Da valutare', 'vinta': 'Acquisita', 'persa': 'Non acquisita', 'rinviata': 'Rinviata'}
NOTIFICATIONS = {'storica': 'Non tracciata (storica)', 'non-configurata': 'Email non configurata', 'in-attesa': 'In attesa di invio', 'inviata': 'Notifica accettata dal provider', 'fallita': 'Email non riuscita', 'da-verificare': 'Esito da verificare prima di un nuovo invio'}
from privacy import POLICY_VERSION as PRIVACY_VERSION
from retention import record_new_contact, digital_interaction, get_review
MIGRATION = Path(__file__).parent / 'migrations/001_digital_requests.sql'


def migrate(cur):
    cur.execute(MIGRATION.read_text())
    cur.execute((MIGRATION.parent / '002_digital_notifications.sql').read_text())


@contextmanager
def database(connect):
    conn = connect()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SET LOCAL TIME ZONE 'UTC'")
                yield cur
    finally:
        conn.close()


def validate(data):
    if not isinstance(data, dict):
        return None, {'form': 'Richiesta non valida.'}
    errors, values = {}, {}
    limits = {'name': 100, 'email': 254, 'phone': 40, 'service': 32, 'message': 2500,
              'project_context': 1500, 'existing_solution': 1000, 'timeline': 32, 'idempotency_key': 80}
    for key, limit in limits.items():
        raw = data.get(key, '')
        if not isinstance(raw, str) or len(raw) > limit or '\x00' in raw:
            errors[key] = 'Controlla questo campo: formato o lunghezza non validi.'
            values[key] = ''
        else:
            values[key] = raw.strip()
    if len(values['name']) < 2:
        errors['name'] = 'Inserisci il tuo nome (almeno 2 caratteri).'
    if not re.fullmatch(r'[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+', values['email']):
        errors['email'] = 'Inserisci un indirizzo email valido.'
    if values['phone'] and not re.fullmatch(r'[+\d() ./-]{6,40}', values['phone']):
        errors['phone'] = 'Inserisci un numero di telefono valido oppure lascia vuoto.'
    if values['service'] not in SERVICES:
        errors['service'] = 'Scegli l’area più vicina al tuo progetto.'
    if len(values['message']) < 12:
        errors['message'] = 'Raccontaci il tuo obiettivo in almeno 12 caratteri.'
    if values['timeline'] not in TIMELINES:
        errors['timeline'] = 'Scegli una delle tempistiche indicate.'
    if data.get('contact_ack') is not True:
        errors['contact_ack'] = 'Conferma di aver letto l’informativa per inviare la richiesta.'
    goals = data.get('goals', [])
    if not isinstance(goals, list) or len(goals) > 3 or any(not isinstance(g, str) or g not in GOALS.get(values['service'], {}) for g in goals):
        errors['goals'] = 'Scegli gli obiettivi relativi al servizio selezionato.'
    else:
        values['goals'] = sorted(set(goals))
    key = values['idempotency_key']
    if key and not re.fullmatch(r'[A-Za-z0-9_-]{16,80}', key):
        errors['idempotency_key'] = 'Ricarica la pagina prima di riprovare.'
    return values, errors


class DigitalNotificationError(Exception):
    """Safe diagnostic code, never provider response bodies or credentials."""
    def __init__(self, code, retryable=True, retry_after=0):
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.retry_after = retry_after


def register_digital_requests(app, connect, enabled, notify, notification_ready, current_user, crm_base, notification_payload):
    bp = Blueprint('digital_requests', __name__)
    app.config.setdefault('DIGITAL_TRUSTED_PROXY_HOPS', int(os.environ.get('DIGITAL_TRUSTED_PROXY_HOPS', '0')))
    app.jinja_env.globals['digital_goals'] = GOALS
    # Reuse the CRM shell while rendering new templates with HTML autoescaping.
    app.jinja_loader = ChoiceLoader([app.jinja_loader, DictLoader({'digital_admin_base.html': crm_base.replace('<body>', '<body class="digital-admin-page">').replace('<nav>', '<nav aria-label="Navigazione area riservata">', 1)})])
    app.jinja_env.filters['digital_date'] = lambda value: (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).astimezone(ZoneInfo('Europe/Rome')).strftime('%d/%m/%Y %H:%M') if value else '—'

    def same_origin():
        origin = request.headers.get('Origin')
        return (not origin or origin == request.host_url.rstrip('/')) and request.headers.get('Sec-Fetch-Site') != 'cross-site'

    def csrf():
        if not session.get('digital_csrf'):
            session['digital_csrf'] = secrets.token_urlsafe(32)
        return session['digital_csrf']

    def protect_write():
        token = request.form.get('csrf_token', '')
        if not same_origin() or not token or not token.isascii() or not hmac.compare_digest(token, session.get('digital_csrf', '')):
            abort(403, 'Sessione non valida. Ricarica la pagina e riprova.')

    def render_admin(template, **kwargs):
        return render_template(template, utente=current_user(), titolo='Richieste digitali', pagina='richieste-digitali',
                               messaggi=[], guida=None, services={**SERVICES, **LEGACY}, statuses=STATUSES,
                               outcomes=OUTCOMES, timelines=TIMELINES, notifications=NOTIFICATIONS,
                               goals_map=GOALS, csrf_token=csrf(), **kwargs)

    @bp.before_request
    def authorize():
        if request.path.startswith('/crm/richieste-digitali'):
            try:
                user = current_user()
            except Exception:
                app.logger.error('Verifica accesso richieste digitali non disponibile')
                return 'Area riservata temporaneamente non disponibile. Riprova tra poco.', 503
            if not user:
                if request.method != 'GET':
                    abort(401)
                return redirect('/crm/')
            if not user.is_admin:
                abort(403)

    @bp.after_request
    def private_response(response):
        if request.path.startswith('/crm/richieste-digitali') or request.path == '/api/digital-project':
            response.headers['Cache-Control'] = 'no-store'
        return response

    def notification_worker(record_id, force=False):
        with app.app_context():
            try:
                with database(connect) as cur:
                    # A session advisory lock survives commits, but is released on
                    # connection/process death. No stuck leases after a Render restart.
                    cur.execute('SELECT pg_try_advisory_lock(72481002, %s) AS locked', (record_id,))
                    if not cur.fetchone()['locked']:
                        return
                    cur.execute('SELECT * FROM digital_project_requests WHERE id=%s FOR UPDATE', (record_id,))
                    row = cur.fetchone()
                    if not row or row['notification_status'] in ('inviata', 'da-verificare'):
                        return
                    now = datetime.now(timezone.utc).replace(tzinfo=None)
                    if not force and row['notification_next_attempt_at'] and row['notification_next_attempt_at'] > now:
                        return
                    if not notification_ready():
                        cur.execute("UPDATE digital_project_requests SET notification_status='non-configurata', notification_updated_at=CURRENT_TIMESTAMP WHERE id=%s", (record_id,))
                        return
                    # Conservative margin on Resend's 24h idempotency window.
                    # Never blindly replay a potentially accepted message after expiry.
                    if row['notification_first_attempt_at'] and now - row['notification_first_attempt_at'] >= timedelta(hours=23):
                        cur.execute("UPDATE digital_project_requests SET notification_status='da-verificare', notification_error='idempotency_window_expired', notification_next_attempt_at=NULL, notification_updated_at=CURRENT_TIMESTAMP WHERE id=%s", (record_id,))
                        return
                    body = row['notification_payload'] or notification_payload(row)
                    key = row['notification_key'] or ('digital/' + secrets.token_urlsafe(32))
                    attempts = row['notification_attempts'] + 1
                    cur.execute("""UPDATE digital_project_requests SET notification_key=%s, notification_payload=%s,
                        notification_first_attempt_at=COALESCE(notification_first_attempt_at,CURRENT_TIMESTAMP),
                        notification_attempts=%s, notification_status='in-attesa', notification_error=NULL,
                        notification_next_attempt_at=CURRENT_TIMESTAMP + INTERVAL '1 minute',
                        notification_updated_at=CURRENT_TIMESTAMP WHERE id=%s""", (key, Json(body), attempts, record_id))
                    # Commit key, exact payload and attempt BEFORE calling the provider.
                    # If the process dies after provider acceptance, the retry is identical.
                    cur.connection.commit()
                    row.update(notification_key=key, notification_payload=body)
                    try:
                        provider_id = notify(row)
                        if not isinstance(provider_id, str) or not 1 <= len(provider_id) <= 128:
                            raise DigitalNotificationError('invalid_provider_response')
                    except Exception as exc:
                        error = exc if isinstance(exc, DigitalNotificationError) else DigitalNotificationError('provider_unavailable')
                        delay = max(min(3600, 30 * 2 ** min(attempts-1, 7)), error.retry_after)
                        next_attempt = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=delay) if error.retryable else None
                        state = 'da-verificare' if error.code == 'idempotency_conflict' else 'fallita'
                        cur.execute("""UPDATE digital_project_requests SET notification_status=%s, notification_error=%s,
                            notification_next_attempt_at=%s, notification_updated_at=CURRENT_TIMESTAMP WHERE id=%s""",
                            (state, error.code, next_attempt, record_id))
                        app.logger.warning('Notifica digitale %s: %s', record_id, error.code)
                    else:
                        cur.execute("""UPDATE digital_project_requests SET notification_status='inviata', notification_provider_id=%s,
                            notification_error=NULL, notification_next_attempt_at=NULL,
                            notification_updated_at=CURRENT_TIMESTAMP WHERE id=%s""", (provider_id, record_id))
            except Exception:
                # Durable attempt metadata survives any error after the first commit.
                app.logger.error('Aggiornamento notifica digitale fallito per record %s', record_id)

    def recover_pending():
        if not notification_ready():
            return
        try:
            with database(connect) as cur:
                cur.execute("""SELECT id FROM digital_project_requests WHERE
                    (notification_status IN ('in-attesa','non-configurata') AND
                     (notification_next_attempt_at IS NULL OR notification_next_attempt_at<=CURRENT_TIMESTAMP)) OR
                    (notification_status='fallita' AND notification_next_attempt_at<=CURRENT_TIMESTAMP)
                    ORDER BY id LIMIT 20""")
                ids = [row['id'] for row in cur.fetchall()]
            for record_id in ids:
                notification_worker(record_id)
        except Exception:
            app.logger.error('Recupero notifiche digitali temporaneamente non disponibile')

    def schedule(record_id):
        try:
            threading.Thread(target=notification_worker, args=(record_id, True), daemon=True).start()
        except Exception:
            app.logger.error('Avvio notifica digitale fallito, record %s in attesa', record_id)

    recovery_lock = threading.Lock()
    recovery_process = None
    stop_recovery = threading.Event()

    def recovery_loop():
        while not stop_recovery.is_set():
            with app.app_context():
                recover_pending()
            stop_recovery.wait(30)

    def start_recovery():
        nonlocal recovery_process
        if not notification_ready() or app.testing or os.environ.get('DIGITAL_NOTIFICATION_RECOVERY_ENABLED', '1') != '1':
            return
        with recovery_lock:
            if recovery_process == os.getpid():
                return
            try:
                threading.Thread(target=recovery_loop, daemon=True).start()
                recovery_process = os.getpid()
            except Exception:
                app.logger.error('Recupero notifiche digitali non avviato; nuovo tentativo alla prossima richiesta')

    # Starts on boot, and also on the first request after a preloaded worker fork.
    app.before_request(start_recovery)
    app.extensions['digital_notifications'] = {'worker': notification_worker, 'recover': recover_pending,
                                               'start': start_recovery, 'stop': stop_recovery}

    @bp.post('/api/digital-project')
    def submit():
        if not same_origin():
            return jsonify(success=False, error='Origine della richiesta non valida.'), 403
        if not enabled():
            return jsonify(success=False, error='Modulo in attivazione. Puoi chiamarci allo 010 777 65 30.'), 503
        if not request.is_json or (request.content_length or 0) > 16000:
            return jsonify(success=False, error='Richiesta non valida.'), 400
        # Bounded read also for clients without a Content-Length header.
        raw = request.stream.read(16001)
        if len(raw) > 16000:
            return jsonify(success=False, error='Richiesta troppo lunga.'), 413
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeError):
            data = None
        if isinstance(data, dict) and data.get('company_website'):
            return jsonify(success=False, error='Richiesta non accettata. Contattaci telefonicamente.'), 400
        values, errors = validate(data)
        if errors:
            return jsonify(success=False, error='Controlla i campi indicati.', fields=errors), 400
        canonical = {k: v for k, v in values.items() if k != 'idempotency_key'}
        canonical['email'] = canonical['email'].lower()
        fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
        key = values['idempotency_key'] or fingerprint
        # Opt in only when a known proxy overwrites X-Forwarded-For. Default is
        # the socket peer; the generous network limit also accommodates NATs.
        hops = max(0, min(5, int(app.config.get('DIGITAL_TRUSTED_PROXY_HOPS', 0))))
        client_ip = request.remote_addr or 'unknown'
        if hops and len(request.access_route) >= hops:
            client_ip = request.access_route[-hops]
        ip_hash = hmac.new(app.secret_key.encode() if isinstance(app.secret_key, str) else app.secret_key,
                           client_ip.encode(), hashlib.sha256).hexdigest()
        try:
            with database(connect) as cur:
                # Lock order is constant: network, email, payload, key; safe across workers.
                for lock in ('ip:' + ip_hash, 'email:' + canonical['email'], 'payload:' + fingerprint, 'key:' + key):
                    cur.execute('SELECT pg_advisory_xact_lock(%s)', (int.from_bytes(hashlib.sha256(lock.encode()).digest()[:8], 'big', signed=True),))
                cur.execute('SELECT id, payload_hash FROM digital_project_requests WHERE idempotency_key=%s', (key,))
                previous = cur.fetchone()
                if previous:
                    if previous['payload_hash'] != fingerprint:
                        return jsonify(success=False, error='Questa richiesta è già stata inviata. Ricarica la pagina per un nuovo progetto.'), 409
                    return jsonify(success=True, reference=previous['id'], duplicate=True), 200
                cur.execute("SELECT id FROM digital_project_requests WHERE payload_hash=%s AND created_at > CURRENT_TIMESTAMP - INTERVAL '10 minutes' ORDER BY id DESC LIMIT 1", (fingerprint,))
                previous = cur.fetchone()
                if previous:
                    return jsonify(success=True, reference=previous['id'], duplicate=True), 200
                cur.execute("SELECT COUNT(*) AS n FROM digital_project_requests WHERE ip_hash=%s AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'", (ip_hash,))
                network_count = cur.fetchone()['n']
                cur.execute("SELECT COUNT(*) AS n FROM digital_project_requests WHERE LOWER(email)=%s AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'", (canonical['email'],))
                email_count = cur.fetchone()['n']
                if network_count >= 30 or email_count >= 5:
                    return jsonify(success=False, error='Hai già inviato più richieste. Riprova tra un’ora oppure chiamaci.'), 429, {'Retry-After': '3600'}
                cur.execute('''INSERT INTO digital_project_requests
                    (name,email,phone,service,category,message,goals,project_context,existing_solution,timeline,
                     idempotency_key,payload_hash,ip_hash,privacy_version,notification_status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
                    (values['name'], values['email'], values['phone'], values['service'], values['service'],
                     values['message'], Json(values['goals']), values['project_context'], values['existing_solution'],
                     values['timeline'], key, fingerprint, ip_hash, PRIVACY_VERSION,
                     'in-attesa' if notification_ready() else 'non-configurata'))
                record_id = cur.fetchone()['id']
                record_new_contact(cur, 'digital_project_requests', record_id)
            # Commit has succeeded before any confirmation or external side effect.
        except Exception:
            app.logger.error('Salvataggio richiesta digitale fallito')
            return jsonify(success=False, error='Invio non riuscito. I dati restano nel modulo: riprova oppure chiamaci.'), 503
        if notification_ready():
            schedule(record_id)
        return jsonify(success=True, reference=record_id), 201

    @bp.get('/crm/richieste-digitali')
    def listing():
        filters = {key: request.args.get(key, '').strip() for key in ('q', 'service', 'status', 'outcome', 'from', 'to')}
        if len(filters['q']) > 100:
            abort(400)
        conditions, params = [], []
        for key, column, allowed in [('service', 'category', {**SERVICES, **LEGACY}), ('status', 'status', STATUSES), ('outcome', 'outcome', OUTCOMES)]:
            if filters[key]:
                if filters[key] not in allowed:
                    abort(400)
                conditions.append(column + '=%s')
                params.append(filters[key])
        for key, operator in [('from', '>='), ('to', '<')]:
            if filters[key]:
                try:
                    day = datetime.strptime(filters[key], '%Y-%m-%d')
                except ValueError:
                    abort(400)
                # PostgreSQL timestamps are UTC; filters represent Italian calendar days.
                if key == 'to':
                    day += timedelta(days=1)
                conditions.append('created_at ' + operator + ' %s')
                params.append(day.replace(tzinfo=ZoneInfo('Europe/Rome')).astimezone(timezone.utc).replace(tzinfo=None))
        if filters['q']:
            conditions.append('(name ILIKE %s OR email ILIKE %s)')
            params.extend(['%' + filters['q'] + '%'] * 2)
        try:
            page = max(1, int(request.args.get('page', '1')))
            if page > 100000:
                abort(400)
        except ValueError:
            abort(400)
        where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        try:
            with database(connect) as cur:
                cur.execute('SELECT COUNT(*) AS n FROM digital_project_requests' + where, params)
                total = cur.fetchone()['n']
                cur.execute('SELECT id, name, email, category, status, outcome, created_at FROM digital_project_requests' + where + ' ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET %s', params + [(page-1)*30])
                rows = cur.fetchall()
        except Exception:
            app.logger.error('Elenco richieste digitali non disponibile')
            return render_admin('admin/digital_error.html'), 503
        return render_admin('admin/digital_list.html', rows=rows, total=total, filters=filters, filters_active=any(filters.values()), page=page,
                            previous=url_for('digital_requests.listing', **{**filters, 'page': page-1}),
                            following=url_for('digital_requests.listing', **{**filters, 'page': page+1}))

    @bp.route('/crm/richieste-digitali/<int:record_id>', methods=['GET', 'POST'])
    def detail(record_id):
        errors, saved, form_values = {}, False, None
        if request.method == 'POST':
            protect_write()
            form_values = {k: request.form.get(k, '') for k in ('status', 'outcome', 'internal_notes', 'version')}
            if form_values['status'] not in STATUSES or form_values['outcome'] not in OUTCOMES:
                errors['form'] = 'Stato o esito non valido.'
            elif (form_values['outcome'] in ('vinta', 'persa') and form_values['status'] != 'chiusa') or (form_values['status'] == 'chiusa' and form_values['outcome'] == 'da-valutare'):
                errors['form'] = 'Per chiudere indica un esito. Acquisita e non acquisita richiedono lo stato Chiusa.'
            if len(form_values['internal_notes']) > 10000 or '\x00' in form_values['internal_notes']:
                errors['form'] = 'Le note devono contenere al massimo 10.000 caratteri validi.'
            try:
                version = int(form_values['version'])
            except ValueError:
                errors['form'] = 'Versione non valida. Ricarica il dettaglio.'
        try:
            with database(connect) as cur:
                if request.method == 'POST' and not errors:
                    cur.execute('''UPDATE digital_project_requests SET status=%s, outcome=%s, internal_notes=%s,
                        updated_at=CURRENT_TIMESTAMP, updated_by=%s, version=version+1 WHERE id=%s AND version=%s RETURNING id''',
                        (form_values['status'], form_values['outcome'], form_values['internal_notes'], str(current_user().id), record_id, version))
                    if not cur.fetchone():
                        errors['conflict'] = 'Un altro operatore ha aggiornato la richiesta. Le tue modifiche sono qui sotto: confrontale con i dati salvati prima di riprovare.'
                    else:
                        digital_interaction(cur, record_id, form_values['outcome'] == 'vinta',
                                            request.form.get('significant_interaction') == '1')
                        saved = True
                cur.execute('SELECT * FROM digital_project_requests WHERE id=%s', (record_id,))
                row = cur.fetchone()
                retention = get_review(cur, 'digital_project_requests', record_id)
        except Exception:
            app.logger.error('Dettaglio/aggiornamento digitale fallito')
            return render_admin('admin/digital_error.html', unsaved=form_values), 503
        if not row:
            abort(404)
        if saved:
            return redirect(url_for('digital_requests.detail', record_id=record_id, saved='1'), code=303)
        phone = re.sub(r'[^+0-9]', '', row['phone'] or '')
        return render_admin('admin/digital_detail.html', row=row, phone=phone, errors=errors,
                            retention=retention, form_values=form_values or row, saved=request.args.get('saved') == '1'), (409 if 'conflict' in errors else 400 if errors else 200)

    @bp.post('/crm/richieste-digitali/<int:record_id>/notifica')
    def retry_notification(record_id):
        protect_write()
        try:
            with database(connect) as cur:
                cur.execute('SELECT id FROM digital_project_requests WHERE id=%s', (record_id,))
                if not cur.fetchone():
                    abort(404)
        except Exception as exc:
            from werkzeug.exceptions import HTTPException
            if isinstance(exc, HTTPException):
                raise
            app.logger.error('Notifica digitale non disponibile')
            return render_admin('admin/digital_error.html'), 503
        schedule(record_id)
        return redirect(url_for('digital_requests.detail', record_id=record_id), code=303)

    app.register_blueprint(bp)
    start_recovery()
