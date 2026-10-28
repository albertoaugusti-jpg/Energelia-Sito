/* Energelia catalog: two native filters, URL persistence, grouped results. */
(()=>{
  'use strict';
  const serviceSelect=document.querySelector('select[data-el-service]');
  const goalSelect=document.querySelector('select[data-el-goal]');
  if(!serviceSelect||!goalSelect)return;
  const cards=[...document.querySelectorAll('[data-el-services][data-el-goals]')];
  const groups=[...document.querySelectorAll('[data-el-section]')];
  const count=document.querySelector('[data-el-count]');
  const empty=document.querySelector('[data-el-empty]');
  const valid=(select,value)=>[...select.options].some(option=>option.value===value);
  function paint(){
    const service=serviceSelect.value,goal=goalSelect.value;
    let visible=0;
    cards.forEach(card=>{
      const services=card.dataset.elServices.split(' ');
      const goals=card.dataset.elGoals.split(' ');
      const show=(service==='all'||services.includes(service))&&(goal==='all'||goals.includes(goal));
      card.hidden=!show;
      if(show)visible++;
    });
    groups.forEach(group=>{group.hidden=![...group.querySelectorAll('[data-el-services]')].some(card=>!card.hidden);});
    if(count)count.textContent=visible+' '+(visible===1?'caso disponibile':'casi disponibili');
    if(empty)empty.hidden=visible!==0;
  }
  function writeUrl(){
    try{
      const url=new URL(location.href);
      if(serviceSelect.value==='all')url.searchParams.delete('servizio');
      else url.searchParams.set('servizio',serviceSelect.value);
      if(goalSelect.value==='all')url.searchParams.delete('obiettivo');
      else url.searchParams.set('obiettivo',goalSelect.value);
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }catch(error){/* Preview without History API. */}
  }
  function readUrl(){
    const params=new URLSearchParams(location.search);
    const service=params.get('servizio'),goal=params.get('obiettivo');
    serviceSelect.value=valid(serviceSelect,service)?service:'all';
    goalSelect.value=valid(goalSelect,goal)?goal:'all';
    paint();
  }
  const changed=()=>{paint();writeUrl();};
  serviceSelect.addEventListener('change',changed);
  goalSelect.addEventListener('change',changed);
  document.querySelector('[data-el-reset]')?.addEventListener('click',()=>{
    serviceSelect.value='all';goalSelect.value='all';changed();
  });
  window.addEventListener('popstate',readUrl);
  readUrl();
})();
