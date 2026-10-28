"""Editorial/publication checks without importing the backend or opening a DB."""
import copy
import re
import sys
import unittest
from pathlib import Path
from flask import Flask, render_template
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from privacy import register_privacy, publication_ready

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = 'life-insurance-website-template'


def build_app(preview=False):
    app = Flask(__name__, template_folder=str(ROOT / 'templates'),
                static_folder=str(ROOT / 'templates' / TEMPLATE), static_url_path='/static')
    app.config.update(TESTING=True, PRIVACY_LEGAL_PREVIEW=preview, PRIVACY_ANALYTICS_ENABLED=False)
    register_privacy(app)
    app.jinja_env.auto_reload = True

    @app.get('/')
    def home():
        return render_template(TEMPLATE + '/legal-unavailable.html')

    @app.get('/<page>')
    def page(page):
        return render_template(TEMPLATE + '/' + page + '.html')

    return app


class LegalDocumentsTest(unittest.TestCase):
    def test_incomplete_documents_are_not_public(self):
        app = build_app()
        for path in ('/privacy-policy', '/cookie-policy', '/legal-base', '/PRIVACY-POLICY'):
            with self.subTest(path=path):
                response = app.test_client().get(path)
                self.assertEqual(response.status_code, 503)
                self.assertIn('info@energelia.it', response.text)
                self.assertNotIn('24 mesi', response.text)
                self.assertNotIn('repository', response.text)
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
                self.assertEqual(response.headers['X-Robots-Tag'], 'noindex, nofollow')

    def test_aliases_cannot_bypass_publication_block(self):
        client = build_app().test_client()
        for name in ('privacy-policy', 'cookie-policy', 'legal-base'):
            for prefix in ('/', '/static/', '/static/./', '/static/partials/../'):
                path = prefix + name + '.html'
                response = client.get(path)
                self.assertEqual(response.status_code, 308)
                self.assertEqual(client.get(path, follow_redirects=True).status_code, 503)

    def test_local_debug_renders_drafts_without_approving_them(self):
        app = build_app()
        app.debug = True  # Same behavior as `python main2.py` in local development.
        client = app.test_client()
        for path in ('/privacy-policy', '/cookie-policy'):
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn('info@energelia.it', response.text)
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
                self.assertEqual(response.headers['X-Robots-Tag'], 'noindex, nofollow')
        self.assertFalse(publication_ready(app.config['PRIVACY_PUBLICATION']))
        app.debug = False
        self.assertEqual(client.get('/privacy-policy').status_code, 503)

    def test_preview_is_only_an_explicit_local_test_setting(self):
        app = build_app(preview=True)
        self.assertEqual(app.test_client().get('/privacy-policy').status_code, 200)
        self.assertEqual(app.test_client().get('/privacy-policy', base_url='https://example.test').status_code, 503)
        app.testing = False
        self.assertEqual(app.test_client().get('/privacy-policy').status_code, 503)

    def test_no_public_audit_or_hypothetical_tracking(self):
        client = build_app(preview=True).test_client()
        forbidden = ('legal-review', 'repository', 'deploy', 'da verificare', 'in revisione',
                     'prima della pubblicazione', 'se configurato', 'se configurata',
                     'il codice', 'non implement', 'bozza', 'G-PNQNJG5LLV', '_ga_PNQNJG5LLV')
        for page in ('privacy-policy', 'cookie-policy'):
            response = client.get('/' + page)
            self.assertEqual(response.status_code, 200)
            text = response.text.lower()
            for phrase in forbidden:
                self.assertNotIn(phrase.lower(), text)
            self.assertIn('info@energelia.it', text)
            self.assertIn('02959030996', text)
            self.assertIn('href="/privacy-policy"', text)
            self.assertIn('href="/cookie-policy"', text)
            self.assertNotRegex(text, r'<script[^>]+src=["\']https://')

    def test_site_scope_and_retention_are_separate(self):
        text = build_app(preview=True).test_client().get('/privacy-policy').text
        self.assertIn('24 mesi dall’ultima interazione significativa', text)
        self.assertIn('non disciplina gli incarichi professionali', text)
        self.assertNotIn('art. 2220', text)
        self.assertNotIn('visure', text)
        self.assertNotIn('crm_lead', text)
        self.assertNotIn('cancellazione automatica', text)
        self.assertIn('Piazza Giacomo Matteotti 2/7, 16123 Genova (GE)', text)

    def test_no_consent_banner_or_superfluous_consent_controls(self):
        text = build_app(preview=True).test_client().get('/cookie-policy').text
        self.assertNotIn('id="cookieConsentBanner"', text)
        self.assertNotIn('id="cookieAcceptBtn"', text)
        self.assertNotIn('id="cookieAnalytics"', text)
        self.assertNotIn('id="cookieSaveBtn"', text)
        self.assertIn('id="cookieResetBtn"', text)
        self.assertIn('Informazioni cookie', text)

    def test_no_default_or_historical_analytics_account(self):
        app = build_app(preview=True)
        app.config['PRIVACY_ANALYTICS_ENABLED'] = True
        self.assertEqual(app.config['PRIVACY_GA_ID'], '')
        text = app.test_client().get('/cookie-policy').text
        self.assertIn('data-analytics="0"', text)
        self.assertNotIn('id="cookieConsentBanner"', text)

    def test_publication_requires_every_mandatory_confirmation(self):
        complete = dict(approved=True, site_services_confirmed=True, prospect_retention_operational=True,
                        site_provider_information='Fixture only: provider information.',
                        transfer_information='Fixture only: transfer information.',
                        technical_retention_information='Fixture only: retention information.',
                        reviewed_by='QA fixture', reviewed_at='2026-10-27')
        self.assertTrue(publication_ready(complete))
        for key in complete:
            incomplete = copy.deepcopy(complete)
            incomplete[key] = False if isinstance(complete[key], bool) else None
            self.assertFalse(publication_ready(incomplete), key)
        app = build_app()
        self.assertFalse(publication_ready(app.config['PRIVACY_PUBLICATION']))
        # A complete explicitly approved fixture may be rendered, including the
        # required information. No real company approval is recorded by this test.
        app.config['PRIVACY_PUBLICATION'] = complete
        html = app.test_client().get('/privacy-policy')
        self.assertEqual(html.status_code, 200)
        self.assertIn(complete['transfer_information'], html.text)
        self.assertIn(complete['technical_retention_information'], html.text)
        self.assertIn(complete['site_provider_information'], html.text)

    def test_public_write_origin_protection_is_preserved(self):
        client = build_app().test_client()
        for route in ('/api/lead', '/api/consultation', '/api/simulatore-fv/lead'):
            self.assertEqual(client.post(route, headers={'Origin':'https://other.test'}).status_code, 403)


if __name__ == '__main__':
    unittest.main()
