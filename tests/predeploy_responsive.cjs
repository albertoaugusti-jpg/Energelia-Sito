/* Read-only responsive QA against the isolated real app on 5057. */
const {chromium,webkit}=require('playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:5057';
const out=process.env.DIGITAL_QA_OUTPUT||'/tmp/energelia-predeploy-responsive';
const widths=process.env.QA_INTERACTIONS_ONLY ? [] : [320,375,390,430,768,1440];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const report={views:[],interactions:[],errors:[],failedLocal:[],unexpectedPosts:[],webkit:'not installed'};
 const browser=await chromium.launch();
 async function open(width,path,motion='reduce'){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<1000,reducedMotion:motion,locale:'it-IT'});
  await context.addInitScript(()=>localStorage.setItem('energelia_cookie_consent','rejected'));
  await context.route('**/*',route=>{
   const r=route.request();
   if(r.method()==='POST'){report.unexpectedPosts.push(r.url());return route.abort();}
   if(/google-analytics|googletagmanager|doubleclick|youtube|facebook/.test(r.url()))return route.abort();
   if(r.url().endsWith('/api/news'))return route.fulfill({json:{items:[],count:0}});
   return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({path,width,message:e.message}));
  page.on('response',r=>{if(r.url().startsWith(base+'/static/')&&r.status()>=400)report.failedLocal.push({path,status:r.status(),url:r.url()});});
  const response=await page.goto(base+path,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  return {page,context,status:response.status()};
 }
 async function metrics(page,path,width,status){
  const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,brokenImages:[...document.images].filter(i=>i.getAttribute('src')&&i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),h1Visible:[...document.querySelectorAll('h1')].some(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),outside:[...document.querySelectorAll('main button,main input,main select,main textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>2&&r.height>2&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&(r.left< -1||r.right>innerWidth+1)}).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,45),name:e.name,cls:e.className}))}));
  report.views.push({path,width,status,...data});
 }
 async function menu(page,width){
  if(width>768)return;
  const uc=page.locator('[data-uc-menu-trigger]');
  if(await uc.isVisible()) {await uc.click();assert.equal(await uc.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await uc.getAttribute('aria-expanded'),'false');}
  else {const trigger=page.locator('.site-header [data-menu-open]');if(await trigger.isVisible()){await trigger.click();assert.equal(await trigger.getAttribute('aria-expanded'),'true');await page.locator('[data-menu-close]').click();assert.equal(await trigger.getAttribute('aria-expanded'),'false');}}
 }
 const catalog=await open(390,'/casi-uso');
 const paths=await catalog.page.locator('.uc-card-live').evaluateAll(es=>es.map(e=>new URL(e.href).pathname));assert.equal(paths.length,15);await catalog.context.close();
 const main=['/','/chi-siamo','/servizi-digitali','/fotovoltaico','/axpo','/Appalto','/Finanza','/italbandi-news','/rete-enercubica','/casi-uso'];
 for(const width of widths){
  for(const path of [...main,...paths]){
   const {page,context,status}=await open(width,path);
   try{
    await menu(page,width);
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(50);await page.evaluate(()=>scrollTo(0,0));
    await metrics(page,path,width,status);
    if(path==='/casi-uso'){
     assert.deepEqual(await page.locator('.el-cat-steps strong:visible').allTextContents(),['Scegli un esempio','Prova i passaggi','Guarda il risultato']);
     for(const service of ['sito','app','gestionale','automazioni']){
      await page.locator('[data-el-service]').selectOption(service);
      const n=await page.locator('.uc-card-live:visible').count();assert.ok(n>0&&n<15);assert.ok((await page.locator('[data-el-count]').innerText()).includes(String(n)));
     }
     await page.locator('[data-el-reset]').click();assert.equal(await page.locator('.uc-card-live:visible').count(),15);
     if([320,390,1440].includes(width))await page.screenshot({path:`${out}/catalog-${width}.png`,fullPage:true});
    }
    if(path==='/servizi-digitali'&&[320,390,1440].includes(width)){await page.locator('.ed-service-choice input[value=automazioni]').check();await page.locator('.ed-form-wrap').screenshot({path:`${out}/compact-form-${width}.png`});}
    if(paths.includes(path)&&[320,390,1440].includes(width)){
     await page.locator('.uc-demo-backdrop').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${path.slice(1)}-${width}.png`});
    }
    if(width===390&&main.includes(path)&&path!=='/casi-uso'&&path!=='/servizi-digitali')await page.screenshot({path:`${out}/public-${path.replaceAll('/','')||'home'}-390.png`});
   }catch(e){report.errors.push({path,width,message:e.message});}
   await context.close();
  }
  console.log('viewport completed',width);
 }
 for(const width of [390,1440])for(const path of paths.filter((_,i)=>!process.env.QA_CASE||i+1===Number(process.env.QA_CASE))){
  const {page,context}=await open(width,path,'no-preference');
  const click=async s=>page.locator(s).first().click({timeout:5000});
  try{
   const n=paths.indexOf(path)+1;
   if(n<=3){if(n===1)await page.locator('[data-uc-input-title]').fill('Serramenti per la tua casa');if(n===2)await page.locator('[data-uc-product-price]').fill('550');if(n===3)await page.locator('[data-uc-review=anna]').check();await click('[data-uc-preview]');await click('[data-uc-publish]');assert.equal(await page.locator('[data-uc-phase=published]').count(),1);}
   if(n===4){await click('[data-pc-inbox-send]');await page.locator('[data-pc-inbox-assignee]').selectOption({index:1});await click('[data-pc-inbox-assign]');await click('[data-pc-inbox-start]');}
   if(n===5){await click('form button[type=submit]');await click('[data-pc-quote-generate]');}
   if(n===6){await click('[data-pc-book-days] button:not(:disabled)');await click('[data-pc-book-times] button:not(:disabled)');await click('[data-pc-book-submit]');await click('[data-pc-book-submit]');}
   if(n===7){await click('[data-pc-order-submit]');await click('[data-pc-order-start]');await click('[data-pc-order-ready]');}
   if(n===8){await click('[data-pc-enroll-submit]');await click('[data-pc-enroll-checkin]');}
   if(n===9){await click('[data-ux-customer=anna]');await click('[data-ux-history-tab=notes]');await page.locator('[data-ux-history-note-input]').fill('Controllo QA della nota cliente.');await click('button[type=submit]');}
   if(n===10){await click('[data-ux-job]');await page.locator('[data-ux-assign-technician]').selectOption({index:1});await click('[data-ux-action-assign]');if(await page.locator('[data-ux-board-tab=active]').isVisible())await click('[data-ux-board-tab=active]');await click('[data-ux-cards=active] [data-ux-job]');await click('[data-ux-action-finish]');}
   if(n===11){await click('[data-ux-portal-open-docs]');await click('[data-ux-portal-doc=plan]');await click('[data-ux-viewer-close]');}
   if(n===12){await click('[data-ux-stock-item]');await click('[data-ux-stock-submit]');}
   if(n===13){await click('[data-ua-job-analyze]');await click('button[type=submit]');}
   if(n===14){await click('[data-ua-reminder-check]');await click('[data-ua-reminder-send]');}
   if(n===15){await click('[data-ua-report-close]');}
   await page.waitForTimeout(200);await metrics(page,path+'#interaction',width,200);
   await page.screenshot({path:`${out}/interaction-${n}-${width}.png`});report.interactions.push({path,width,result:'completed'});
  }catch(e){report.interactions.push({path,width,result:'failed',message:e.message});}
  await context.close();
 }
 // Exercise scrolling both ways with normal motion, and the reduced-motion variant.
 if(!process.env.QA_CASE)for(const width of [390,1440])for(const motion of ['no-preference','reduce']){
  const {page,context}=await open(width,'/servizi-digitali',motion);
  const sample=[];for(const fraction of [0,.2,.4,.6,.8,1,.5,0]){await page.evaluate(f=>scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*f,behavior:'instant'}),fraction);await page.waitForTimeout(120);sample.push(await page.evaluate(()=>scrollY));}
  assert.ok(sample.some(y=>y>100));assert.equal(sample.at(-1),0);report.interactions.push({path:'/servizi-digitali#scroll',width,motion,result:'completed'});await context.close();
 }
 await browser.close();
 try{const wk=await webkit.launch();report.webkit='available';await wk.close();}catch(e){report.webkit='unavailable: '+e.message.split('\n')[0];}
 fs.writeFileSync(out+'/responsive.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({views:report.views.length,overflow:report.views.filter(v=>v.overflow),outside:report.views.filter(v=>v.outside.length),errors:report.errors,failedLocal:report.failedLocal,failedInteractions:report.interactions.filter(v=>v.result==='failed'),webkit:report.webkit},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
