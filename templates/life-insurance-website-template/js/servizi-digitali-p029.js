/* P029 — One accessible before/after lab and a genuine in-page image viewer. */
(()=>{'use strict';
 const choices=[...document.querySelectorAll('[data-p29-choice]')];
 const cases=[...document.querySelectorAll('[data-p29-case]')];
 const compare=document.querySelector('[data-p29-compare]');
 const slider=document.querySelector('[data-p29-slider]');
 const sceneTitle=document.querySelector('[data-p29-scene-title]');
 const mobileModes=[...document.querySelectorAll('[data-p29-mode]')];
 const labels=['01 / LE RICHIESTE','02 / IL LAVORO','03 / I DATI'];
 const mobile=matchMedia('(max-width:600px)');
 if(choices.length===3 && cases.length===3 && compare && slider){
  function setChoice(i,focus=false){
   choices.forEach((b,n)=>{const selected=n===i;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;if(selected && focus)b.focus();});
   cases.forEach((c,n)=>{c.hidden=n!==i;c.classList.toggle('is-active',n===i)});
   if(sceneTitle)sceneTitle.textContent=labels[i];
  }
  choices.forEach((b,i)=>{
   b.addEventListener('click',()=>setChoice(i));
   b.addEventListener('keydown',e=>{
    let dest=null;
    if(e.key==='ArrowRight'||e.key==='ArrowDown')dest=(i+1)%3;
    if(e.key==='ArrowLeft'||e.key==='ArrowUp')dest=(i+2)%3;
    if(e.key==='Home')dest=0;
    if(e.key==='End')dest=2;
    if(dest!==null){e.preventDefault();setChoice(dest,true)}
   });
  });
  const refresh=()=>compare.style.setProperty('--p29-after',slider.value+'%');
  slider.addEventListener('input',refresh);refresh();
  // Allow touching and dragging directly on the comparison surface.
  let drag=false;
  const updatePointer=e=>{const r=compare.getBoundingClientRect();const pct=Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100);slider.value=pct;refresh()};
  compare.addEventListener('pointerdown',e=>{if(mobile.matches)return;drag=true;compare.setPointerCapture(e.pointerId);updatePointer(e)});
  compare.addEventListener('pointermove',e=>{if(drag&&!mobile.matches)updatePointer(e)});
  compare.addEventListener('pointerup',()=>{drag=false});
  compare.addEventListener('pointercancel',()=>{drag=false});
  mobileModes.forEach(b=>b.addEventListener('click',()=>{
   const before=b.dataset.p29Mode==='before';compare.classList.toggle('is-before',before);
   mobileModes.forEach(el=>el.setAttribute('aria-pressed',String(el===b)));
  }));
  document.querySelectorAll('[data-p29-jump]').forEach(link=>link.addEventListener('click',()=>setChoice(Number(link.dataset.p29Jump))));
 }
 const dialog=document.querySelector('[data-p29-lightbox]');
 if(dialog && typeof dialog.showModal==='function'){
  const img=dialog.querySelector('img'),close=dialog.querySelector('[data-p29-close]');
  document.querySelectorAll('[data-p29-enlarge]').forEach(b=>b.addEventListener('click',()=>{
   const source=b.parentElement.querySelector('img');if(!source)return;
   img.src=source.currentSrc||source.src;img.alt=source.alt;dialog.showModal();
  }));
  close?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.addEventListener('close',()=>{img.removeAttribute('src')});
 }
})();
