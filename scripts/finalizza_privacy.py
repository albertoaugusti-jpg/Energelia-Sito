#!/usr/bin/env python3
"""Optional local company sign-off. Explicit interactive user attestations only."""
from pathlib import Path
from datetime import datetime,timezone
import json,shutil,sys,tempfile,os

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/'docs/privacy/pubblicazione.json'
REQUIRED_TEXT=('site_provider_information','transfer_information','technical_retention_information')


def main():
    if not FILE.exists(): print('Registro privacy non trovato');return 2
    data=json.loads(FILE.read_text(encoding='utf-8'))
    print('STATO DI PUBBLICAZIONE PRIVACY')
    for key in ('site_services_confirmed',*REQUIRED_TEXT,'prospect_retention_operational','approved','reviewed_by','reviewed_at'):
        value=data.get(key)
        print(('OK     ' if (value is True if isinstance(value,bool) else bool(value)) else 'MANCA  ') +key)
    if '--approva' not in sys.argv:
        print('\nSolo lettura. Per un ATTO AZIENDALE esplicito: python3 scripts/finalizza_privacy.py --approva')
        return 0
    if not all(isinstance(data.get(k),str) and data[k].strip() for k in REQUIRED_TEXT):
        print('BLOCCATO: informative incomplete');return 1
    # No assumptions that reading a policy or installing a panel equals adopting it.
    print('\nPer proseguire devi essere autorizzato a dichiarare queste condizioni per Energelia:')
    statements=[
       'La Direzione ha verificato e approvato il testo finale delle due informative e le informazioni sui fornitori/trasferimenti; i rapporti applicabili sono stati esaminati.',
       'Energelia ha assegnato internamente la revisione periodica dei prospect a una funzione aziendale e adottera il controllo mensile, inclusa la gestione delle copie, registrando gli esiti.',
       'E stato verificato che nessun tracciamento non tecnico venga caricato senza il consenso appropriato e che i collegamenti alle informative funzionino.'
    ]
    for i, statement in enumerate(statements,1):
        print(f'{i}. {statement}')
        reply=input('   Scrivi CONFERMO per attestarlo, altro per annullare: ').strip()
        if reply!='CONFERMO':
            print('Annullato: nessun dato modificato.');return 1
    who=input('Funzione aziendale che approva (es. Direzione Energelia): ').strip()
    if not 3<=len(who)<=120:
        print('Attestazione non registrata: funzione aziendale non valida');return 1
    stamp=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    dest=dict(data,approved=True,site_services_confirmed=True,prospect_retention_operational=True,
              reviewed_by=who,reviewed_at=stamp)
    backup=ROOT/'docs/privacy'/('pubblicazione.backup-'+stamp.replace(':','-')+'.json')
    shutil.copy2(FILE,backup)
    with tempfile.NamedTemporaryFile('w',encoding='utf-8',delete=False,dir=FILE.parent) as output:
        output.write(json.dumps(dest,ensure_ascii=False,indent=2)+'\n');tmp=output.name
    try:os.replace(tmp,FILE)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    print('Approvazione aziendale registrata; backup:',backup)
    print('Prima del deploy: esegui python3 scripts/check_privacy_predeploy.py e riavvia Flask.')
    return 0
if __name__=='__main__':raise SystemExit(main())
