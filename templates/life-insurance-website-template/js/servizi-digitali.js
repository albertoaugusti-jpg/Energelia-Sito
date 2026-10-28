(function () {
  var items = document.querySelectorAll('.ds-reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(function (item) { item.classList.add('is-visible'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
  items.forEach(function (item) { observer.observe(item); });
})();

(function () {
  var section = document.querySelector('[data-ds-immersive]');
  if (!section) return;

  var sticky = section.querySelector('.ds-imm-sticky');
  var intro = section.querySelector('[data-ds-intro]');
  var seed = section.querySelector('[data-ds-seed]');
  var finalCopy = section.querySelector('[data-ds-final]');
  var progressBar = section.querySelector('[data-ds-progress-bar]');
  var progressIndex = section.querySelector('[data-ds-progress-index]');
  var scrollCue = section.querySelector('[data-ds-scroll-cue]');
  var scenes = {
    site: section.querySelector('[data-ds-scene="site"]'),
    app: section.querySelector('[data-ds-scene="app"]'),
    management: section.querySelector('[data-ds-scene="management"]'),
    automation: section.querySelector('[data-ds-scene="automation"]')
  };
  var copies = {
    site: section.querySelector('[data-ds-copy="site"]'),
    app: section.querySelector('[data-ds-copy="app"]'),
    management: section.querySelector('[data-ds-copy="management"]'),
    automation: section.querySelector('[data-ds-copy="automation"]')
  };
  if (!sticky || !intro || !seed || !finalCopy || !scenes.site || !scenes.app || !scenes.management || !scenes.automation) return;

  var reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMq = window.matchMedia('(max-width: 991.98px)');
  var coarseMq = window.matchMedia('(pointer: coarse)');
  var state = { progress:0, pointerX:0, pointerY:0, smoothX:0, smoothY:0, raf:0, ticking:false };

  function clamp(v,a,b){ return Math.min(b,Math.max(a,v)); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function smooth(a,b,v){
    if(a===b) return v>=b?1:0;
    var t=clamp((v-a)/(b-a),0,1);
    return t*t*(3-2*t);
  }
  function windowPulse(v,a,b,c,d){ return smooth(a,b,v)*(1-smooth(c,d,v)); }
  function px(v){ return v.toFixed(2)+'px'; }
  function deg(v){ return v.toFixed(2)+'deg'; }

  function setScene(node, opt){
    var visible=opt.opacity>.006;
    node.style.opacity=opt.opacity.toFixed(4);
    node.style.visibility=visible?'visible':'hidden';
    node.style.filter='blur('+opt.blur.toFixed(2)+'px)';
    node.style.transform='translate3d(calc(-50% + '+px(opt.x)+'),calc(-50% + '+px(opt.y)+'),0) scale('+opt.scale.toFixed(4)+') rotateX('+deg(opt.rx)+') rotateY('+deg(opt.ry)+') rotateZ('+deg(opt.rz)+')';
  }
  function setCopy(node, opacity, y){
    if(!node) return;
    node.style.opacity=opacity.toFixed(4);
    node.style.visibility=opacity>.01?'visible':'hidden';
    node.style.transform='translate3d(0,calc(-50% + '+px(y)+'),0)';
  }


  var assemblyMaps={
    site:[
      [-40,-150,-2.2,.985],[-190,-25,-3.8,.96],[190,-60,3.6,.97],
      [0,145,-1.4,.985],[-160,105,-2.8,.96],[45,155,2.4,.97],[185,95,4.0,.95]
    ],
    management:[
      [-210,25,-3.8,.96],[80,-155,2.0,.98],[155,-35,3.0,.97],
      [-135,95,-2.4,.965],[175,55,3.2,.97],[-65,155,-1.6,.98],[190,130,3.8,.95]
    ]
  };
  function updateAssembly(scene, progress, kind){
    if(!scene) return;
    var pieces=scene.querySelectorAll('.ds-chapter-piece');
    var whole=scene.querySelector('.ds-chapter-image');
    var map=assemblyMaps[kind]||assemblyMaps.site;
    var n=pieces.length||1;
    pieces.forEach(function(piece,i){
      var delay=i*.045;
      var local=smooth(delay,Math.min(.78,delay+.58),progress);
      var inv=1-local;
      var cfg=map[i]||[0,0,0,1];
      piece.style.opacity=(1-smooth(.84,1,progress)).toFixed(4);
      piece.style.setProperty('--fragment-blur','0px');
      piece.style.filter='none';
      piece.style.transform='translate3d('+px(cfg[0]*inv)+','+px(cfg[1]*inv)+',0) scale('+lerp(cfg[3],1,local).toFixed(4)+') rotate('+deg(cfg[2]*inv)+')';
    });
    if(whole) whole.style.setProperty('--whole-opacity',smooth(.78,.96,progress).toFixed(4));
  }

  /* Measured once, so each connection actually draws its own entire path. */
  var orchPaths = {};
  var orchPackets = {};
  var orchKeys = ['input', 'task', 'data', 'team'];
  orchKeys.forEach(function(key){
    var path = scenes.automation.querySelector('[data-orch-wire="'+key+'"]');
    var packet = scenes.automation.querySelector('[data-orch-packet="'+key+'"]');
    if(!path) return;
    var length=path.getTotalLength();
    path.style.strokeDasharray=length.toFixed(2);
    orchPaths[key]={node:path,length:length};
    if(packet) orchPackets[key]=packet;
  });
  function setOrchPart(name, level, dx, dy){
    var k=clamp(level,0,1);
    scenes.automation.style.setProperty('--orch-'+name+'-visible',k.toFixed(4));
    scenes.automation.style.setProperty('--orch-'+name+'-x',px(dx*(1-k)));
    scenes.automation.style.setProperty('--orch-'+name+'-y',px(dy*(1-k)));
  }
  function drawOrchWire(key, level){
    var part=orchPaths[key];
    if(!part)return;
    var t=clamp(level,0,1);
    part.node.style.strokeDashoffset=(part.length*(1-t)).toFixed(2);
    var packet=orchPackets[key];
    if(packet){
      var pos=part.node.getPointAtLength(part.length*t);
      packet.setAttribute('cx',pos.x.toFixed(2));
      packet.setAttribute('cy',pos.y.toFixed(2));
      packet.style.opacity=(t>.07 && t<.96 ? Math.min(1,(t-.07)*7,(.96-t)*12):0).toFixed(3);
    }
  }

  /* Extend natural scroll travel without changing touch or wheel behavior. */
  function extendDesktopRunway(){
    section.style.removeProperty('height');
    if(mobileMq.matches || reducedMq.matches) return;
    var original = section.getBoundingClientRect().height;
    var viewport = window.innerHeight || document.documentElement.clientHeight || 1;
    if(original > viewport * 1.75){
      section.style.height = Math.round(original * 1.18) + 'px';
    }
  }

  function measure(){
    if(mobileMq.matches || reducedMq.matches) return 0;
    var r=section.getBoundingClientRect();
    var vh=window.innerHeight||document.documentElement.clientHeight||1;
    return clamp(-r.top/Math.max(1,section.offsetHeight-vh),0,1);
  }

  // Translate the original approved element-by-element chapter animations to a four-chapter timeline.
  function chapterPhase(progress, start, end, oldStart, oldEnd){ return oldStart+(progress-start)*(oldEnd-oldStart)/(end-start); }
  function apply(progress){
    var siteP=chapterPhase(progress,.065,.292,.09,.405);
    var mgP=chapterPhase(progress,.605,.800,.325,.635);
    var orchP=chapterPhase(progress,.792,.960,.575,.945);
    if(mobileMq.matches || reducedMq.matches) return;

    sticky.style.setProperty('--progress-scale',progress.toFixed(4));

    /* Intro gives way to the first materialization. */
    var introOut=smooth(.025,.095,progress);
    intro.style.setProperty('--intro-opacity',(1-introOut).toFixed(4));
    intro.style.setProperty('--intro-y',px(-24*introOut));
    intro.style.setProperty('--intro-pointer',introOut>.92?'none':'auto');
    seed.style.setProperty('--seed-opacity',(1-smooth(.035,.135,progress)).toFixed(4));
    seed.style.setProperty('--seed-blur',px(6*smooth(.065,.12,progress)));

    /* WEBSITE: the hero preview advances, straightens and resolves into the detailed full site. */
    var siteIn=smooth(.115,.215,siteP);
    var siteHold=1-smooth(.355,.405,siteP);
    var siteOpacity=siteIn*siteHold;
    var siteExit=smooth(.355,.405,siteP);
    var siteNarrative=1-smooth(.205,.255,siteP);
    setScene(scenes.site,{
      opacity:siteOpacity,
      x:lerp(180,0,siteIn)+150*siteNarrative-siteExit*70,
      y:lerp(32,0,siteIn)-siteExit*20,
      scale:lerp(.72,1,siteIn)-siteNarrative*.055-siteExit*.08,
      rx:lerp(3.5,0,siteIn)+siteExit*1.2,
      ry:lerp(-4.5,0,siteIn)-siteExit*2.2,
      rz:lerp(-2.2,0,siteIn)+siteExit*.6,
      blur:(1-siteIn)*5+siteExit*4
    });
    updateAssembly(scenes.site,smooth(.125,.270,siteP),'site');
    var nav=smooth(.125,.18,siteP)*siteHold;
    var copy=smooth(.14,.20,siteP)*siteHold;
    var visual=smooth(.155,.215,siteP)*siteHold;
    var strip=smooth(.175,.235,siteP)*siteHold;
    scenes.site.style.setProperty('--site-browser-y',px(-52*(1-nav)));scenes.site.style.setProperty('--site-browser-opacity',nav.toFixed(4));
    scenes.site.style.setProperty('--site-nav-y',px(-45*(1-nav)));scenes.site.style.setProperty('--site-nav-opacity',nav.toFixed(4));
    scenes.site.style.setProperty('--site-copy-x',px(-90*(1-copy)));scenes.site.style.setProperty('--site-copy-opacity',copy.toFixed(4));
    scenes.site.style.setProperty('--site-visual-x',px(110*(1-visual)));scenes.site.style.setProperty('--site-visual-opacity',visual.toFixed(4));
    scenes.site.style.setProperty('--site-strip-y',px(90*(1-strip)));scenes.site.style.setProperty('--site-strip-opacity',strip.toFixed(4));
    scenes.site.style.setProperty('--photo-x',px(-18*smooth(.18,.31,siteP)));
    setCopy(copies.site,windowPulse(siteP,.09,.12,.225,.265),6*(1-smooth(.09,.12,siteP)));

    /* APP: individual interface components materialize, then appointment is confirmed. */
    var appIn=smooth(.358,.406,progress), appOut=smooth(.585,.623,progress);
    var appLocal=clamp((progress-.360)/(.515-.360),0,1);
    setScene(scenes.app,{opacity:appIn*(1-appOut),x:60*(1-appIn)-24*appOut,y:26*(1-appIn),scale:.925+.075*appIn-.035*appOut,rx:1.5*(1-appIn),ry:-2*(1-appIn),rz:0,blur:4*(1-appIn)+2*appOut});
    var phone=scenes.app.querySelector('.app-device'), agenda=scenes.app.querySelector('.app-dashboard');
    var arrive=smooth(.025,.21,appLocal),agendaArrive=smooth(.28,.53,appLocal),confirm=smooth(.58,.77,appLocal);
    phone.style.opacity=arrive.toFixed(3);
    phone.style.transform='translate3d('+px(-64*(1-arrive))+','+px(28*(1-arrive))+',0) rotate('+deg(-6*(1-arrive))+') scale('+( .92+.08*arrive).toFixed(3)+')';
    agenda.style.opacity=agendaArrive.toFixed(3);
    agenda.style.transform='translate3d('+px(85*(1-agendaArrive))+','+px(12*(1-agendaArrive))+',0) scale('+( .94+.06*agendaArrive).toFixed(3)+')';
    [['.device-brand',.10,.34,-22],['.device-eyebrow',.16,.39,19],['.device-days',.24,.49,28],['.device-times',.37,.61,32],['.device-button',.49,.7,26]].forEach(function(item){var node=phone.querySelector(item[0]);if(!node)return;var v=smooth(item[1],item[2],appLocal);node.style.opacity=v.toFixed(3);node.style.transform='translateY('+px(item[3]*(1-v))+')';});
    phone.querySelector('.device-days').classList.toggle('v4-is-selected',appLocal>.34);
    phone.querySelector('.device-times').classList.toggle('v4-is-selected',appLocal>.50);
    phone.classList.toggle('v4-booking-confirmed',appLocal>.76);
    var booked=phone.querySelector('[data-device-confirm]'),newRow=agenda.querySelector('[data-dash-new]');
    booked.style.opacity=confirm.toFixed(3);booked.style.transform='translateY('+px(9*(1-confirm))+')';
    newRow.style.opacity=confirm.toFixed(3);newRow.style.transform='translateY('+px(8*(1-confirm))+')';
    agenda.querySelector('[data-dash-message]').textContent=appLocal>.76?'✓ Agenda aggiornata':'Disponibilità in attesa';
    var trail=scenes.app.querySelector('.app-data-trail');trail.style.opacity=agendaArrive.toFixed(3);trail.style.setProperty('--trail-fill',(smooth(.49,.82,appLocal)*100).toFixed(1)+'%');
    setCopy(copies.app,windowPulse(progress,.282,.305,.352,.390),5*(1-smooth(.282,.305,progress)));

    /* MANAGEMENT: the dashboard seen in the hero moves forward and becomes the operating workspace. */
    var mgIn=smooth(.365,.455,mgP);
    var mgHold=1-smooth(.585,.635,mgP);
    var mgOpacity=mgIn*mgHold;
    var mgExit=smooth(.585,.635,mgP);
    var mgNarrative=1-smooth(.445,.49,mgP);
    setScene(scenes.management,{
      opacity:mgOpacity,
      x:lerp(170,0,mgIn)+145*mgNarrative-mgExit*65,
      y:lerp(38,0,mgIn)-mgExit*18,
      scale:lerp(.73,1,mgIn)-mgNarrative*.05-mgExit*.08,
      rx:lerp(3.2,0,mgIn)+mgExit*1.2,
      ry:lerp(-3.8,0,mgIn)-mgExit*2.0,
      rz:lerp(2.0,0,mgIn)-mgExit*.6,
      blur:(1-mgIn)*5+mgExit*4
    });
    updateAssembly(scenes.management,smooth(.375,.515,mgP),'management');
    var side=smooth(.365,.425,mgP)*mgHold;
    var top=smooth(.385,.445,mgP)*mgHold;
    var workflow=smooth(.405,.475,mgP)*mgHold;
    var detail=smooth(.43,.49,mgP)*mgHold;
    scenes.management.style.setProperty('--mgmt-sidebar-x',px(-230*(1-side)));scenes.management.style.setProperty('--mgmt-sidebar-opacity',side.toFixed(4));
    scenes.management.style.setProperty('--mgmt-topbar-y',px(-90*(1-top)));scenes.management.style.setProperty('--mgmt-topbar-opacity',top.toFixed(4));
    scenes.management.style.setProperty('--mgmt-workflow-y',px(80*(1-workflow)));scenes.management.style.setProperty('--mgmt-workflow-scale',(lerp(.96,1,workflow)).toFixed(4));scenes.management.style.setProperty('--mgmt-workflow-opacity',workflow.toFixed(4));
    scenes.management.style.setProperty('--mgmt-detail-x',px(100*(1-detail)));scenes.management.style.setProperty('--mgmt-detail-opacity',detail.toFixed(4));
    setCopy(copies.management,windowPulse(mgP,.325,.355,.465,.505),6*(1-smooth(.325,.355,mgP)));

    /* AUTOMATION: trigger → orchestrator → three consequential actions.
       Crucially no child opacity is multiplied by the parent exit fade.
       0.805–0.915 is a real, independent, fully legible clean hold. */
    var orchEnter=smooth(.624,.675,orchP);
    var orchExit=smooth(.915,.945,orchP);
    var orchStory=1-smooth(.660,.720,orchP);
    setScene(scenes.automation,{
      opacity:orchEnter*(1-orchExit),
      x:112*orchStory-28*orchExit,
      y:lerp(55,0,orchEnter)-12*orchExit,
      scale:lerp(.88,1,orchEnter)-orchStory*.035-orchExit*.035,
      rx:lerp(3.5,0,orchEnter),ry:lerp(-4,0,orchEnter),rz:0,
      blur:(1-orchEnter)*5+orchExit*3
    });
    setOrchPart('heading',smooth(.638,.686,orchP),0,-16);
    setOrchPart('request',smooth(.642,.687,orchP),-54,16);
    setOrchPart('engine',smooth(.672,.727,orchP),0,28);
    setOrchPart('task',smooth(.718,.755,orchP),42,-10);
    setOrchPart('data',smooth(.746,.778,orchP),45,8);
    setOrchPart('team',smooth(.772,.803,orchP),45,14);
    drawOrchWire('input',smooth(.683,.721,orchP));
    drawOrchWire('task',smooth(.717,.753,orchP));
    drawOrchWire('data',smooth(.745,.777,orchP));
    drawOrchWire('team',smooth(.771,.803,orchP));
    scenes.automation.style.setProperty('--orch-energy',smooth(.675,.802,orchP).toFixed(4));
    setCopy(copies.automation,windowPulse(orchP,.575,.605,.661,.697),6*(1-smooth(.575,.605,orchP)));

    scenes.site.classList.toggle('is-resolved', siteP>=.275 && siteP<.35);
    scenes.management.classList.toggle('is-resolved', mgP>=.52 && mgP<.58);
    scenes.automation.classList.toggle('is-resolved', orchP>=.805 && orchP<.915);

    /* Final payoff */
    // The editorial finale enters as automation leaves; no empty scroll interval.
    var finalIn=smooth(.945,.98,progress);
    finalCopy.style.setProperty('--final-opacity',finalIn.toFixed(4));
    finalCopy.style.setProperty('--final-visibility',finalIn>.01?'visible':'hidden');
    finalCopy.style.setProperty('--final-y',px(35*(1-finalIn)));

    /* Retire chapter counter as the final payoff takes over. Restore on reverse scroll. */
    if(progressIndex && progressIndex.parentElement) progressIndex.parentElement.style.opacity=(1-smooth(.945,.98,progress)).toFixed(4);
    if(progressBar) progressBar.style.setProperty('--progress-scale',progress.toFixed(4));
    if(scrollCue) scrollCue.style.setProperty('--scroll-opacity',(1-smooth(.02,.11,progress)).toFixed(4));
    if(progressIndex){
      var n='00';
      if(progress>=.07&&progress<.30)n='01';
      else if(progress>=.30&&progress<.61)n='02';
      else if(progress>=.61&&progress<.80)n='03';
      else if(progress>=.80)n='04';
      progressIndex.textContent=n;
    }
  }

  function render(){ state.ticking=false;state.progress=measure();apply(state.progress); }
  function requestRender(){ if(!state.ticking){state.ticking=true;requestAnimationFrame(render);} if(!state.raf && !mobileMq.matches && !reducedMq.matches && !coarseMq.matches && section.getBoundingClientRect().bottom>0 && section.getBoundingClientRect().top<innerHeight){state.raf=requestAnimationFrame(pointerLoop);} }
  function pointerLoop(){
    if(mobileMq.matches||reducedMq.matches||coarseMq.matches){state.smoothX=0;state.smoothY=0;state.raf=0;return;}
    else{state.smoothX+=(state.pointerX-state.smoothX)*.055;state.smoothY+=(state.pointerY-state.smoothY)*.055;}
    sticky.style.setProperty('--ptr-x',state.smoothX.toFixed(3));
    sticky.style.setProperty('--ptr-y',state.smoothY.toFixed(3));
    if(section.getBoundingClientRect().bottom>0 && section.getBoundingClientRect().top<innerHeight){state.raf=requestAnimationFrame(pointerLoop);}
    else state.raf=0;
  }
  function responsiveReset(){
    if(mobileMq.matches||reducedMq.matches){
      intro.removeAttribute('style');seed.removeAttribute('style');finalCopy.removeAttribute('style');
      Object.keys(scenes).forEach(function(k){scenes[k].removeAttribute('style');});
      Object.keys(copies).forEach(function(k){if(copies[k])copies[k].removeAttribute('style');});
    } else requestRender();
  }

  if(!coarseMq.matches&&!reducedMq.matches){
    sticky.addEventListener('pointermove',function(e){var r=sticky.getBoundingClientRect();state.pointerX=clamp(((e.clientX-r.left)/r.width-.5)*2,-1,1);state.pointerY=clamp(((e.clientY-r.top)/r.height-.5)*2,-1,1);});
    sticky.addEventListener('pointerleave',function(){state.pointerX=0;state.pointerY=0;});
  }
  window.addEventListener('scroll',requestRender,{passive:true});
  window.addEventListener('resize',function(){extendDesktopRunway();responsiveReset();requestRender();},{passive:true});
  if(mobileMq.addEventListener) mobileMq.addEventListener('change',responsiveReset);
  if(reducedMq.addEventListener) reducedMq.addEventListener('change',responsiveReset);
  extendDesktopRunway();
  state.progress=measure();apply(state.progress);
  if(!reducedMq.matches&&!mobileMq.matches&&!coarseMq.matches) state.raf=requestAnimationFrame(pointerLoop);
  window.addEventListener('pagehide',function(){if(state.raf)cancelAnimationFrame(state.raf);});
})();
