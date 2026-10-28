/* Energelia P031 — subtle continuity motion for sections 01 → 02. */
(()=>{'use strict';
 const flows=[...document.querySelectorAll('[data-p31-flow]')];
 if(!flows.length || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const fine=matchMedia('(hover:hover) and (pointer:fine)');
 if(fine.matches){
  flows.forEach(section=>{
   let raf=0;
   const update=(x,y)=>{
    const r=section.getBoundingClientRect();
    const px=((x-r.left)/r.width)*100;
    const py=((y-r.top)/r.height)*100;
    section.style.setProperty('--p31-mx', `${Math.max(0,Math.min(100,px)).toFixed(2)}%`);
    section.style.setProperty('--p31-my', `${Math.max(0,Math.min(100,py)).toFixed(2)}%`);
   };
   section.addEventListener('pointermove',e=>{
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>update(e.clientX,e.clientY));
   },{passive:true});
   section.addEventListener('pointerleave',()=>{
    section.style.setProperty('--p31-mx','50%');
    section.style.setProperty('--p31-my','34%');
   },{passive:true});
  });
 }
})();
