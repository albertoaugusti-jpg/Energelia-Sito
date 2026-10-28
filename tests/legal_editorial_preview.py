"""Local template preview only: no main2, CRM, database, mail or backend imports."""
from test_legal_documents import build_app
app = build_app(preview=True)
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5075, debug=False, use_reloader=False)
