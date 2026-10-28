/* Casi 09–10: esperienze locali senza backend né persistenza. */
(() => {
'use strict';
const $=(root,s)=>root.querySelector(s), $$=(root,s)=>[...root.querySelectorAll(s)];
const write=(r,s,v)=>{const e=$(r,s);if(e)e.textContent=String(v);};
const visible=(r,s,yes)=>{const e=$(r,s);if(e)e.hidden=!yes;};
const create=(tag,cls,txt)=>{const e=document.createElement(tag);e.className=cls||'';if(txt!==undefined)e.textContent=txt;return e;};
// A view switch may need to reframe the app; never jump to the bottom of a panel.
// Status-only changes are deliberately scroll-free. One app = one navigation anchor.
const reframeApp=(root)=>{
  if(!matchMedia('(max-width:810px)').matches)return;
  requestAnimationFrame(()=>{
    const rect=root.getBoundingClientRect();
    // Keep the current position if the beginning of the app is still visible.
    // After hiding a view the browser can otherwise keep an obsolete scroll offset.
    if(rect.top < -24 || rect.top > innerHeight-110){
      window.scrollTo({top:Math.max(0,window.scrollY+rect.top-12),behavior:'instant'});
    }
  });
};

function setupUi(root){
  // In-app feedback: it belongs to the simulated application, never to the site viewport.
  const toast=document.createElement('div');toast.className='ux-app-toast';toast.hidden=true;
  toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  toast.innerHTML='<span class="ux-toast-check" aria-hidden="true">✓</span><span class="ux-toast-copy"><strong data-ux-toast-title></strong><small data-ux-toast-desc></small></span><span class="ux-toast-timer" aria-hidden="true"><svg viewBox="0 0 32 32"><circle class="ux-toast-track" cx="16" cy="16" r="13"/><circle class="ux-toast-progress" cx="16" cy="16" r="13"/></svg></span><button type="button" class="ux-toast-close" aria-label="Chiudi notifica">×</button>';
  // For 09 and 10 the overlay lives inside the application pane itself.
  // Other labs retain the approved inline-notification behavior.
  const host = root.dataset.ucWork==='history'
    ? root.querySelector('.ux-history-main')
    : root.dataset.ucWork==='dispatch'
      ? root.querySelector('.ux-dispatch-board')
      : root.dataset.ucWork==='portal'
        ? root.querySelector('.ux-portal-main')
        : root.dataset.ucWork==='stock'
          ? root.querySelector('.ux-stock-main')
          : null;
  if(host) host.append(toast);
  else {
    const anchor = root.dataset.ucWork==='portal'
      ? root.querySelector('[data-ux-portal-section="messages"] .ux-portal-pane-heading')
      : root.querySelector('.ux-stock-main .ux-stock-heading');
    if(anchor) anchor.after(toast);
    else root.append(toast);
  }
  let timer=null;
  function hideToast(){clearTimeout(timer);timer=null;toast.hidden=true;toast.classList.remove('is-playing');}
  toast.querySelector('button').addEventListener('click',hideToast);
  function notify(title,description){hideToast();toast.querySelector('[data-ux-toast-title]').textContent=title;toast.querySelector('[data-ux-toast-desc]').textContent=description;
    toast.hidden=false;void toast.offsetHeight;toast.classList.add('is-playing');timer=setTimeout(hideToast,5000);}
  return {notify,hideToast};
}
function progress(root,step){const bar=root.closest('.uc-detail-main')?.querySelector('[data-uc-progress]');if(!bar)return;bar.style.setProperty('--uc-progress-fraction',(step-1)/2);bar.dataset.ucCurrent=step;$$ (bar,'[data-uc-step]').forEach(li=>{const s=Number(li.dataset.ucStep);li.classList.toggle('is-current',s===step);li.classList.toggle('is-complete',s<step);if(s===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});}
// Lo storico è sempre relativo alla data locale di visita, non a un anno fisso.
// Ore 12:00 evita salti indesiderati attraversando il cambio d'ora legale.
const historyDate=(daysAgo)=>{
  const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()-daysAgo);
  return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(date);
};
const customers={
anna:{name:'Anna Verdi',initials:'AV',contact:'anna@example.com · Genova',records:[['anna-frigo',historyDate(33),'Frigorifero · controllo temperatura','Ripristinata la corretta refrigerazione e verificati termostato e sensore.','Rapporto controllo frigorifero'],['anna-lavastoviglie',historyDate(141),'Lavastoviglie · perdita d’acqua','Sostituita guarnizione e verificata la tenuta del circuito.','Scheda ricambio lavastoviglie']]},
marco:{name:'Marco Lodi',initials:'ML',contact:'marco@example.com · Genova',records:[['marco-lavatrice',historyDate(14),'Lavatrice · anomalia centrifuga','Bilanciamento del cestello verificato e sensore controllato.','Rapporto riparazione lavatrice'],['marco-forno',historyDate(190),'Forno · resistenza','Elemento riscaldante sostituito e temperatura verificata.','Scheda manutenzione forno']]},
giulia:{name:'Giulia Costa',initials:'GC',contact:'giulia@example.com · Sestri Levante',records:[['giulia-congelatore',historyDate(11),'Congelatore · accumulo ghiaccio','Scarico condensa e guarnizione controllati.','Rapporto controllo congelatore'],['giulia-cottura',historyDate(165),'Piano cottura · accensione','Pulizia e regolazione dei componenti di accensione.','Scheda controllo piano cottura']]}
};
/* Local document previews: read-only facsimiles. */
const documentEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Viewer-only facsimiles. Document generation is intentionally reserved for the PDF-producing labs 05/15. */
function initDocumentViewer(root){
  const dialog=document.createElement('dialog');dialog.className='ux-document-viewer';
  dialog.setAttribute('aria-label','Visualizzatore documento dimostrativo');
  dialog.innerHTML='<div class="ux-viewer-toolbar"><span class="ux-viewer-file">▤ <strong data-ux-viewer-file></strong><small>Anteprima documento · facsimile</small></span><div class="ux-viewer-actions"><button type="button" data-ux-viewer-close aria-label="Chiudi anteprima documento">×</button></div></div><div class="ux-viewer-stage"><article class="ux-viewer-paper" aria-label="Pagina del documento"><header><span data-ux-viewer-brand></span><small>DOCUMENTO DIMOSTRATIVO</small></header><div class="ux-viewer-paper-content"><small>FACSIMILE · ANTEPRIMA</small><h2 data-ux-viewer-title></h2><div class="ux-viewer-info"><span><small>RIFERIMENTO</small><strong data-ux-viewer-reference></strong></span><span><small>CLIENTE / PROGETTO</small><strong data-ux-viewer-subject></strong></span></div><h3 data-ux-viewer-section></h3><ul data-ux-viewer-rows></ul><div class="ux-viewer-plan" data-ux-viewer-plan hidden aria-label="Schema indicativo della planimetria"><span>SOGGIORNO</span><span>CUCINA</span><span>CAMERA</span><span>BAGNO</span></div></div><footer>Facsimile illustrativo · contenuto generato nel browser</footer></article></div>';
  root.append(dialog);

  let previousFocus=null;
  const close=()=>{if(dialog.open)dialog.close();else dialog.hidden=true;};
  const dispose=()=>{root.dataset.uxDocOpen='false';previousFocus?.focus?.({preventScroll:true});};
  dialog.querySelector('[data-ux-viewer-close]').addEventListener('click',close);
  dialog.addEventListener('close',dispose);
  dialog.addEventListener('cancel',()=>{});
  dialog.addEventListener('click',ev=>{if(ev.target===dialog)close()});
  return {
    open(data){previousFocus=document.activeElement;
      const value=(name,t)=>{dialog.querySelector('[data-ux-viewer-'+name+']').textContent=t||'';};
      value('file',data.title);value('brand',data.brand);value('title',data.title);
      value('reference',data.reference);value('subject',data.subject);value('section',data.sectionTitle||'DETTAGLI');
      const list=dialog.querySelector('[data-ux-viewer-rows]');list.replaceChildren();data.rows.forEach(v=>list.append(create('li','',v)));
      dialog.querySelector('[data-ux-viewer-plan]').hidden=data.diagram!=='plan';
      if(!dialog.open&&typeof dialog.showModal==='function')dialog.showModal();else dialog.hidden=false;
      dialog.querySelector('[data-ux-viewer-close]').focus({preventScroll:true});
    },close(){close()}
  };
}

function initHistory(root){
root._uxUi=setupUi(root);
const viewer=initDocumentViewer(root);
let selected=null,expanded=null,notes={anna:[],marco:[],giulia:[]};
// At most 24 user-written notes per customer in this ephemeral demonstration.
const HISTORY_LIMIT=24;
let section='history';
function setSection(next){section=next;root.dataset.uxSection=next;$$ (root,'[data-ux-history-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.uxHistoryTab===next)));}
$$ (root,'[data-ux-history-tab]').forEach(b=>b.addEventListener('click',()=>{setSection(b.dataset.uxHistoryTab);}));
function showCustomers(){root.dataset.uxMobileView='list';root._uxUi.hideToast();reframeApp(root);}
$(root,'[data-ux-history-back]').addEventListener('click',showCustomers);
root.dataset.uxMobileView='list';setSection('history');
const events=$(root,'[data-ux-history-events]'),docs=$(root,'[data-ux-history-docs]'),input=$(root,'[data-ux-history-note-input]');
events.tabIndex=0; events.setAttribute('role','region'); events.setAttribute('aria-label','Cronologia cliente, area scorrevole');
const message=s=>write(root,'[data-ux-history-message]',s);
function openDoc(record){
  if(!selected||!record[4])return;
  setSection('documents');root.dataset.uxDocOpen='true';
  viewer.open({brand:'SERVIZIO TECNICO',title:record[4],reference:record[1],subject:customers[selected].name,
    sectionTitle:'RIEPILOGO INTERVENTO',rows:[record[2],record[3],
      'Stato: lavoro registrato nello storico cliente.','Documento illustrativo della scheda tecnica.'],
    slug:'storico-'+selected+'-'+record[0]});
  message('Anteprima del rapporto aperta: puoi consultare il facsimile A4.');
}
function redraw(){
if(!selected)return;const c=customers[selected];events.replaceChildren();docs.replaceChildren();
const historyHint=$(root,'.ux-history-timeline-section .ux-section-meta');
if(historyHint)historyHint.textContent=notes[selected].length>4?'Scorri nello storico ↓':'Più recenti in alto';
const rows=[...notes[selected].map((t,i)=>['N-'+i,'Adesso',t,'La nota è stata inserita nello storico cliente.',null]),...c.records];
rows.forEach(rec=>{
const article=create('article','ux-timeline-entry'+(rec[0].startsWith('N-')?' is-note':''));
const btn=create('button','ux-event-button');btn.type='button';btn.dataset.uxEvent=rec[0];btn.setAttribute('aria-expanded',String(expanded===rec[0]));
const inner=create('span','ux-event-copy');inner.append(create('small','ux-event-date',rec[1]+' · '+(rec[4]?'Intervento':'Nota interna')),create('strong','ux-event-title',rec[2]));
btn.append(inner,create('span','ux-event-arrow',expanded===rec[0]?'−':'+'));article.append(create('span','ux-timeline-dot'),btn);
if(expanded===rec[0]){const detail=create('div','ux-event-detail');detail.append(create('p','',rec[3]));if(rec[4]){const link=create('button','ux-inline-link','Apri documento ↗');link.type='button';link.addEventListener('click',()=>openDoc(rec));detail.append(link);}article.append(detail);}
btn.addEventListener('click',()=>{expanded=expanded===rec[0]?null:rec[0];redraw();message(expanded?'Intervento aperto: puoi vedere i dettagli e il documento.':'Dettaglio chiuso.');});events.append(article);
});
c.records.forEach(rec=>{const b=create('button','ux-doc-item');b.type='button';const text=create('span','ux-doc-copy');text.append(create('strong','',rec[4]),create('small','',rec[1]));b.append(create('span','ux-doc-icon','▤'),text,create('span','ux-doc-arrow','↗'));b.addEventListener('click',()=>openDoc(rec));docs.append(b);});
write(root,'[data-ux-history-last]',notes[selected].length?'Adesso':c.records[0][1]);
}
function choose(id){const c=customers[id];if(!c)return;root.dataset.uxDocOpen='false';selected=id;expanded=null;input.value='';write(root,'[data-ux-history-note-count]',0);visible(root,'[data-ux-history-empty]',false);visible(root,'[data-ux-history-active]',true);visible(root,'[data-ux-history-doc-preview]',false);visible(root,'[data-ux-history-success]',false);visible(root,'[data-ux-history-note-error]',false);
$$ (root,'[data-ux-customer]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uxCustomer===id)));
write(root,'[data-ux-history-name]',c.name);write(root,'[data-ux-history-avatar]',c.initials);write(root,'[data-ux-history-contact]',c.contact);write(root,'[data-ux-history-count]',c.records.length);write(root,'[data-ux-history-doc-count]',c.records.length);redraw();setSection('history');root.dataset.uxMobileView='detail';progress(root,2);message('Scheda di '+c.name+' aperta. Consulta lo storico o aggiungi una nota.');reframeApp(root);}
$$ (root,'[data-ux-customer]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.uxCustomer)));

input.addEventListener('input',()=>{write(root,'[data-ux-history-note-count]',input.value.length);visible(root,'[data-ux-history-note-error]',false);});
$(root,'[data-ux-history-note-form]').addEventListener('submit',e=>{e.preventDefault();if(!selected)return;const note=input.value.trim();if(note.length<3){visible(root,'[data-ux-history-note-error]',true);input.focus();return;}notes[selected].unshift(note);if(notes[selected].length>HISTORY_LIMIT)notes[selected].length=HISTORY_LIMIT;expanded=null;redraw();input.value='';write(root,'[data-ux-history-note-count]',0);setSection('history');progress(root,3);message('Puoi consultare lo storico aggiornato o aggiungere un’altra nota.');root._uxUi.notify('Nota aggiunta','La nuova nota è in cima allo storico.');reframeApp(root);});
$(root,'[data-ux-history-reset]').addEventListener('click',()=>{selected=null;expanded=null;root.dataset.uxDocOpen='false';notes={anna:[],marco:[],giulia:[]};input.value='';$$ (root,'[data-ux-customer]').forEach(b=>b.setAttribute('aria-pressed','false'));visible(root,'[data-ux-history-empty]',true);visible(root,'[data-ux-history-active]',false);visible(root,'[data-ux-history-doc-preview]',false);visible(root,'[data-ux-history-success]',false);setSection('history');root.dataset.uxMobileView='list';root._uxUi.hideToast();progress(root,1);message('Demo ripristinata: scegli un cliente per iniziare.');reframeApp(root);});progress(root,1);
}
const demoDate=days=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'}).format(d);};
const jobsBase=[{id:'job-1',title:'Manutenzione impianto pompe',address:'Via Torino 18 · Genova',time:demoDate(1)+' · 10:30',priority:'Media'},{id:'job-2',title:'Controllo quadro elettrico',address:'Via Mazzini 42 · Genova',time:demoDate(2)+' · 09:00',priority:'Alta'},{id:'job-3',title:'Verifica perdita idrica',address:'Piazza Dante 6 · Genova',time:demoDate(2)+' · 14:00',priority:'Media'}];
function initDispatch(root){
root._uxUi=setupUi(root);root.dataset.uxMobileView='board';
const back=()=>{root.dataset.uxMobileView='board';reframeApp(root);};
$(root,'[data-ux-dispatch-back]').addEventListener('click',back);
const fresh=()=>jobsBase.map(j=>({...j,status:'unassigned',technician:''}));let jobs=fresh(),selected=null,mobileTab='unassigned';
const tech=$(root,'[data-ux-assign-technician]');const current=()=>jobs.find(j=>j.id===selected);const say=s=>write(root,'[data-ux-dispatch-message]',s);
function setTab(s){mobileTab=s;$$ (root,'[data-ux-board-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uxBoardTab===s)));$$ (root,'[data-ux-board-col]').forEach(col=>col.dataset.uxTabVisible=String(col.dataset.uxBoardCol===s));}
function drawBoard(){['unassigned','active','done'].forEach(s=>{const stack=$(root,`[data-ux-cards="${s}"]`);stack.replaceChildren();const items=jobs.filter(j=>j.status===s);write(root,'[data-ux-count-'+s+']',items.length);write(root,'[data-ux-tab-'+s+']',items.length);write(root,'[data-ux-column-'+s+']',items.length);
if(!items.length)stack.append(create('div','ux-column-empty',s==='unassigned'?'Nessun intervento in attesa':s==='active'?'Nessun lavoro in corso':'Nessun intervento completato'));
items.forEach(job=>{const b=create('button','ux-job-card'+(job.id===selected?' is-selected':''));b.type='button';b.dataset.uxJob=job.id;b.setAttribute('aria-pressed',String(job.id===selected));const meta=create('span','ux-job-meta');meta.append(create('small','','Intervento'),create('span','ux-priority is-'+job.priority.toLowerCase(),job.priority));b.append(meta,create('strong','ux-job-title',job.title),create('span','ux-job-address',job.address),create('span','ux-job-foot',s==='done'?'✓ Completato':s==='active'?job.technician:job.technician?'Assegnato a '+job.technician:job.time));b.addEventListener('click',()=>choose(job.id));stack.append(b);});});}
function inspector(){const j=current();visible(root,'[data-ux-inspector-empty]',!j);visible(root,'[data-ux-inspector-active]',!!j);if(!j)return;write(root,'[data-ux-detail-title]',j.title);write(root,'[data-ux-detail-address]',j.address);write(root,'[data-ux-detail-time]',j.time);const pill=$(root,'[data-ux-detail-priority]');pill.textContent='PRIORITÀ '+j.priority.toUpperCase();pill.className='ux-priority is-'+j.priority.toLowerCase();const canAssign=j.status==='unassigned'&&!j.technician;visible(root,'[data-ux-assign-form]',canAssign);visible(root,'[data-ux-next-start]',j.status==='unassigned'&&!!j.technician);visible(root,'[data-ux-next-finish]',j.status==='active');visible(root,'[data-ux-next-done]',j.status==='done');tech.value=j.technician;$(root,'[data-ux-action-assign]').disabled=!canAssign||!tech.value;$$ (root,'[data-ux-priority]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uxPriority===j.priority)));write(root,'[data-ux-assigned-to]',j.technician);write(root,'[data-ux-work-owner]',j.technician+' è responsabile dell’intervento.');write(root,'[data-ux-done-summary]',j.title+' · Tecnico: '+j.technician+'.');}
function choose(id){selected=id;drawBoard();inspector();root.dataset.uxMobileView='detail';say('Scheda intervento aperta: scegli tecnico, priorità e stato.');reframeApp(root);}
$$ (root,'[data-ux-board-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.uxBoardTab)));
tech.addEventListener('change',()=>{$(root,'[data-ux-action-assign]').disabled=!tech.value;});
$$ (root,'[data-ux-priority]').forEach(b=>b.addEventListener('click',()=>{const j=current();if(!j||j.technician)return;const chosenTech=tech.value;j.priority=b.dataset.uxPriority;inspector();tech.value=chosenTech;$(root,'[data-ux-action-assign]').disabled=!tech.value;drawBoard();}));
$(root,'[data-ux-action-assign]').addEventListener('click',()=>{
  const j=current();if(!j||j.technician||!tech.value||j.status!=='unassigned')return;
  j.technician=tech.value;j.status='active';progress(root,2);
  const title=j.title,owner=j.technician;selected=null;
  drawBoard();inspector();setTab('active');
  say('Intervento assegnato a '+owner+': «'+title+'» è ora nella colonna In corso. Aprilo per completarlo.');
  root.dataset.uxMobileView='board';reframeApp(root);
});
$(root,'[data-ux-action-finish]').addEventListener('click',()=>{const j=current();if(!j||j.status!=='active')return;j.status='done';progress(root,3);drawBoard();inspector();setTab('done');say('Dalla bacheca puoi scegliere un altro intervento o ricominciare.');root._uxUi.notify('Intervento completato',j.title+' è ora tra i completati.');root.dataset.uxMobileView='board';reframeApp(root);});
$(root,'[data-ux-dispatch-reset]').addEventListener('click',()=>{jobs=fresh();selected=null;progress(root,1);drawBoard();inspector();setTab('unassigned');root.dataset.uxMobileView='board';root._uxUi.hideToast();say('Demo ripristinata: scegli un intervento da assegnare.');reframeApp(root);});progress(root,1);drawBoard();inspector();setTab('unassigned');}


/* 11 — Portale CasaForma: project, documents, messages. State exists only in this page. */
const portalDocs={
  plan:{title:'Planimetria aggiornata',description:'La disposizione concordata dopo il sopralluogo e la revisione delle stanze.',points:['Zona giorno aperta verso la cucina','Camera matrimoniale con armadiatura dedicata','Bagno con nuova disposizione dei sanitari']},
  works:{title:'Programma dei lavori',description:'Le fasi concordate e lo stato operativo del progetto.',points:['Demolizioni e preparazione · completate','Impianti e predisposizioni · in lavorazione','Rivestimenti e finiture · fase successiva']},
  summary:{title:'Riepilogo delle finiture',description:'Scelte illustrative già approvate dal cliente.',points:['Pavimento: gres effetto pietra chiara','Pareti: bianco caldo e verde salvia','Illuminazione: punti luce a incasso']}
};
const workJump=el=>{if(el){const root=el.closest('[data-uc-work]');if(root)reframeApp(root);}};
function initPortal(root){
  root._uxUi=setupUi(root);
  const viewer=initDocumentViewer(root);
  const sections=$$(root,'[data-ux-portal-section]');
  const input=$(root,'[data-ux-portal-input]');
  const thread=$(root,'[data-ux-portal-thread]');
  const originalThread=thread.innerHTML;
// Bound the conversation even after repeated submissions in the demo.
const MESSAGE_LIMIT=24;
thread.tabIndex=0; thread.setAttribute('role','region');
  let seenDocument=false,hasMessage=false;
  const message=t=>write(root,'[data-ux-portal-status]',t);
  function selectTab(tab){
    root.dataset.uxPortalTab=tab;
    sections.forEach(section=>section.hidden=section.dataset.uxPortalSection!==tab);
    $$(root,'[data-ux-portal-link],[data-ux-portal-tab-button]').forEach(b=>{
      const target=b.dataset.uxPortalLink||b.dataset.uxPortalTabButton;
      b.setAttribute('aria-pressed',String(target===tab));
    });
    if(tab==='documents'&&seenDocument)progress(root,hasMessage?3:2);
  }
  $$(root,'[data-ux-portal-link],[data-ux-portal-tab-button]').forEach(b=>{
    b.addEventListener('click',()=>selectTab(b.dataset.uxPortalLink||b.dataset.uxPortalTabButton));
  });
  $(root,'[data-ux-portal-open-docs]').addEventListener('click',()=>selectTab('documents'));
  $$(root,'[data-ux-portal-doc]').forEach(b=>b.addEventListener('click',()=>{
    const key=b.dataset.uxPortalDoc,doc=portalDocs[key];if(!doc)return;
    seenDocument=true;progress(root,hasMessage?3:2);
    viewer.open({brand:'CASAFORMA',title:doc.title,reference:'Progetto appartamento · Esempio',subject:'Martina Serra',
      sectionTitle:key==='plan'?'SCHEMA DEGLI AMBIENTI':key==='works'?'FASI DI PROGETTO':'SCELTE CONDIVISE',
      rows:doc.points,diagram:key==='plan'?'plan':null,slug:'casaforma-'+key});
    message(doc.title+' aperto: puoi consultare il facsimile A4.');
  }));
  input.addEventListener('input',()=>{
    write(root,'[data-ux-portal-count]',input.value.length);
    visible(root,'[data-ux-portal-error]',false);
  });
  $(root,'[data-ux-portal-form]').addEventListener('submit',e=>{
    e.preventDefault();const value=input.value.trim();
    if(value.length<3){visible(root,'[data-ux-portal-error]',true);input.focus();return;}
    const entry=create('div','ux-portal-chat-row is-client');
    entry.append(create('strong','','Martina Serra'),create('p','',value),create('small','','Adesso'));
    thread.append(entry);
    const authored=$$(thread,'.ux-portal-chat-row.is-client');
    if(authored.length>MESSAGE_LIMIT)authored.slice(0,authored.length-MESSAGE_LIMIT).forEach(row=>row.remove());
    // Keep the newest message visible inside the application without scrolling the page.
    thread.scrollTop=thread.scrollHeight;
    input.value='';write(root,'[data-ux-portal-count]',0);
    hasMessage=true;progress(root,3);
    root._uxUi.notify('Messaggio aggiunto','La comunicazione compare nella conversazione del progetto.');
    message('Puoi continuare a scrivere oppure consultare i documenti del progetto.');

  });
  $(root,'[data-ux-portal-reset]').addEventListener('click',()=>{
    seenDocument=false;hasMessage=false;viewer.close();
    input.value='';write(root,'[data-ux-portal-count]',0);
    visible(root,'[data-ux-portal-error]',false);
    thread.innerHTML=originalThread;
    selectTab('overview');root._uxUi.hideToast();progress(root,1);
    message('Demo ripristinata: consulta il progetto per iniziare.');
  });
  selectTab('overview');progress(root,1);
}

/* 12 — Magazzino Forno Levante, stock log and threshold check. */
const initialStock=[
  {key:'farina',name:'Farina tipo 0',description:'Base per gli impasti quotidiani.',icon:'◈',value:24,min:10},
  {key:'mozzarella',name:'Mozzarella',description:'Fornitura giornaliera per il laboratorio.',icon:'◉',value:10,min:8},
  {key:'lievito',name:'Lievito fresco',description:'Conservazione refrigerata.',icon:'✳',value:7,min:5},
  {key:'olio',name:'Olio extravergine',description:'Scorta per le preparazioni.',icon:'◈',value:7,min:3}
];
function initStock(root){
  root._uxUi=setupUi(root);
  const clone=()=>initialStock.map(item=>({...item,history:[]}));
  let goods=clone(),chosen='mozzarella',action='out',filter='all',changed=false;
  const quantity=$(root,'[data-ux-stock-quantity]');
  const MOVEMENT_LIMIT=24;
  const movementList=$(root,'[data-ux-stock-movements]');
  movementList.tabIndex=0; movementList.setAttribute('role','region'); movementList.setAttribute('aria-label','Ultimi movimenti, area scorrevole');
  const current=()=>goods.find(item=>item.key===chosen);
  const f=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(n);
  const say=t=>write(root,'[data-ux-stock-status]',t);
  const low=()=>goods.filter(item=>item.value<item.min).length;
  function paintList(){
    const target=$(root,'[data-ux-stock-list]');target.replaceChildren();
    let displayed=goods.filter(item=>filter==='all'||item.value<item.min);
    displayed.forEach(item=>{
      const b=create('button','ux-stock-list-item'+(item.key===chosen?' is-current':''));
      b.type='button';b.dataset.uxStockItem=item.key;
      b.setAttribute('aria-pressed',String(item.key===chosen));
      const icon=create('span','ux-stock-list-icon',item.icon);
      const c=create('span','ux-stock-list-copy');
      c.append(create('strong','',item.name),create('small','',item.value<item.min?'Sotto la scorta minima':'Disponibile'));
      const n=create('span','ux-stock-list-amount',f(item.value)+' kg');
      b.append(icon,c,n);b.addEventListener('click',()=>choose(item.key));target.append(b);
    });
    visible(root,'[data-ux-stock-filter-empty]',!displayed.length);
    write(root,'[data-ux-stock-low-count]',low());write(root,'[data-ux-stock-low-filter]',low());
    $$(root,'[data-ux-stock-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uxStockFilter===filter)));
  }
  function paintMovements(item){
    const target=$(root,'[data-ux-stock-movements]');target.replaceChildren();
    const hint=$(root,'.ux-stock-movements .ux-stock-form-heading small');
    if(hint)hint.textContent=item.history.length>=MOVEMENT_LIMIT?'Ultimi 24 · scorri ↓':item.history.length>4?'Scorri per vedere altri ↓':'Registrati nella prova';
    if(!item.history.length){target.append(create('p','ux-stock-no-movements','Nessun movimento registrato per questo materiale.'));return;}
    item.history.forEach(record=>{
      const row=create('div','ux-stock-movement');
      row.append(create('span','',record.type==='out'?'− Consumo':'+ Rifornimento'),create('strong','',record.type==='out'?'−'+f(record.qty)+' kg':'+'+f(record.qty)+' kg'),create('small','','Adesso'));
      target.append(row);
    });
  }
  function paintMaterial(){
    const item=current();
    write(root,'[data-ux-stock-icon]',item.icon);
    write(root,'[data-ux-stock-name]',item.name);
    write(root,'[data-ux-stock-description]',item.description);
    write(root,'[data-ux-stock-available]',f(item.value)+' kg');
    write(root,'[data-ux-stock-minimum]',f(item.min)+' kg');
    const isLow=item.value<item.min;
    write(root,'[data-ux-stock-badge]',isLow?'Scorta bassa':'Disponibile');
    $(root,'[data-ux-stock-badge]').classList.toggle('is-low',isLow);
    visible(root,'[data-ux-stock-warning]',isLow);
    write(root,'[data-ux-stock-tip]',action==='out'
      ? (item.key==='mozzarella'&&item.history.length===0?'Prova a registrare 3 kg di consumo: la scorta passerà sotto il minimo.':'La quantità sarà sottratta dalle scorte disponibili.')
      : 'La quantità verrà aggiunta alla giacenza del materiale.');
    paintMovements(item);
  }
  function choose(key){
    if(!goods.some(x=>x.key===key))return;
    chosen=key;quantity.value='3';action='out';root.dataset.uxStockView='detail';
    setAction('out');paintList();paintMaterial();
    progress(root,1);
    say('Materiale selezionato: '+current().name+'. Registra un consumo o un rifornimento.');
    workJump($(root,'.ux-stock-main'));
  }
  function setAction(next){
    action=next;
    $$(root,'[data-ux-stock-action]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uxStockAction===next)));
    write(root,'[data-ux-stock-submit]',next==='out'?'Registra consumo ↗':'Registra rifornimento ↗');
    visible(root,'[data-ux-stock-error]',false);
    paintMaterial();
  }
  $$(root,'[data-ux-stock-action]').forEach(b=>b.addEventListener('click',()=>{setAction(b.dataset.uxStockAction);progress(root,2);}));
  quantity.addEventListener('input',()=>{visible(root,'[data-ux-stock-error]',false);progress(root,2);});
  $$(root,'[data-ux-stock-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.uxStockFilter;paintList();}));
  $(root,'[data-ux-stock-back]').addEventListener('click',()=>{root.dataset.uxStockView='list';workJump($(root,'.ux-stock-rail'));});
  $(root,'[data-ux-stock-form]').addEventListener('submit',e=>{
    e.preventDefault();
    const qty=Number(quantity.value),item=current();
    const okay=Number.isFinite(qty)&&qty>=.5&&qty<=100&&Math.abs(qty*2-Math.round(qty*2))<1e-7&&(action==='in'||qty<=item.value);
    if(!okay){visible(root,'[data-ux-stock-error]',true);quantity.focus();return;}
    item.value=Math.round((item.value+(action==='in'?qty:-qty))*10)/10;
    item.history.unshift({type:action,qty});
    if(item.history.length>MOVEMENT_LIMIT)item.history.length=MOVEMENT_LIMIT;
    changed=true;write(root,'[data-ux-stock-updated]','Adesso');
    paintList();paintMaterial();progress(root,3);
    const isLow=item.value<item.min;
    const label=action==='out'?'Consumo registrato':'Rifornimento registrato';
    root._uxUi.notify(label,isLow?'La scorta di '+item.name+' è sotto il minimo.':item.name+': '+f(item.value)+' kg disponibili.');
    say(isLow?'Controlla le scorte basse o registra un rifornimento.':'Puoi registrare un altro movimento oppure scegliere un altro materiale.');
  });
  $(root,'[data-ux-stock-reset]').addEventListener('click',()=>{
    goods=clone();chosen='mozzarella';filter='all';action='out';changed=false;
    quantity.value='3';root.dataset.uxStockView='list';root._uxUi.hideToast();
    write(root,'[data-ux-stock-updated]','—');
    $$(root,'[data-ux-stock-action]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uxStockAction==='out')));
    paintList();paintMaterial();progress(root,1);
    visible(root,'[data-ux-stock-error]',false);
    say('Demo ripristinata: scegli un materiale per iniziare.');
    workJump($(root,'.ux-stock-rail'));
  });
  paintList();paintMaterial();progress(root,1);
}

document.querySelectorAll('[data-uc-work="history"]').forEach(initHistory);
document.querySelectorAll('[data-uc-work="dispatch"]').forEach(initDispatch);
document.querySelectorAll('[data-uc-work="portal"]').forEach(initPortal);
document.querySelectorAll('[data-uc-work="stock"]').forEach(initStock);
})();
