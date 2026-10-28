/* Editorial interactions: accessible tabs and browser-local demonstrations. */
(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('[data-ed-tab]')];
  const panels = [...document.querySelectorAll('[data-ed-case]')];
  function select(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      if (focus && i === index) tab.focus();
    });
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
  }
  if (tabs.length === panels.length && tabs.length) {
    panels.forEach((panel, i) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabs[i].id);
      panel.tabIndex = 0;
    });
    tabs[0].parentElement.hidden = false;
    select(0);
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', event => {
        const actions = {ArrowRight: (i + 1) % tabs.length, ArrowDown: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, ArrowUp: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1};
        if (Object.hasOwn(actions, event.key)) { event.preventDefault(); select(actions[event.key], true); }
      });
    });
    tabs[0].parentElement.setAttribute('aria-orientation', 'horizontal');
    document.querySelectorAll('[data-ed-jump]').forEach(link => link.addEventListener('click', () => select(Number(link.dataset.edJump))));
  }
  /* Lab simulations are browser-local. They never submit to the website backend. */
  document.querySelectorAll('[data-ed-result-link]').forEach(link => {
    link.closest('form')?.addEventListener('submit', () => {
      if (link.closest('form').checkValidity()) link.hidden = false;
    });
    link.addEventListener('click', event => {
      const result = document.getElementById(link.hash.slice(1));
      if (!result) return;
      event.preventDefault();
      result.scrollIntoView({block:'start', behavior:'instant'});
      result.focus({preventScroll:true});
    });
  });
  const showReceipt = (status, title, detail) => {
    const summary = document.createElement('span');
    summary.className = 'story-result-summary';
    summary.textContent = detail;
    status.replaceChildren(document.createTextNode(title), summary);
  };
  const quoteForm = document.querySelector('[data-ed-quote-form]');
  if (quoteForm) {
    const stepOne = quoteForm.querySelector('[data-ed-quote-step="1"]');
    const stepTwo = quoteForm.querySelector('[data-ed-quote-step="2"]');
    const next = quoteForm.querySelector('[data-ed-quote-next]');
    const back = quoteForm.querySelector('[data-ed-quote-back]');
    const submit = quoteForm.querySelector('[type="submit"]');
    const result = document.querySelector('[data-ed-quote-result]');
    const empty = document.querySelector('[data-ed-quote-empty]');
    const panel = document.querySelector('[data-ed-quote-panel]');
    const status = quoteForm.querySelector('[data-ed-quote-status]');
    const hint = document.querySelector('[data-ed-demo-hint]');
    const progress = [...quoteForm.querySelectorAll('[data-ed-quote-progress]')];
    const goStep = (step, focus = true) => {
      stepOne.hidden = step !== 1;
      stepTwo.hidden = step !== 2;
      progress.forEach((node, i) => node.classList.toggle('is-active', i === step - 1));
      if (focus) (step === 2 ? quoteForm.querySelector('[name="customer"]') : next).focus({preventScroll:true});
    };
    next.addEventListener('click', () => { status.textContent = ''; goStep(2); });
    back.addEventListener('click', () => goStep(1));
    submit.disabled = false;
    quoteForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!quoteForm.reportValidity()) return;
      const data = new FormData(quoteForm);
      const write = (name, value) => {
        const node = panel?.querySelector('[data-ed-quote-' + name + ']');
        if (node) node.textContent = value;
      };
      const name = String(data.get('customer') || '').trim();
      const email = String(data.get('email') || '').trim();
      if (!name || !email) return;
      write('customer', name);
      write('email', email);
      write('service', String(data.get('service') || ''));
      write('property', String(data.get('property') || ''));
      write('timing', String(data.get('timing') || ''));
      write('state', 'Nuova richiesta');
      write('sync', 'Dati acquisiti dal sito · demo');
      const avatar = panel?.querySelector('.ed-admin-avatar');
      if (avatar) avatar.textContent = name.split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase();
      empty.hidden = true;
      result.hidden = false;
      showReceipt(status, 'Richiesta pronta nel gestionale.', name + ' · ' + data.get('service') + ' · ' + data.get('property') + ' · ' + data.get('timing'));
      hint.textContent = 'I dati sono stati raccolti e organizzati nella scheda.';
    });
  }
  /* Scenario 02 — browser-local appointment booking. No calendar or messaging API. */
  const bookingForm = document.querySelector('[data-ed-booking-form]');
  if (bookingForm) {
    const dashboard = document.querySelector('[data-ed-booking-dashboard]');
    const submit = bookingForm.querySelector('button[type="submit"]');
    const feedback = bookingForm.querySelector('[data-ed-booking-feedback]');
    const dateHeading = dashboard?.querySelector('[data-ed-booking-date-heading]');
    const result = dashboard?.querySelector('[data-ed-booking-result]');
    const empty = dashboard?.querySelector('[data-ed-booking-empty]');
    const booked = new Map();
    const dayInputs = [...bookingForm.querySelectorAll('[name="booking-day"]')];
    const slotInputs = [...bookingForm.querySelectorAll('[name="slot"]')];
    // Keep the three demo dates in the future; avoid suggesting a real appointment slot.
    const dates = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    while (dates.length < 3) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === 0 || cursor.getDay() === 6) continue;
      dates.push(new Date(cursor));
    }
    dates.forEach((date, index) => {
      const day = date.toLocaleDateString('it-IT', {weekday:'short',day:'numeric',month:'short'});
      const key = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
      dayInputs[index].value = key;
      bookingForm.querySelector('[data-ed-day-label="'+index+'"]')?.replaceChildren(document.createTextNode(day));
    });
    const currentDay = () => dayInputs.find(input => input.checked)?.value || dayInputs[0].value;
    const labelDay = () => dayInputs.find(input => input.checked)?.nextElementSibling?.textContent || '';
    const renderAgenda = () => {
      const day = currentDay();
      if (dateHeading) dateHeading.textContent = 'Agenda · ' + labelDay();
      for (const input of slotInputs) {
        const reservation = booked.get(day + '/' + input.value);
        input.disabled = !!reservation;
        const line = dashboard?.querySelector('[data-ed-agenda-slot="' + input.value + '"]');
        if (line) {
          line.textContent = reservation ? reservation.service : 'Disponibile';
          line.closest('.ed-flow-agenda-row')?.classList.toggle('is-booked', !!reservation);
        }
      }
      if (!slotInputs.some(input => input.checked && !input.disabled)) {
        const next = slotInputs.find(input => !input.disabled);
        slotInputs.forEach(input => { input.checked = input === next; });
      }
      submit.disabled = !slotInputs.some(input => !input.disabled);
      if (submit.disabled) feedback.textContent = 'Nessun altro orario disponibile in questo giorno della demo.';
    };
    dayInputs.forEach(input => input.addEventListener('change', () => {
      feedback.textContent = '';
      slotInputs.forEach(slot => {slot.checked = false;});
      renderAgenda();
    }));
    slotInputs.forEach(input => input.addEventListener('change', () => { feedback.textContent = ''; }));
    bookingForm.addEventListener('submit', event => {
      event.preventDefault();
      const slot = slotInputs.find(input => input.checked && !input.disabled);
      if (!slot) { renderAgenda(); return; }
      const day = currentDay();
      const service = String(bookingForm.elements.namedItem('booking-service')?.value || 'Consulenza');
      booked.set(day + '/' + slot.value, {service});
      const put = (selector,value) => {const node=dashboard?.querySelector(selector);if(node)node.textContent=value;};
      put('[data-ed-booking-service]',service);
      put('[data-ed-booking-day]',labelDay());
      put('[data-ed-booking-slot]',slot.value);
      put('[data-ed-booking-status]','Disponibilità aggiornata nella demo. Nessuna conferma è stata inviata.');
      empty.hidden = true;
      result.hidden = false;
      renderAgenda();
      showReceipt(feedback, 'Prenotazione aggiunta all’agenda demo.', service + ' · ' + labelDay() + ' alle ' + slot.value + (submit.disabled ? ' · Nessun altro orario disponibile in questo giorno.' : ''));
    });
    renderAgenda();
  }

  /* Scenario 03 — company-side publish -> customer portal. Browser-local only. */
  const portalForm = document.querySelector('[data-ed-portal-form]');
  if (portalForm) {
    const client = document.querySelector('[data-ed-portal-client]');
    const stage = portalForm.querySelector('[name="portal-status"]');
    const note = portalForm.querySelector('[name="portal-note"]');
    const feedback = portalForm.querySelector('[data-ed-portal-feedback]');
    const submit = portalForm.querySelector('button[type="submit"]');
    const notesByStage = {
      1: 'Il sopralluogo è terminato. Ti aggiorneremo sui prossimi passaggi.',
      2: 'Materiali ordinati. Stiamo preparando l’intervento.',
      3: 'L’intervento è stato programmato. Troverai qui i prossimi dettagli.',
      4: 'Lavori completati. La documentazione è disponibile nella tua area.'
    };
    const phases = {1:'Sopralluogo completato',2:'Materiali ordinati',3:'Intervento programmato',4:'Lavori completati'};
    const viewButtons = [...client.querySelectorAll('[data-ed-portal-view]')];
    const showView = view => {
      viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.edPortalView === view)));
      client.querySelectorAll('[data-ed-portal-section]').forEach(section => {section.hidden = section.dataset.edPortalSection !== view;});
    };
    viewButtons.forEach(button => button.addEventListener('click', () => showView(button.dataset.edPortalView)));
    stage.addEventListener('change', () => {
      note.value = notesByStage[stage.value] || '';
      feedback.textContent = '';
    });
    portalForm.addEventListener('submit', event => {
      event.preventDefault();
      const value = Number(stage.value);
      if (!phases[value]) return;
      const body = note.value.trim() || notesByStage[value];
      const put = (selector,text) => {const el=client.querySelector(selector);if(el)el.textContent=text;};
      put('[data-ed-portal-title]',phases[value]);
      put('[data-ed-portal-count]',value + ' di 4 fasi');
      put('[data-ed-portal-detail]',body);
      put('[data-ed-portal-pill]',value===4 ? 'Completato' : 'In corso');
      put('[data-ed-portal-client-status]','Aggiornamento pubblicato nella demo · nessun dato reale condiviso.');
      const progress=client.querySelector('[data-ed-portal-progress]');
      if(progress) {progress.setAttribute('aria-valuenow',String(value));const bar=progress.querySelector('i');if(bar)bar.style.transform='scaleX('+(value/4)+')';}
      showReceipt(feedback, 'Aggiornamento visibile nell’area cliente.', phases[value] + ' · ' + body);
      showView('status');
    });
    submit.disabled = false;
    showView('status');
  }
})();

/* Section 02: manual product views and a three-step, browser-local walkthrough.
   No autoplay, request, timer, storage or dependency on the laboratory. */
(() => {
  'use strict';
  const section=document.querySelector('#servizi');
  if(!section)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeAnimation;
  const reveal=element=>{
    if(activeAnimation)activeAnimation.cancel();
    if(!reduced.matches&&typeof element.animate==='function') {
      activeAnimation=element.animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
    }
  };
  reduced.addEventListener('change',()=>{if(reduced.matches&&activeAnimation)activeAnimation.cancel();});
  const controls=section.querySelector('.sol-field-controls');
  if(controls) {
    controls.hidden=false;
    controls.querySelectorAll('[data-filo-view]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.filoView;
      controls.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      ['day','job'].forEach(view=>{const img=section.querySelector('#sol-filo-'+view);img.hidden=view!==key;if(view===key)reveal(img);});
    }));
  }
  const workflow=section.querySelector('[data-sol-workflow]');
  if(!workflow)return;
  const tabs=[...workflow.querySelectorAll('[data-sol-step]')];
  const panels=[...workflow.querySelectorAll('.sol-stage')];
  const next=workflow.querySelector('[data-sol-next]');
  const status=workflow.querySelector('[data-sol-status]');
  const summaries=['Richiesta raccolta dal sito','Pratica creata nel gestionale','Attività assegnata al team'];
  const labels=['Apri la pratica','Passa al team','Rivedi dal sito'];
  let current=2;
  function select(index,animate=true){
    current=index;
    tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
    panels.forEach((panel,i)=>{panel.hidden=i!==index;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tabs[i].id);panel.tabIndex=0;});
    status.textContent=`${index+1} di 3 · ${summaries[index]}`;
    next.replaceChildren(document.createTextNode(labels[index]+' '));
    const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',index===2?'M4 10a8 8 0 1 1 1 8M4 4v6h6':'M4 12h16m-6-6 6 6-6 6');arrow.append(path);next.append(arrow);
    if(animate)reveal(panels[index]);
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(index));
    tab.addEventListener('keydown',event=>{
      let target;
      if(event.key==='ArrowRight')target=(index+1)%tabs.length;
      if(event.key==='ArrowLeft')target=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')target=0;
      if(event.key==='End')target=tabs.length-1;
      if(target===undefined)return;
      event.preventDefault();select(target);tabs[target].focus();
    });
  });
  next.addEventListener('click',()=>select((current+1)%tabs.length));
  workflow.classList.add('is-enhanced');
  workflow.querySelector('.sol-workflow-tabs').hidden=false;
  workflow.querySelector('.sol-workflow-footer').hidden=false;
  select(2,false);
})();
