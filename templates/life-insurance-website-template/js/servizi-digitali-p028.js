/* Energelia P028 — one accessible problem-led case selector. */
(function(){'use strict';
 const tabs=[...document.querySelectorAll('[data-p28-choice]')];
 const panels=[...document.querySelectorAll('[data-p28-scene]')];
 if(!tabs.length || tabs.length!==panels.length) return;
 function choose(i,focus){
  tabs.forEach((tab,n)=>{const on=n===i;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;tab.classList.toggle('is-selected',on);if(on&&focus)tab.focus();});
  panels.forEach((panel,n)=>{const on=n===i;panel.hidden=!on;panel.classList.toggle('is-visible',on);});
 }
 tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>choose(i,false));
  tab.addEventListener('keydown',e=>{
   let next=null;
   if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;
   else if(e.key==='ArrowDown'||e.key==='ArrowRight')next=(i+1)%tabs.length;
   else if(e.key==='ArrowUp'||e.key==='ArrowLeft')next=(i-1+tabs.length)%tabs.length;
   if(next!==null){e.preventDefault();choose(next,true);}
  });
 });
 document.querySelectorAll('[data-p28-jump]').forEach(link=>link.addEventListener('click',()=>choose(Number(link.getAttribute('data-p28-jump')),false)));
})();
