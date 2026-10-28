#!/usr/bin/env python3
"""Read-only privacy pre-deploy checklist; never changes accounts or database."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    from privacy import PUBLICATION_FILE, publication_ready
    if not PUBLICATION_FILE.is_file():
        print('BLOCCATO: manca docs/privacy/pubblicazione.json')
        return 1
    try:
        data = json.loads(PUBLICATION_FILE.read_text(encoding='utf-8'))
    except (ValueError, OSError) as e:
        print('BLOCCATO: registro privacy non leggibile:', e)
        return 1
    fields = {
        'site_services_confirmed': 'Fornitori attivi verificati',
        'site_provider_information': 'Destinatari/fornitori per il sito',
        'transfer_information': 'Trasferimenti extra-SEE e garanzie applicabili',
        'technical_retention_information': 'Tempi/criteri di conservazione tecnica',
        'prospect_retention_operational': 'Procedura prospect presa in carico e operativa',
        'approved': 'Approvazione aziendale del testo finale',
        'reviewed_by': 'Revisore aziendale identificato',
        'reviewed_at': 'Data di approvazione',
    }
    print('Controllo informativo privacy (senza rete, DB o modifiche):')
    for key, label in fields.items():
        if key in ('site_services_confirmed', 'prospect_retention_operational', 'approved'):
            present = data.get(key) is True
        else:
            present = isinstance(data.get(key), str) and bool(data[key].strip())
        print(('OK     ' if present else 'MANCA  ') + label)
    ready = publication_ready(data)
    print('\n' + ('REGISTRO COMPLETO: eseguire comunque verifica umana e QA finale.'
                   if ready else 'BLOCCATO PER DEPLOY: completare le voci mancanti prima del rilascio.'))
    return 0 if ready else 1


if __name__ == '__main__':
    raise SystemExit(main())
