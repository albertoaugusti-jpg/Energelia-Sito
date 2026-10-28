"""Safety gate shared by isolated tests and browser QA; never reads DATABASE_URL."""
import os
from urllib.parse import urlparse
from pathlib import Path
import psycopg2

ROOT = Path(__file__).resolve().parents[1]


def test_dsn():
    value = os.environ.get('DIGITAL_TEST_DATABASE_URL', '')
    parsed = urlparse(value)
    if (parsed.scheme not in ('postgresql', 'postgres') or parsed.query or parsed.fragment
            or parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.path != '/energelia_digital_test'):
        raise RuntimeError('Set DIGITAL_TEST_DATABASE_URL to a LOCAL PostgreSQL database named energelia_digital_test.')
    if str(parsed.port) != '55439':
        raise RuntimeError('Test PostgreSQL must use isolated port 55439.')
    return value


def connect():
    return psycopg2.connect(test_dsn())


def prepare_environment():
    dsn = test_dsn()
    # All production-facing config is replaced BEFORE importing the real app.
    os.environ['DATABASE_URL'] = dsn
    os.environ['CRM_SECRET_KEY'] = 'digital-test-only-unguessable-session-key'
    os.environ['ADMIN_PASSWORD'] = 'digital-test-password'
    os.environ['CRM_ADMIN_EMAIL'] = 'digital-admin@example.test'
    os.environ['CRM_ADMIN_PASSWORD'] = 'digital-test-password'
    os.environ['DIGITAL_PROJECT_FORM_ENABLED'] = '1'
    os.environ['DIGITAL_NOTIFICATION_RECOVERY_ENABLED'] = '0'
    os.environ['SESSION_COOKIE_SECURE'] = '0'
    os.environ['PRIVACY_ANALYTICS_ENABLED'] = '0'
    for name in ('ANTHROPIC_API_KEY', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CLIENT_SECRET'):
        os.environ[name] = ''
    for name in ('DIGITAL_RESEND_API_KEY', 'DIGITAL_NOTIFY_FROM', 'SMTP_USER', 'SMTP_PASS', 'DIGITAL_NOTIFY_TO', 'RESEND_API_KEY', 'TWILIO_AUTH_TOKEN'):
        os.environ[name] = ''


def load_app():
    prepare_environment()
    import main2
    main2.app.config.update(TESTING=True)
    return main2
