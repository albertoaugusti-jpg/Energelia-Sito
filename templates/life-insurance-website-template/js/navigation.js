/* One controller for both triggers. No Bootstrap Collapse or story-scroll hooks. */
(() => {
 'use strict';
 const header=document.querySelector('[data-site-header]');
 if(!header)return;
 const menu=document.getElementById('site-menu'),floating=document.querySelector('[data-menu-floating]');
 const triggers=[...document.querySelectorAll('[data-menu-open]')];
 const mobile=matchMedia('(max-width:991.98px)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
 let opener=null,lastY=scrollY,turnY=lastY,direction=0,shown=false,closing=false,closeTimer,frame=0,previousOverflow='';
 header.classList.add('navigation-ready');floating.classList.add('navigation-ready');
 function showFloating(value){
  shown=!!value&&mobile.matches&&!menu.open;
  floating.classList.toggle('is-visible',shown);
  floating.setAttribute('aria-hidden',String(!shown));floating.tabIndex=shown?0:-1;
 }
 function resetDirection(){lastY=Math.max(0,scrollY);turnY=lastY;direction=0;}
 function updateScroll(){
  frame=0;
  const y=Math.max(0,Math.min(scrollY,document.documentElement.scrollHeight-innerHeight));
  const delta=y-lastY;
  if(!mobile.matches||menu.open||y<header.offsetHeight+32){showFloating(false);resetDirection();return;}
  if(Math.abs(delta)<2)return;
  const next=delta>0?1:-1;
  if(next!==direction){direction=next;turnY=lastY;}
  if(direction<0&&turnY-y>=28)showFloating(true);
  if(direction>0&&y-turnY>=16)showFloating(false);
  lastY=y;
 }
 function closeMenu(restore=true,immediate=false){
  if(!mobile.matches||!menu.open||closing)return;
  closing=true;menu.classList.add('is-closing');
  const finish=()=>{
   clearTimeout(closeTimer);menu.close();menu.classList.remove('is-closing');closing=false;
   document.body.style.overflow=previousOverflow;
   triggers.forEach(t=>t.setAttribute('aria-expanded','false'));
   resetDirection();showFloating(scrollY>=header.offsetHeight+32);
   // Let the dialog leave the top layer before restoring focus outside it.
   if(restore)requestAnimationFrame(()=>{
    (scrollY>=header.offsetHeight+32?floating:opener)?.focus({preventScroll:true});
   });
  };
  if(immediate||reduced.matches)finish();else closeTimer=setTimeout(finish,140);
 }
 function openMenu(event){
  if(!mobile.matches||menu.open)return;
  opener=event.currentTarget;showFloating(false);previousOverflow=document.body.style.overflow;
  menu.removeAttribute('open');menu.setAttribute('role','dialog');menu.showModal();
  document.body.style.overflow='hidden';triggers.forEach(t=>t.setAttribute('aria-expanded','true'));
  menu.querySelector('[data-menu-close]').focus({preventScroll:true});
 }
 function updateLayout(){
  const hadMenuFocus=menu.contains(document.activeElement);
  clearTimeout(closeTimer);menu.classList.remove('is-closing');closing=false;
  if(menu.open){menu.close();document.body.style.overflow=previousOverflow;}
  triggers.forEach(t=>t.setAttribute('aria-expanded','false'));
  if(mobile.matches){menu.setAttribute('role','dialog');}else{menu.setAttribute('role','presentation');menu.setAttribute('open','');}
  resetDirection();showFloating(false);
  if(hadMenuFocus)requestAnimationFrame(()=>{
   (mobile.matches?triggers[0]:menu.querySelector('[aria-current]')||menu.querySelector('a'))?.focus({preventScroll:true});
  });
 }
 triggers.forEach(t=>t.addEventListener('click',openMenu));
 menu.querySelector('[data-menu-close]').addEventListener('click',()=>closeMenu());
 menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
 menu.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!mobile.matches)return;
  const items=[...menu.querySelectorAll('a[href],button:not([disabled])')];
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 menu.addEventListener('click',e=>{if(e.target===menu){const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right)closeMenu();}if(e.target.closest('a'))closeMenu(false,true);});
 window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(updateScroll);},{passive:true});
 mobile.addEventListener('change',updateLayout);
 window.addEventListener('pageshow',()=>{resetDirection();showFloating(false);});
 updateLayout();
})();
