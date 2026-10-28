"""Isolated real app for browser checks. Requires the explicit localhost test DSN."""
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from digital_test_support import load_app, connect
main = load_app()
# Iterative browser checks must render current templates rather than cached HTML.
main.app.config['TEMPLATES_AUTO_RELOAD'] = True
main.app.jinja_env.auto_reload = True
from crm import SessionLocale, Utente, hash_pw
user = SessionLocale.query(Utente).filter_by(email='digital-admin@example.test').first()
if not user:
    user = Utente(nome='Amministratore QA', email='digital-admin@example.test', ruolo='admin', password_hash=hash_pw('digital-test-password'))
    SessionLocale.add(user)
else:
    user.password_hash = hash_pw('digital-test-password')
SessionLocale.commit()
SessionLocale.remove()
with connect() as conn:
    with conn.cursor() as cur:
        cur.execute('TRUNCATE digital_project_requests RESTART IDENTITY')
        cur.execute("""INSERT INTO digital_project_requests(name,email,phone,service,category,message,status,notification_status)
            VALUES ('Studio Aurora','aurora@example.test','+39 010 1234567','sito','sito','Vorremmo un nuovo sito per raccontare i nostri servizi.','da-contattare','non-configurata'),
                   ('Officina Levante','levante@example.test','','gestionale','gestionale','Vorremmo coordinare attività e interventi in un unico posto.','in-confronto','non-configurata')""")
with patch.object(main.smtplib, 'SMTP', side_effect=AssertionError('SMTP disabled in browser QA')):
    main.app.run(host='127.0.0.1', port=5057, debug=False, use_reloader=False)
