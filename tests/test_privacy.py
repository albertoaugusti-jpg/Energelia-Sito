"""Privacy regression checks using only the guarded, synthetic PostgreSQL DB."""
import json
import re
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from psycopg2.extras import RealDictCursor
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from digital_test_support import load_app, connect
from retention import retention_report, get_review, digital_interaction
main = load_app()


class PrivacyTest(unittest.TestCase):
    def setUp(self):
        self.client = main.app.test_client()
        main.app.config['PRIVACY_ANALYTICS_ENABLED'] = False
        main.app.config['PRIVACY_LEGAL_PREVIEW'] = True
        with connect() as conn, conn.cursor() as cur:
            cur.execute('TRUNCATE privacy_retention,simulazioni_fv,leads,consultations,digital_project_requests RESTART IDENTITY')
        self.notify = patch.object(main, 'notify_new_lead')
        self.mock_notify = self.notify.start()
        self.addCleanup(self.notify.stop)
        self.http = patch('requests.sessions.Session.request', side_effect=AssertionError('HTTP forbidden'))
        self.http.start(); self.addCleanup(self.http.stop)
        self.smtp = patch('smtplib.SMTP', side_effect=AssertionError('SMTP forbidden'))
        self.smtp.start(); self.addCleanup(self.smtp.stop)

    def row(self, sql, args=()):
        with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchone()

    def test_public_routes_no_tracking_and_real_legal_links(self):
        root = Path(main.app.static_folder)
        pages = [p.stem for p in root.glob('*.html') if p.stem not in ('legal-base', 'legal-unavailable')]
        for page in pages:
            with self.subTest(page=page):
                response = self.client.get('/' + page)
                self.assertEqual(response.status_code, 200)
                self.assertNotRegex(response.text, r'<script[^>]+src=["\']https://www.googletagmanager')
                self.assertNotIn("gtag('config'", response.text)
                self.assertEqual(response.text.count('id="cookieConsentBanner"'), 0)
                self.assertIn('href="/privacy-policy"', response.text)
                self.assertIn('href="/cookie-policy"', response.text)
                self.assertIn('data-cookie-preferences', response.text)
                self.assertNotRegex(response.text, r'href=["\']#["\']>\s*(Privacy|Cookie|Termini)')
        self.assertNotIn('gtag', self.client.get('/forzasamp').text)
        self.assertNotIn('privacy-consent.js', self.client.get('/crm/').text)

    def test_policy_aliases_and_publication_block(self):
        for route in ('privacy-policy','cookie-policy'):
            self.assertEqual(self.client.get('/'+route+'.html').status_code,308)
            response=self.client.get('/'+route)
            self.assertNotIn('Testo in revisione',response.text)
            self.assertNotIn('legal-review',response.text)
            self.assertIn('info@energelia.it',response.text)
        self.assertIn('non sono attivi', self.client.get('/cookie-policy').text)
        main.app.config['PRIVACY_LEGAL_PREVIEW'] = False
        self.assertEqual(self.client.get('/privacy-policy').status_code, 503)
        self.assertEqual(self.client.get('/cookie-policy').status_code, 503)

    def test_no_fake_collection_or_embedded_media(self):
        for page in ('contact','Finanza','EGE','Certificazione RLS','Parità di genere','italbandi-ai'):
            html=self.client.get('/'+page).text
            self.assertNotRegex(html, r'<form[^>]*(newsletter|domandaForm|callBookingForm|waitlist)')
            self.assertNotIn('Sei iscritto!',html)
            self.assertIn('mailto:info@energelia.it',html)
        html=self.client.get('/chi-siamo').text
        self.assertNotIn('<iframe',html)
        self.assertIn('https://www.youtube.com/watch',html)

    def test_band_report_contact_persists_without_cookie_consent(self):
        response=self.client.post('/api/lead',json={'email':'privacy-report@example.test','phone':'0101234567','bando':'resto_sud'})
        self.assertEqual(response.status_code,200)
        row=self.row("SELECT * FROM privacy_retention WHERE source='leads'")
        self.assertEqual(row['classification'],'prospect')
        self.assertIsNotNone(row['last_interaction_at'])
        self.mock_notify.assert_called_once()

    def test_consultation_records_interaction_only_after_commit(self):
        response=self.client.post('/api/consultation',json={'email':'privacy-consult@example.test','phone':'0101234567'})
        self.assertEqual(response.status_code,200)
        self.assertIsNotNone(self.row("SELECT * FROM privacy_retention WHERE source='consultations'"))
        with patch.object(main,'get_db_connection',side_effect=RuntimeError('private database credentials')):
            self.mock_notify.reset_mock()
            response=self.client.post('/api/consultation',json={'email':'privacy-consult@example.test','phone':'0101234567'})
            self.assertEqual(response.status_code,500)
            self.assertNotIn('private database',response.text)
            self.mock_notify.assert_not_called()

    def test_simulator_manual_analysis_does_not_store_contact(self):
        import simulatore_fv
        with patch.object(simulatore_fv,'cerca_bandi_correlati',return_value=[]):
            response=self.client.post('/api/simulatore-fv/analizza',data={'consumo_annuo_kwh':'29000','spesa_annua_eur':'9700','potenza_impegnata_kw':'30','provincia':'GE'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.row('SELECT COUNT(*) AS n FROM simulazioni_fv')['n'],0)
        response=self.client.post('/api/simulatore-fv/lead',json={'email':'privacy-fv@example.test','phone':'','simulazione':response.json})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.row('SELECT COUNT(*) AS n FROM simulazioni_fv')['n'],1)
        self.assertIsNotNone(self.row("SELECT * FROM privacy_retention WHERE source='leads'"))

    def test_admin_fixed_token_and_cross_session_access_denied(self):
        self.assertEqual(self.client.get('/api/admin/leads',headers={'Authorization':'Bearer admin_authenticated'}).status_code,401)
        self.assertEqual(self.client.get('/forzasamp/dashboard').status_code,302)
        response=self.client.post('/api/admin/login',json={'password':main.ADMIN_PASSWORD})
        self.assertEqual(response.status_code,200)
        token=response.json['token']
        self.assertNotEqual(token,'admin_authenticated')
        headers={'Authorization':'Bearer '+token}
        self.assertEqual(self.client.get('/api/admin/leads',headers=headers).status_code,200)
        self.assertEqual(main.app.test_client().get('/api/admin/leads',headers=headers).status_code,401)
        response=self.client.get('/api/admin/leads',headers=headers)
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        self.client.post('/api/admin/logout',headers=headers)
        self.assertEqual(self.client.get('/api/admin/leads',headers=headers).status_code,401)

    def test_admin_csrf_and_missing_password(self):
        self.assertEqual(self.client.post('/api/admin/login',json={'password':main.ADMIN_PASSWORD},headers={'Origin':'https://other.example'}).status_code,403)
        with patch.object(main,'ADMIN_PASSWORD',''):
            self.assertEqual(self.client.post('/api/admin/login',json={'password':''}).status_code,401)

    def test_crm_untrusted_text_is_escaped_in_named_templates(self):
        from crm import env
        html = env.get_template('login').render(errore='<script>stealContacts()</script>')
        self.assertNotIn('<script>stealContacts()</script>', html)
        self.assertIn('&lt;script&gt;stealContacts()', html)

    def test_retention_historical_unknown_and_no_destructive_command(self):
        with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("INSERT INTO consultations(email,phone,created_at) VALUES ('historical@example.test','0101234567','2020-01-01') RETURNING id")
            id=cur.fetchone()['id']
            report=retention_report(cur)
        item=next(r for r in report['records'] if r['source']=='consultations' and r['id']==id)
        self.assertEqual(item['state'],'blocked')
        self.assertIn('history_needs_review',item['blocks'])
        self.assertIsNone(item['last_interaction_at'])
        self.assertFalse(report['deletion_enabled'])
        self.assertNotIn('privacy-retention-delete',main.app.cli.commands)

    def test_retention_due_hold_and_customer(self):
        self.client.post('/api/consultation',json={'email':'retention@example.test','phone':'0101234567'})
        with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("UPDATE privacy_retention SET last_interaction_at=CURRENT_TIMESTAMP - INTERVAL '25 months' WHERE source='consultations'")
            item=next(r for r in retention_report(cur)['records'] if r['source']=='consultations')
            self.assertEqual(item['state'],'due_for_review')
            cur.execute("UPDATE privacy_retention SET legal_hold=TRUE WHERE source='consultations'")
            item=next(r for r in retention_report(cur)['records'] if r['source']=='consultations')
            self.assertIn('legal_hold',item['blocks'])
            cur.execute("UPDATE privacy_retention SET legal_hold=FALSE,classification='customer' WHERE source='consultations'")
            item=next(r for r in retention_report(cur)['records'] if r['source']=='consultations')
            self.assertIn('customer',item['blocks'])

    def test_retention_technical_update_does_not_extend_date(self):
        with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("INSERT INTO digital_project_requests(name,email,service,message) VALUES ('QA','qa@example.test','sito','Progetto di prova') RETURNING id")
            id=cur.fetchone()['id']
            from retention import record_new_contact
            record_new_contact(cur,'digital_project_requests',id)
            cur.execute("UPDATE privacy_retention SET last_interaction_at='2024-01-01' WHERE record_id=%s",(id,))
            digital_interaction(cur,id,False,False)
            self.assertEqual(get_review(cur,'digital_project_requests',id)['last_interaction_at'].year,2024)
            digital_interaction(cur,id,True,True)
            row=get_review(cur,'digital_project_requests',id)
            self.assertEqual(row['classification'],'customer')
            self.assertGreater(row['last_interaction_at'].year,2024)
            digital_interaction(cur,id,False,False)
            self.assertEqual(get_review(cur,'digital_project_requests',id)['classification'],'customer')

    def test_retention_cli_is_readonly_by_default(self):
        self.client.post('/api/consultation',json={'email':'review@example.test','phone':'0101234567'})
        args=['privacy-retention-review','--source','consultations','--record-id','1','--classification','prospect','--last-interaction','2023-10-27T10:00:00Z','--no-hold','--reviewer','QA']
        runner=main.app.test_cli_runner()
        result=runner.invoke(args=args)
        self.assertEqual(result.exit_code,0,result.output)
        self.assertFalse(json.loads(result.output)['saved'])
        self.assertNotEqual(self.row("SELECT * FROM privacy_retention WHERE source='consultations'")['last_interaction_at'].year,2023)
        result=runner.invoke(args=args+['--apply'])
        self.assertEqual(result.exit_code,0,result.output)
        self.assertTrue(json.loads(result.output)['saved'])
        report=runner.invoke(args=['privacy-retention-report'])
        self.assertEqual(report.exit_code,0,report.output)
        self.assertNotIn('review@example.test',report.output)


if __name__=='__main__': unittest.main()
