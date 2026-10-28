/* Energelia automation laboratories 13–15. All state is transient and remains in the browser. */
(() => {
  'use strict';
  const $=(root,sel)=>root.querySelector(sel), $$=(root,sel)=>[...root.querySelectorAll(sel)];
  const write=(root,sel,val)=>{const n=$(root,sel);if(n)n.textContent=String(val)};
  const visible=(root,sel,yes)=>{const n=$(root,sel);if(n)n.hidden=!yes};
  const prefersReduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad=n=>String(n).padStart(2,'0');
  const fmtDate=d=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'long',year:'numeric'}).format(d);
  const safe=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function flow(root){
    const progress=root.closest('.uc-detail-main')?.querySelector('[data-uc-progress]');
    return n=>{root.dataset.uaStep=String(n);if(!progress)return;
      progress.style.setProperty('--uc-progress-fraction',String((n-1)/2));
      progress.querySelectorAll('[data-uc-step]').forEach((el,i)=>{
        el.classList.toggle('is-current',i===n-1);el.classList.toggle('is-complete',i<n-1);
        if(i===n-1)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
      });
    };
  }
  // View changes may reframe the beginning of the app; status changes must not jump.
  const alignApp=root=>{if(!matchMedia('(max-width:810px)').matches)return;
    requestAnimationFrame(()=>{const rect=root.getBoundingClientRect();
      if(rect.top < -15 || rect.top > innerHeight-90){
        scrollTo({top:Math.max(0,scrollY+rect.top-12),behavior:'instant'});
      }
    });
  };
  // 13 — real local parsing of labelled TEXT, never described as OCR/AI.
  // The demo never transmits uploaded content or stores it beyond this page.
  function initJob(root){
    const step=flow(root),tabs=$$(root,'[data-ua-job-tab]');
    const source=$(root,'[data-ua-job-content]'),upload=$(root,'[data-ua-job-file]');
    const form=$(root,'[data-ua-job-form]');
    const samples={
      order:{title:'ORDINE LAVORI',text:[
        'ORDINE LAVORI — Rif. 318',
        'Cliente: Bottega del Porto S.r.l.',
        'Intervento: Installazione climatizzazione punto vendita',
        'Indirizzo: Via XX Settembre 42, Genova',
        'Importo: € 2.750,00',
        'Data prevista: 12/11/2026',
        'Note: Sopralluogo già effettuato.'
      ].join('\n')},
      quote:{title:'PREVENTIVO ACCETTATO',text:[
        'PREVENTIVO ACCETTATO — Rif. 512',
        'Ragione sociale: Studio Delta',
        'Oggetto: Sostituzione unità di ventilazione',
        'Sede intervento: Via Roma 18, Savona',
        'Totale: EUR 1.460,00',
        'Data intervento: 27/11/2026',
        'Note: Accesso alla sede dalle 09:00.'
      ].join('\n')}
    };
    let phase='document',sample='order',created=false;
    const fields={};$$ (form,'[data-ua-job-field]').forEach(input=>fields[input.dataset.uaJobField]=input);
    const notice=t=>write(root,'[data-ua-job-msg]',t);
    const setView=(name,reframe=false)=>{
      if(name==='fields' && phase==='document')return;
      if(name==='created' && !created)return;
      root.dataset.uaMobileView=name;
      tabs.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.uaJobTab===name)));
      if(reframe)alignApp(root);
    };
    const updateTabs=()=>{
      tabs.find(b=>b.dataset.uaJobTab==='fields').disabled=phase==='document';
      tabs.find(b=>b.dataset.uaJobTab==='created').disabled=!created;
    };
    const chooseSample=(key)=>{
      if(!samples[key])return;
      sample=key;
      source.value=samples[key].text;
      write(root,'[data-ua-job-paper-type]',samples[key].title);
      write(root,'[data-ua-job-paper-title]',key==='order'?'Ordine lavori ricevuto':'Preventivo confermato');
      upload.value='';write(root,'[data-ua-job-file-name]','Facoltativo · max 150 KB e 3.500 caratteri');
      $$(root,'[data-ua-job-example]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uaJobExample===key)));
      write(root,'[data-ua-job-paper-text]',source.value);
      invalidate(false);
    };
    const invalidate=(inform=true)=>{
      phase='document';created=false;
      visible(root,'[data-ua-job-empty]',true);
      visible(root,'[data-ua-job-extracted]',false);
      visible(root,'[data-ua-job-created]',false);
      visible(root,'[data-ua-job-error]',false);
      visible(root,'[data-ua-job-field-error]',false);
      write(root,'[data-ua-job-chip]','In attesa');
      write(root,'[data-ua-job-side-heading]','Dati da verificare');
      write(root,'[data-ua-job-status]','Documento pronto per la lettura');
      write(root,'[data-ua-job-count]','0 pratiche create');
      updateTabs();setView('document');step(1);
      if(inform)notice('Testo modificato: riconosci di nuovo i dati per aggiornare la pratica.');
    };
    const readLine=(text,labels)=>{
      const matches=text.split(/\r?\n/);
      for(const line of matches){
        const pos=line.indexOf(':');if(pos<0)continue;
        const key=line.slice(0,pos).replace(/\s+/g,' ').trim().toLocaleLowerCase('it-IT');
        if(labels.includes(key))return line.slice(pos+1).trim().slice(0,280);
      }
      return '';
    };
    const numberFrom=(raw)=>{
      const match=raw.match(/\d[\d.,\s]*\d|\d/);if(!match)return '';
      let v=match[0].replace(/\s/g,'');
      if(v.includes(',')&&v.includes('.'))v=v.replace(/\./g,'').replace(',','.');
      else if(v.includes(','))v=v.replace(',','.');
      else if(/\d\.\d{3}(?:\.|$)/.test(v))v=v.replace(/\./g,'');
      const num=Number(v);return Number.isFinite(num)&&num>=0&&num<=10000000?num.toFixed(2):'';
    };
    const dateFrom=(raw)=>{
      const match=raw.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})\b/);
      if(match){const y=Number(match[3]),m=Number(match[2]),d=Number(match[1]);
        const dt=new Date(Date.UTC(y,m-1,d));
        if(dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d)return `${match[3]}-${match[2]}-${match[1]}`;
      }
      const iso=raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if(iso){const dt=new Date(`${iso[0]}T12:00:00Z`);if(!Number.isNaN(dt.valueOf())&&dt.toISOString().slice(0,10)===iso[0])return iso[0];}
      return '';
    };
    const parse=(text)=>{
      const find=labels=>readLine(text,labels);
      return {
        client:find(['cliente','ragione sociale','azienda','committente','intestatario']),
        activity:find(['intervento','oggetto','lavori','attività','attivita','descrizione']),
        address:find(['indirizzo','sede intervento','luogo','cantiere']),
        amount:numberFrom(find(['importo','totale','totale previsto','valore','prezzo'])),
        date:dateFrom(find(['data prevista','data intervento','data','consegna prevista','inizio lavori'])),
        notes:find(['note','annotazioni','indicazioni'])
      };
    };
    source.addEventListener('input',()=>{
      write(root,'[data-ua-job-paper-text]',source.value);
      write(root,'[data-ua-job-paper-type]','TESTO MODIFICATO');
      invalidate();
    });
    $$(root,'[data-ua-job-example]').forEach(b=>b.addEventListener('click',()=>{chooseSample(b.dataset.uaJobExample);notice('Documento di esempio selezionato. Puoi analizzarlo oppure modificare il testo.');}));
    upload.addEventListener('change',async()=>{
      const f=upload.files&&upload.files[0];if(!f)return;
      if(f.size>150*1024||!/\.txt$/i.test(f.name)){
        write(root,'[data-ua-job-error]','Sono accettati solo file .txt fino a 150 KB e 3.500 caratteri. PDF e immagini richiedono un lettore dedicato.');
        visible(root,'[data-ua-job-error]',true);upload.value='';return;
      }
      try{
        const text=await f.text();if(text.length>3500){throw new Error('Il testo contiene più di 3.500 caratteri.');}
        source.value=text;write(root,'[data-ua-job-paper-type]','TESTO IMPORTATO');
        write(root,'[data-ua-job-paper-title]',f.name.slice(0,70));
        write(root,'[data-ua-job-paper-text]',text);
        write(root,'[data-ua-job-file-name]',f.name.slice(0,90));
        $$(root,'[data-ua-job-example]').forEach(b=>b.setAttribute('aria-pressed','false'));
        invalidate();notice('File TXT letto localmente: verifica il testo e riconosci i dati.');
      }catch(e){write(root,'[data-ua-job-error]',e.message||'File non leggibile.');visible(root,'[data-ua-job-error]',true);upload.value='';}
    });
    $(root,'[data-ua-job-analyze]').addEventListener('click',()=>{
      const text=source.value.trim();if(text.length<20){
        write(root,'[data-ua-job-error]','Inserisci un testo di almeno 20 caratteri con etichette come Cliente:, Intervento:, Importo: e Data prevista:.');
        visible(root,'[data-ua-job-error]',true);return;
      }
      const data=parse(text);
      Object.entries(fields).forEach(([key,input])=>{input.value=(data[key]||'').slice(0,input.maxLength>0?input.maxLength:10000);});
      const found=['client','activity','address','amount','date'].filter(k=>Boolean(data[k])).length;
      write(root,'[data-ua-job-found]',`${found} di 5 campi individuati automaticamente`);
      visible(root,'[data-ua-job-error]',false);
      visible(root,'[data-ua-job-field-error]',false);
      visible(root,'[data-ua-job-empty]',false);
      visible(root,'[data-ua-job-created]',false);
      visible(root,'[data-ua-job-extracted]',true);
      phase='fields';created=false;step(2);
      write(root,'[data-ua-job-chip]','Da verificare');
      write(root,'[data-ua-job-side-heading]','Controlla i campi');
      write(root,'[data-ua-job-status]','Dati proposti · verifica richiesta');
      updateTabs();setView('fields',true);
      notice('Controlla i campi proposti, completa quelli mancanti e crea la pratica.');
    });
    form.addEventListener('submit',e=>{
      e.preventDefault();if(phase==='document')return;
      if(!form.checkValidity()||!fields.client.value.trim()||!fields.activity.value.trim()){
        visible(root,'[data-ua-job-field-error]',true);form.reportValidity();return;
      }
      visible(root,'[data-ua-job-field-error]',false);
      const dateText=fields.date.value?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(fields.date.value+'T12:00:00Z')):'—';
      const data={client:fields.client.value.trim(),activity:fields.activity.value.trim(),address:fields.address.value.trim()||'Non specificato',amount:new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(fields.amount.value)),date:dateText,notes:fields.notes.value.trim()||'Nessuna nota'};
      Object.entries(data).forEach(([key,val])=>write(root,`[data-ua-job-result="${key}"]`,val));
      created=true;phase='created';step(3);
      visible(root,'[data-ua-job-extracted]',false);visible(root,'[data-ua-job-created]',true);
      write(root,'[data-ua-job-chip]','Creata');write(root,'[data-ua-job-side-heading]','Pratica n. 4318');
      write(root,'[data-ua-job-count]','1 pratica creata');write(root,'[data-ua-job-status]','Pratica creata dai dati verificati');
      updateTabs();setView('created',true);
      notice('Per correggere i dati usa «Correggi i dati importati», oppure ricomincia la prova.');
    });
    $(root,'[data-ua-job-revise]').addEventListener('click',()=>{
      phase='fields';created=false;step(2);
      visible(root,'[data-ua-job-extracted]',true);visible(root,'[data-ua-job-created]',false);
      write(root,'[data-ua-job-chip]','Da verificare');write(root,'[data-ua-job-side-heading]','Controlla i campi');
      write(root,'[data-ua-job-status]','Correggi i dati della pratica');
      write(root,'[data-ua-job-count]','0 pratiche create');
      updateTabs();setView('fields',true);
      notice('Verifica i campi modificati e conferma per aggiornare la pratica.');
    });
    tabs.forEach(b=>b.addEventListener('click',()=>{if(!b.disabled)setView(b.dataset.uaJobTab,true);}));
    $(root,'[data-ua-job-reset]').addEventListener('click',()=>{
      chooseSample('order');form.reset();phase='document';updateTabs();setView('document',true);
      notice('Demo ripristinata: scegli un documento oppure modifica il testo di esempio.');
    });
    chooseSample('order');updateTabs();setView('document');step(1);
  }
  // 14 — explicit rule -> prepared messages -> simulated send; no external messaging.
  function initReminder(root){
    const step=flow(root),days=$(root,'[data-ua-reminder-days]'),message=$(root,'[data-ua-reminder-text]');
    const views=$$(root,'[data-ua-reminder-view-button]');
    const check=$(root,'[data-ua-reminder-check]'),send=$(root,'[data-ua-reminder-send]'),error=$(root,'[data-ua-reminder-error]');
    const people=[['Elisa Rinaldi',2],['Davide Costa',5],['Chiara Neri',11],['Paolo Venturi',24]];
    const base=new Date();base.setHours(12,0,0,0);
    const dateFor=n=>{const d=new Date(base);d.setDate(d.getDate()+n);return d;};
    let phase='rule',prepared=0,sent=0;
    const eligible=()=>people.filter(p=>p[1]<=Number(days.value));
    const syncCounters=()=>{
      write(root,'[data-ua-reminder-count-days]',days.value+' GIORNI');
      write(root,'[data-ua-reminder-count-eligible]',eligible().length);
      write(root,'[data-ua-reminder-count-prepared]',prepared);
      write(root,'[data-ua-reminder-count-sent]',sent);
    };
    const setView=(name,reframe=false)=>{
      if(name==='results'&&phase==='rule')return;
      root.dataset.uaMobileView=name;
      views.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.uaReminderViewButton===name)));
      if(reframe)alignApp(root);
    };
    const allowResults=allowed=>{$ (root,'[data-ua-reminder-view-button="results"]').disabled=!allowed;};
    const clear=()=>{
      phase='rule';prepared=0;sent=0;
      visible(root,'[data-ua-reminder-ready]',false);visible(root,'[data-ua-reminder-empty]',true);
      visible(root,'[data-ua-reminder-sent]',false);
      $ (root,'[data-ua-reminder-list]').replaceChildren();
      $ (root,'[data-ua-reminder-generated]').replaceChildren();
      write(root,'[data-ua-reminder-chip]','Da preparare');
      const stageTab=$(root,'[data-ua-reminder-view-button="results"]');stageTab.innerHTML='<span>2</span> Messaggi';
      write(root,'[data-ua-reminder-stage-label]','PASSAGGIO 2 · ANTEPRIMA');
      write(root,'[data-ua-reminder-results-heading]','Messaggi da inviare');
      send.hidden=false;allowResults(false);syncCounters();step(1);
      setView('rule');
    };
    days.addEventListener('change',()=>{const was=phase;clear();if(was!=='rule')write(root,'[data-ua-reminder-msg]','Regola modificata: prepara nuovamente i messaggi.');});
    message.addEventListener('input',()=>{const was=phase;clear();if(was!=='rule')write(root,'[data-ua-reminder-msg]','Testo modificato: prepara nuovamente i messaggi.');error.hidden=true;});
    check.addEventListener('click',()=>{
      const template=message.value.trim();
      if(template.length<10){error.hidden=false;message.focus();return;}
      error.hidden=true;const list=eligible(),peopleList=$(root,'[data-ua-reminder-list]'),cards=$(root,'[data-ua-reminder-generated]');
      peopleList.replaceChildren();cards.replaceChildren();
      list.forEach(([name,left])=>{
        const contact=document.createElement('div');contact.className='ua-expiry-row';
        contact.innerHTML=`<span class="ua-expiry-avatar">${safe(name.split(' ').map(x=>x[0]).join(''))}</span><div><strong>${safe(name)}</strong><small>Scade il ${safe(fmtDate(dateFor(left)))}</small></div><b class="ua-expiry-yes">In scadenza</b>`;
        peopleList.append(contact);
        const content=template.replaceAll('{nome}',name.split(' ')[0]).replaceAll('{data}',fmtDate(dateFor(left)));
        const card=document.createElement('article');card.className='ua-message-card';
        const chip=document.createElement('span');chip.dataset.uaReminderCardStatus='';chip.textContent='PRONTO PER '+name.toUpperCase();
        const copy=document.createElement('p');copy.textContent=content;card.append(chip,copy);cards.append(card);
      });
      prepared=list.length;sent=0;phase='prepared';syncCounters();
      write(root,'[data-ua-reminder-audience-count]',`${list.length} ${list.length===1?'cliente':'clienti'}`);
      write(root,'[data-ua-reminder-chip]','Pronti per la prova');
      write(root,'[data-ua-reminder-msg]','Controlla le anteprime e premi «Simula invio» quando sei pronto.');
      send.textContent=`Simula invio di ${list.length} ${list.length===1?'messaggio':'messaggi'} ↗`;
      visible(root,'[data-ua-reminder-ready]',true);visible(root,'[data-ua-reminder-empty]',false);
      visible(root,'[data-ua-reminder-sent]',false);send.hidden=false;
      step(2);allowResults(true);setView('results',true);
    });
    send.addEventListener('click',()=>{
      if(phase!=='prepared')return;
      phase='sent';sent=prepared;syncCounters();step(3);
      write(root,'[data-ua-reminder-chip]','Invio simulato');
      $(root,'[data-ua-reminder-view-button="results"]').innerHTML='<span>3</span> Invio';
      write(root,'[data-ua-reminder-stage-label]','PASSAGGIO 3 · INVIO SIMULATO');
      write(root,'[data-ua-reminder-results-heading]','Riepilogo della prova');
      $$(root,'[data-ua-reminder-card-status]').forEach(chip=>{
        chip.textContent='INVIO SIMULATO · '+chip.textContent.replace(/^PRONTO PER /,'');
        chip.classList.add('is-simulated');
      });
      write(root,'[data-ua-reminder-summary]',`${sent} ${sent===1?'messaggio segnato':'messaggi segnati'} come inviati nella simulazione. Nessuna comunicazione è partita.`);
      write(root,'[data-ua-reminder-msg]','Puoi modificare la regola o ricominciare per effettuare un’altra prova.');
      visible(root,'[data-ua-reminder-sent]',true);send.hidden=true;
    });
    views.forEach(button=>button.addEventListener('click',()=>{if(!button.disabled)setView(button.dataset.uaReminderViewButton,true);}));
    $(root,'[data-ua-reminder-reset]').addEventListener('click',()=>{
      days.value='7';message.value='Ciao {nome}, il tuo abbonamento scade il {data}. Ti aspettiamo in studio per il rinnovo!';
      error.hidden=true;clear();setView('rule',true);
      write(root,'[data-ua-reminder-msg]','Demo ripristinata: imposta una regola e prepara i messaggi.');
    });
    clear();setView('rule');
  }
  // Offline A4 report, optionally embedding a locally selected JPEG/PNG/WebP as a JPEG XObject.
  const euroGlyphs={'€':128,'‘':145,'’':146,'“':147,'”':148,'–':150,'—':151,'…':133,'•':149};
  const encPDF=s=>Array.from(String(s)).map(c=>{const code=c.codePointAt(0);const n=euroGlyphs[c]||(code>=32&&code<=255?code:63);return n.toString(16).padStart(2,'0')}).join('').toUpperCase();
  function preparePdf(data,photo){
    const utf=new TextEncoder(),bits=[];let total=0;const write=s=>{const b=utf.encode(s);bits.push(b);total+=b.length;};
    const c='#133047',navy='#0B293D',muted='#587386',red='#D52B49',pale='#F3F7F9';
    const rgb=h=>[1,3,5].map(i=>(parseInt(h.slice(i,i+2),16)/255).toFixed(3)).join(' ');
    const cmds=[];const rect=(x,y,w,h,col)=>cmds.push(`${rgb(col)} rg ${x} ${y} ${w} ${h} re f`);
    const tx=(s,x,y,size=10,color=c,bold=false)=>cmds.push(`${rgb(color)} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${encPDF(s)}> Tj ET`);
    const fmt=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(n);
    const wrap=(str,max=88,maxRows=5)=>{const words=String(str).replace(/\s+/g,' ').trim().split(' ');const rows=[];let line='';
      for(const w of words){if((line+' '+w).trim().length>max&&line){rows.push(line);line='';}if(w.length>max){let rest=w;while(rest.length>max){rows.push(rest.slice(0,max));rest=rest.slice(max);}line=rest;}else line=(line+' '+w).trim();}
      if(line)rows.push(line);return rows.slice(0,maxRows);
    };
    rect(0,698,595,144,navy);rect(48,694,46,4,red);tx('NORD SERVICE',48,779,25,'#FFFFFF',true);tx('RAPPORTO TECNICO DI INTERVENTO',48,752,11,'#B8D3E3');tx('DOCUMENTO DIMOSTRATIVO',340,786,10,'#D7E7F0',true);
    tx('Rapporto dell’intervento',48,650,20,c,true);tx('Data: '+new Intl.DateTimeFormat('it-IT').format(new Date()),48,626,10,muted);
    rect(48,493,499,113,pale);rect(48,493,3,113,'#8AB2C5');
    tx('CLIENTE',62,583,9,muted,true);tx(data.client.slice(0,39),62,563,13,c,true);
    tx('ATTIVITÀ',62,541,9,muted,true);tx(data.kind.slice(0,42),62,524,11,c);
    tx('DURATA',350,583,9,muted,true);tx(fmt(data.time)+' minuti',350,563,12,c,true);
    tx('ESITO',350,541,9,muted,true);tx(data.result.slice(0,30),350,524,10,c);
    tx('DESCRIZIONE DELL’INTERVENTO',48,464,11,c,true);
    wrap(data.notes,78,7).forEach((row,i)=>tx(row,48,440-i*15,10,c));
    if(photo){tx('FOTOGRAFIA ALLEGATA',48,314,11,c,true);
      cmds.push(`q ${photo.drawWidth} 0 0 ${photo.drawHeight} ${photo.x} ${photo.y} cm /Im1 Do Q`);
    } else {rect(48,172,499,127,pale);tx('Nessuna fotografia allegata',65,237,11,muted);}
    rect(48,90,499,58,navy);rect(48,90,4,58,red);tx(data.result.toUpperCase(),62,122,12,'#FFFFFF',true);tx('Rapporto pronto per la consultazione',62,104,9,'#BDD4E1');
    tx('Documento illustrativo senza valore fiscale o commerciale.',48,65,8,muted);
    tx('Nessun dato inviato o archiviato su server.',48,51,8,muted);
    const stream=cmds.join('\n')+'\n';
    const objects=[null, '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${photo?'/XObject << /Im1 7 0 R >>':''} >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${utf.encode(stream).length} >>\nstream\n${stream}endstream`];
    if(photo)objects.push({head:`<< /Type /XObject /Subtype /Image /Width ${photo.width} /Height ${photo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${photo.bytes.length} >>\nstream\n`,bytes:photo.bytes});
    write('%PDF-1.4\n%ENERGELIA\n');const offsets=[0];
    for(let i=1;i<objects.length;i++){
      offsets[i]=total;write(i+' 0 obj\n');
      if(typeof objects[i]==='string')write(objects[i]);
      else{write(objects[i].head);bits.push(objects[i].bytes);total+=objects[i].bytes.length;write('\nendstream');}
      write('\nendobj\n');
    }
    const xref=total;write(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
    for(let i=1;i<objects.length;i++)write(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
    write(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(bits,{type:'application/pdf'});
  }
  function readPhoto(file){
    if(!file)return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{try{
        const scale=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));
        const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*scale));cv.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=cv.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cv.width,cv.height);ctx.drawImage(img,0,0,cv.width,cv.height);
        const base64=cv.toDataURL('image/jpeg',0.8).split(',')[1];const raw=atob(base64);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        const ratio=Math.min(300/cv.width,125/cv.height);
        resolve({bytes,width:cv.width,height:cv.height,drawWidth:Math.round(cv.width*ratio),drawHeight:Math.round(cv.height*ratio),x:48,y:175});
      }catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Fotografia non leggibile'))};img.src=url;
    });
  }
  function initReport(root){
    const views=$$(root,'[data-ua-report-view-button]');
    const setView=(name,reframe=false)=>{
      root.dataset.uaMobileView=name;
      views.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.uaReportViewButton===name)));
      if(reframe)alignApp(root);
    };
    views.forEach(button=>button.addEventListener('click',()=>{if(!button.disabled)setView(button.dataset.uaReportViewButton,true);}));
    const allowDocument=allowed=>{$(root,'[data-ua-report-view-button="result"]').disabled=!allowed;$(root,'[data-ua-report-revise-result]').hidden=!allowed;};
    const step=flow(root),form=$(root,'[data-ua-report-form]'),client=$(root,'[data-ua-report-client]'),kind=$(root,'[data-ua-report-kind]'),notes=$(root,'[data-ua-report-notes]');
    const time=$(root,'[data-ua-report-time]'),result=$(root,'[data-ua-report-result]'),image=$(root,'[data-ua-report-image]'),error=$(root,'[data-ua-report-error]'),download=$(root,'[data-ua-report-download]');
    let finished=false,url=null,photoUrl=null;
    const clearPdf=()=>{if(url){URL.revokeObjectURL(url);url=null;}download.removeAttribute('href');download.hidden=true;};
    const clearPhoto=()=>{if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl=null;}image.value='';visible(root,'[data-ua-report-photo-preview]',false)};
    function checkFile(){const f=image.files[0];return !f||(f.size<=2*1024*1024 && ['image/jpeg','image/png','image/webp'].includes(f.type));}
    image.addEventListener('change',()=>{
      clearPdf();error.hidden=true;
      if(!checkFile()){error.textContent='Usa una fotografia JPG, PNG o WebP fino a 2 MB.';error.hidden=false;clearPhoto();return;}
      if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;
      if(image.files[0]){photoUrl=URL.createObjectURL(image.files[0]);$(root,'[data-ua-report-photo-img]').src=photoUrl;visible(root,'[data-ua-report-photo-preview]',true)}
      else visible(root,'[data-ua-report-photo-preview]',false);
    });
    $(root,'[data-ua-report-photo-remove]').addEventListener('click',clearPhoto);
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();if(finished)return;
      if(!client.value.trim()||notes.value.trim().length<10||!form.reportValidity()||!checkFile()){
        error.textContent='Compila cliente, attività svolta (almeno 10 caratteri) e durata valida. Immagine max 2 MB.';error.hidden=false;return;
      }
      error.hidden=true;const data={client:client.value.trim(),kind:kind.value,notes:notes.value.trim(),time:Number(time.value),result:result.value};
      const btn=$(root,'[data-ua-report-close]');btn.disabled=true;btn.textContent='Creazione del documento…';
      try{const pic=await readPhoto(image.files[0]);clearPdf();url=URL.createObjectURL(preparePdf(data,pic));download.href=url;download.hidden=false;
        write(root,'[data-ua-paper-heading]',data.result);write(root,'[data-ua-paper-client]',data.client);write(root,'[data-ua-paper-kind]',data.kind);write(root,'[data-ua-paper-time]',data.time+' minuti');write(root,'[data-ua-paper-result]',data.result);write(root,'[data-ua-paper-notes]',data.notes);
        const preview=$(root,'[data-ua-paper-photo]');preview.hidden=!photoUrl;if(photoUrl)preview.src=photoUrl;
        visible(root,'[data-ua-report-paper]',true);visible(root,'[data-ua-report-empty]',false);visible(root,'[data-ua-report-archive]',true);
        visible(root,'[data-ua-report-after]',true);form.hidden=true;
        write(root,'[data-ua-report-state]',data.result);write(root,'[data-ua-report-chip]','Documento pronto');finished=true;allowDocument(true);
        step(2);write(root,'[data-ua-report-msg]','Puoi scaricare il PDF oppure tornare alla scheda per correggere i dati.');
        setView('result',true);
      }catch(e){error.textContent='Impossibile leggere la fotografia. Riprova con un file differente.';error.hidden=false;btn.disabled=false;btn.textContent='Registra esito e crea rapporto ↗';}
    });
    download.addEventListener('click',()=>{if(finished){step(3);write(root,'[data-ua-report-msg]','Per modificarlo torna alla scheda; per una nuova prova usa «Ricomincia demo».');}});
    const revise=()=>{finished=false;clearPdf();form.hidden=false;visible(root,'[data-ua-report-after]',false);visible(root,'[data-ua-report-paper]',false);visible(root,'[data-ua-report-empty]',true);visible(root,'[data-ua-report-archive]',false);
      write(root,'[data-ua-report-state]','In lavorazione');write(root,'[data-ua-report-chip]','Non ancora creato');allowDocument(false);setView('form',true);const btn=$(root,'[data-ua-report-close]');btn.disabled=false;btn.innerHTML='Registra esito e crea rapporto <span>↗</span>';step(1);
    };
    $(root,'[data-ua-report-revise]').addEventListener('click',revise);
    $(root,'[data-ua-report-revise-result]').addEventListener('click',revise);
    $(root,'[data-ua-report-reset]').addEventListener('click',()=>{revise();clearPhoto();form.reset();client.value='Elena Conti';notes.value='Controllo del circuito, pulizia dei filtri e verifica finale del funzionamento.';time.value='90';error.hidden=true;write(root,'[data-ua-report-msg]','Demo ripristinata: compila la scheda e crea un nuovo rapporto.');});
    window.addEventListener('pagehide',()=>{clearPdf();if(photoUrl)URL.revokeObjectURL(photoUrl)},{once:true});allowDocument(false);setView('form');step(1);
  }
  document.querySelectorAll('[data-uc-automation="job"]').forEach(initJob);
  document.querySelectorAll('[data-uc-automation="reminder"]').forEach(initReminder);
  document.querySelectorAll('[data-uc-automation="report"]').forEach(initReport);
})();
