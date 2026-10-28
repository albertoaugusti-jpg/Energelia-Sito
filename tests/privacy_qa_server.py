"""Real Flask routes, isolated local test DB; all outbound requests/email forbidden."""
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from digital_test_support import load_app
main = load_app()
main.app.jinja_env.auto_reload = True
main.app.config['PRIVACY_LEGAL_PREVIEW'] = True
main.app.config['PRIVACY_GA_ID'] = 'G-ENERGELIATEST'
analytics = '--analytics' in sys.argv
main.app.config['PRIVACY_ANALYTICS_ENABLED'] = analytics
with patch('requests.sessions.Session.request', side_effect=AssertionError('Outbound HTTP forbidden in privacy QA')), \
     patch('smtplib.SMTP', side_effect=AssertionError('SMTP forbidden in privacy QA')), \
     patch.object(main.feedparser, 'parse', return_value=type('Feed', (), {'entries': []})()):
    main.app.run(host='127.0.0.1', port=5059 if analytics else 5058, debug=False, use_reloader=False)
