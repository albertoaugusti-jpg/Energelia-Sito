"""Public privacy configuration. No database access or external calls."""
import os
import json
import re
from pathlib import Path
from posixpath import normpath
from flask import request, render_template, redirect

POLICY_VERSION = '2026-10-27-v2'
PUBLICATION_FILE = Path(__file__).parent / 'docs/privacy/pubblicazione.json'


def publication_ready(data):
    return (data.get('approved') is True and data.get('site_services_confirmed') is True
            and data.get('prospect_retention_operational') is True
            and all(isinstance(data.get(key), str) and data[key].strip()
                    for key in ('site_provider_information', 'transfer_information',
                                'technical_retention_information', 'reviewed_by', 'reviewed_at')))



def register_privacy(app):
    # Remains off until provider/contracts/transfers and the selected property
    # have been reviewed. Consent alone is not a publication readiness check.
    app.config.setdefault('PRIVACY_ANALYTICS_ENABLED', os.environ.get('PRIVACY_ANALYTICS_ENABLED') == '1')
    # A historical tag is not evidence of company authorization. No default account.
    app.config.setdefault('PRIVACY_GA_ID', '')
    app.config.setdefault('PRIVACY_PUBLICATION', json.loads(PUBLICATION_FILE.read_text()))
    app.config.setdefault('PRIVACY_LEGAL_PREVIEW', False)

    @app.before_request
    def protect_unapproved_documents():
        path = normpath('/' + request.path.lstrip('/')).lower().rstrip('/')
        names = ('privacy-policy', 'cookie-policy', 'legal-base')
        for name in names:
            if path in ('/' + name + '.html', '/static/' + name + '.html'):
                return redirect('/' + name, code=308)
        if path not in tuple('/' + name for name in names):
            return
        # In ordinary local development, the Flask debug app renders the draft
        # documents for review. A Host header alone must never bypass the gate.
        # Gunicorn/production (debug=False) stays blocked until approval.
        local_review = app.debug or (app.testing and app.config['PRIVACY_LEGAL_PREVIEW']
                    and request.host.split(':')[0] in ('localhost', '127.0.0.1'))
        if not publication_ready(app.config['PRIVACY_PUBLICATION']) and not local_review:
            return render_template('life-insurance-website-template/legal-unavailable.html'), 503, {
                'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'}

    @app.before_request
    def protect_public_writes():
        if request.method == 'POST' and request.path in (
                '/api/lead', '/api/consultation', '/api/simulatore-fv/lead', '/api/simulatore-fv/analizza'):
            if (request.headers.get('Origin', request.host_url.rstrip('/')) != request.host_url.rstrip('/')
                    or request.headers.get('Sec-Fetch-Site') == 'cross-site'):
                from flask import abort
                abort(403)

    @app.context_processor
    def privacy_context():
        return {'privacy_version': POLICY_VERSION,
                'privacy_analytics_enabled': bool(app.config['PRIVACY_ANALYTICS_ENABLED']
                    and re.fullmatch(r'G-[A-Z0-9]+', app.config['PRIVACY_GA_ID'])),
                'privacy_site_providers': app.config['PRIVACY_PUBLICATION'].get('site_provider_information') or '',
                'privacy_transfer_information': app.config['PRIVACY_PUBLICATION'].get('transfer_information') or '',
                'privacy_technical_retention': app.config['PRIVACY_PUBLICATION'].get('technical_retention_information') or '',
                'privacy_ga_id': app.config['PRIVACY_GA_ID']}

    @app.after_request
    def privacy_headers(response):
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        if request.path.startswith(('/crm', '/api/admin', '/forzasamp')):
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Robots-Tag'] = 'noindex, nofollow'
        # Drafts may be inspected during development, but must not be cached
        # or indexed before the company approves all publication facts.
        if request.path.lower().rstrip('/') in ('/privacy-policy', '/cookie-policy', '/legal-base') \
                and not publication_ready(app.config['PRIVACY_PUBLICATION']):
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Robots-Tag'] = 'noindex, nofollow'
        return response
