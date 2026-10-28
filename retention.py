"""Retention review and deletion planning. No deletion API, scheduler or DELETE SQL.

This tool deliberately produces reviewable manifests only. Email/Drive/backups,
indirect links and legal holds require an approved coordinated deletion process.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
import click
from psycopg2.extras import RealDictCursor

SOURCES = {'leads': ('email', 'phone'), 'consultations': ('email', 'phone'),
           'digital_project_requests': ('email', 'phone'), 'crm_lead': ('email', 'telefono')}


def migrate_retention(cur):
    cur.execute((Path(__file__).parent / 'migrations/003_privacy_retention.sql').read_text())


def record_new_contact(cur, source, record_id):
    if source not in SOURCES:
        raise ValueError('Unsupported source')
    cur.execute('''INSERT INTO privacy_retention(source,record_id,classification,last_interaction_at)
        VALUES (%s,%s,'prospect',CURRENT_TIMESTAMP AT TIME ZONE 'UTC')''', (source, record_id))


def digital_interaction(cur, record_id, acquired, significant):
    # A won enquiry can never silently become a prospect again. Review is explicit.
    cur.execute('''INSERT INTO privacy_retention(source,record_id) VALUES ('digital_project_requests',%s)
        ON CONFLICT DO NOTHING''', (record_id,))
    cur.execute('''UPDATE privacy_retention SET
        classification=CASE WHEN %s THEN 'customer' ELSE classification END,
        last_interaction_at=CASE WHEN %s THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' ELSE last_interaction_at END,
        reviewed_at=CASE WHEN %s OR %s THEN NULL ELSE reviewed_at END
        WHERE source='digital_project_requests' AND record_id=%s''',
        (acquired, significant, acquired, significant, record_id))


def get_review(cur, source, record_id):
    cur.execute('SELECT * FROM privacy_retention WHERE source=%s AND record_id=%s', (source, record_id))
    return cur.fetchone()


def contact_blocks(cur, source, row):
    """Conservative cross-archive checks; never equate absence of a match with proof."""
    email_col, phone_col = SOURCES[source]
    email = (row.get(email_col) or '').strip().lower()
    phone = ''.join(c for c in (row.get(phone_col) or '') if c.isdigit())
    cur.execute('''SELECT id FROM crm_clienti WHERE
        (%s<>'' AND (LOWER(TRIM(email))=%s OR LOWER(TRIM(email_fatturazione))=%s))
        OR (%s<>'' AND regexp_replace(COALESCE(telefono,''),'[^0-9]','','g')=%s) LIMIT 1''',
        (email, email, email, phone, phone))
    blocks = ['matching_customer'] if cur.fetchone() else []
    cur.execute('''SELECT id FROM digital_project_requests WHERE outcome='vinta' AND
        ((%s<>'' AND LOWER(TRIM(email))=%s) OR
         (%s<>'' AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=%s)) LIMIT 1''',
        (email, email, phone, phone))
    if cur.fetchone():
        blocks.append('matching_acquired_digital_contact')
    if source == 'digital_project_requests' and row['outcome'] == 'vinta':
        blocks.append('acquired_enquiry')
    if source == 'crm_lead':
        if row.get('cliente_id') or row.get('stato') == 'convertito':
            blocks.append('converted_customer')
        cur.execute('SELECT id FROM crm_trattative WHERE lead_id=%s LIMIT 1', (row['id'],))
        if cur.fetchone():
            blocks.append('linked_deal_requires_separate_review')
    if not email and not phone:
        blocks.append('no_reliable_cross_archive_contact')
    if source == 'crm_lead':
        blocks.append('external_source_needs_separate_retention_policy')
    return blocks


def retention_report(cur):
    """Only read queries. Unknown history is never dated from creation or updated_at."""
    result = []
    for source in SOURCES:
        cur.execute(f'''SELECT t.*, r.classification, r.last_interaction_at, r.legal_hold,
            r.reviewed_at, (r.last_interaction_at <= CURRENT_TIMESTAMP - INTERVAL '24 months') AS due
            FROM {source} t LEFT JOIN privacy_retention r ON r.source=%s AND r.record_id=t.id
            ORDER BY t.id''', (source,))
        rows = cur.fetchall()
        for row in rows:
            state = 'not_due'
            blocks = contact_blocks(cur, source, row)
            if row.get('legal_hold'): blocks.append('legal_hold')
            if row.get('classification') == 'customer': blocks.append('customer')
            if row.get('classification') not in ('prospect', 'customer') or not row.get('last_interaction_at'):
                blocks.append('history_needs_review')
            if blocks: state = 'blocked'
            elif row.get('due'): state = 'due_for_review'
            dependents = []
            if source == 'leads':
                cur.execute('SELECT id FROM simulazioni_fv WHERE lead_id=%s ORDER BY id', (row['id'],))
                dependents = [r['id'] for r in cur.fetchall()]
            result.append({'source':source, 'id':row['id'], 'classification':row.get('classification') or 'unclassified',
                           'last_interaction_at':row['last_interaction_at'].isoformat() if row.get('last_interaction_at') else None,
                           'state':state, 'blocks':blocks, 'reviewed':bool(row.get('reviewed_at')),
                           'simulation_ids':dependents})
    return {'mode':'read-only', 'deletion_enabled':False, 'records':result,
            'required_before_deletion':['Approve each subject across archives and legal obligations',
                'Inspect all foreign keys and indirect links on the actual database',
                'Coordinate operational emails, attachments, Drive, exports and backup expiry',
                'Approve a transaction with locked rows, dependency recheck, rollback and minimal deletion receipt']}


def register_retention(app, connect):
    @app.cli.command('privacy-retention-report')
    def report_command():
        """Print a read-only review manifest (IDs only, no contact details)."""
        conn = connect()
        try:
            conn.set_session(readonly=True)
            with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SET LOCAL TIME ZONE 'UTC'")
                click.echo(json.dumps(retention_report(cur), ensure_ascii=False, indent=2))
        finally:
            conn.close()

    @app.cli.command('privacy-retention-review')
    @click.option('--source', type=click.Choice(list(SOURCES)), required=True)
    @click.option('--record-id', type=click.IntRange(min=1), required=True)
    @click.option('--classification', type=click.Choice(['unclassified','prospect','customer']), required=True)
    @click.option('--last-interaction', help='Verified UTC date/time in ISO format, required for prospects.')
    @click.option('--hold/--no-hold', default=True, help='Keep a legal hold unless explicitly released.')
    @click.option('--reason', default='', help='Required when a hold is set; do not include unnecessary personal data.')
    @click.option('--reviewer', required=True)
    @click.option('--apply', is_flag=True, help='Actually save metadata; default is preview only.')
    def review_command(source, record_id, classification, last_interaction, hold, reason, reviewer, apply):
        """Review ONE record. Does not delete data. Requires explicit --apply to write."""
        timestamp = None
        if last_interaction:
            try:
                timestamp = datetime.fromisoformat(last_interaction.replace('Z','+00:00'))
                if timestamp.tzinfo is None: raise ValueError()
                timestamp = timestamp.astimezone(timezone.utc)
                if timestamp > datetime.now(timezone.utc): raise ValueError()
                timestamp = timestamp.replace(tzinfo=None)
            except ValueError:
                raise click.ClickException('Use a verified ISO timestamp with timezone, not in the future.')
        if classification == 'prospect' and not timestamp:
            raise click.ClickException('A prospect requires a verified last interaction, not a creation date guess.')
        if hold and not reason.strip():
            raise click.ClickException('A hold needs a reason.')
        if len(reason) > 1000 or not 1 <= len(reviewer) <= 120:
            raise click.ClickException('Invalid reason or reviewer length.')
        conn = connect()
        try:
            conn.set_session(readonly=not apply)
            with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SET LOCAL TIME ZONE 'UTC'")
                cur.execute(f'SELECT * FROM {source} WHERE id=%s' + (' FOR UPDATE' if apply else ''), (record_id,))
                row = cur.fetchone()
                if not row: raise click.ClickException('Record not found.')
                blocks = contact_blocks(cur, source, row)
                if classification == 'prospect' and blocks:
                    raise click.ClickException('Prospect classification blocked: ' + ', '.join(blocks))
                previous = get_review(cur, source, record_id)
                if previous and previous['classification'] == 'customer' and classification != 'customer':
                    raise click.ClickException('Customer downgrade requires a separate approved review.')
                if apply:
                    cur.execute('''INSERT INTO privacy_retention(source,record_id,classification,last_interaction_at,
                        legal_hold,hold_reason,reviewed_at,reviewed_by) VALUES (%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP,%s)
                        ON CONFLICT(source,record_id) DO UPDATE SET classification=EXCLUDED.classification,
                        last_interaction_at=EXCLUDED.last_interaction_at, legal_hold=EXCLUDED.legal_hold,
                        hold_reason=EXCLUDED.hold_reason,reviewed_at=EXCLUDED.reviewed_at,reviewed_by=EXCLUDED.reviewed_by''',
                        (source,record_id,classification,timestamp,hold,reason.strip(),reviewer))
                click.echo(json.dumps({'source':source,'id':record_id,'saved':apply,'deletion_enabled':False}))
        finally:
            conn.close()
