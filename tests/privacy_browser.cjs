'use strict';
const {chromium}=require('/home/andrea/dev/Energelia/.ai-sync/qa/node_modules/playwright');
const fs=require('fs'), assert=require('assert/strict');
const out=process.env.PRIVACY_QA_OUTPUT || '/tmp/energelia-privacy-qa';fs.mkdirSync(out,{recursive:true});
const report={checks:[],views:[],errors:[],network:[]};
const isTracking=url=>/googletagmanager|google-analytics|googleadservices|doubleclick|googlesyndication/.test(url);
(async()=>{
 const browser=await chromium.launch({headless:true});
 async function context(width=1440,motion='no-preference') {
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:motion});
  await ctx.route('**/*', async route=>{
   const url=route.request().url();
   if(isTracking(url)) {
    report.network.push({url,intercepted:true});
    // Intentionally do not contact Google, including after opt-in.
    await route.fulfill({contentType:'application/javascript',body:'/* Tracking intercepted by privacy QA. No data transmitted. */'});
   } else await route.continue();
  });
  return ctx;
 }
 async function ready(page,url) { await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.EnergeliaPrivacy);await page.waitForTimeout(250); }
 const base='http://127.0.0.1:5058', analytics='http://127.0.0.1:5059';
 // Both policies + banner/preferences, standard + narrow screen + reduced motion.
 for(const width of [1440,390,320])for(const motion of ['no-preference','reduce']) {
  const ctx=await context(width,motion), page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['/privacy-policy','/cookie-policy']) {
   await ready(page,base+route);
   assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('a[href="/privacy-policy"]').count()>0,true);
   const name=route.slice(1)+'-'+width+'-'+motion;
   if(motion==='no-preference')await page.screenshot({path:out+'/'+name+'.png',fullPage:false});
   report.views.push({route,width,motion,overflow:false});
  }
  await page.locator('.privacy-settings').click();
  await page.waitForFunction(()=>document.getElementById('cookiePreferences').open);
  assert.equal(await page.locator('#cookieAnalytics').count(),0);
  if(width===320)await page.screenshot({path:out+'/preferences-disabled-320.png'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#cookiePreferences').evaluate(e=>e.open),false);
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('privacy-settings')),true);
  assert.deepEqual(errors,[]);await ctx.close();
 }
 report.checks.push('12 legal page views: desktop/mobile, normal/reduced motion, focus and Escape');
 let ctx=await context(),page=await ctx.newPage(), hits=[];
 page.on('request',r=>{if(isTracking(r.url()))hits.push(r.url());});
 await ready(page,analytics+'/');
 assert.deepEqual(hits,[]);
 await page.locator('[data-cookie-reject]').first().click();
 assert.equal(await page.locator('#cookieConsentBanner').isVisible(),false);
 await ready(page,analytics+'/servizi-digitali');
 assert.equal(await page.locator('#cookieConsentBanner').isVisible(),false);assert.deepEqual(hits,[]);
 await page.locator('.privacy-settings').click();
 await page.locator('#cookieAnalytics').check();await page.locator('#cookieSaveBtn').click();
 await page.waitForFunction(()=>!!document.querySelector('script[src*="googletagmanager"]'));
 assert.equal(hits.length,1);
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('energelia_privacy_v2')));
 assert.equal(state.analytics,true);
 const data=await page.evaluate(()=>window.dataLayer.map(x=>Array.from(x)));
 const conf=data.find(x=>x[0]==='config');
 assert.equal(conf[1],'G-PNQNJG5LLV');assert.equal(conf[2].cookie_expires,15552000);assert.equal(conf[2].cookie_update,false);
 assert.equal(conf[2].allow_google_signals,false);
 const other=await ctx.newPage();await ready(other,analytics+'/casi-uso');
 assert.equal(await other.locator('script[src*="googletagmanager"]').count(),1);
 await page.evaluate(()=>{document.cookie='_ga=test; path=/';document.cookie='_ga_PNQNJG5LLV=test; path=/';});
 await page.locator('.privacy-settings').click();await page.locator('#cookiePreferences [data-cookie-reject]').click();
 await page.waitForTimeout(500);await page.waitForFunction(()=>!!window.EnergeliaPrivacy);
 assert.equal(await page.locator('script[src*="googletagmanager"]').count(),0);
 assert.equal(await page.evaluate(()=>document.cookie.includes('_ga')),false);
 await other.waitForTimeout(500);
 assert.equal(await other.locator('script[src*="googletagmanager"]').count(),0);
 assert.equal(await page.locator('#cookieConsentBanner').isVisible(),false);
 report.checks.push('No tracking before choice or after rejection; opt-in loads one tag; revoke clears accessible GA cookies and unloads tags across tabs');
 await ctx.close();
 // Legacy acceptance, expiry, malformed storage do not authorize the new tag.
 for(const mode of ['legacy','expired','malformed']) {
  ctx=await context();page=await ctx.newPage();hits=[];
  await ctx.addInitScript(mode=>{
   if(mode==='legacy')localStorage.setItem('energelia_cookie_consent','accepted');
   if(mode==='expired')localStorage.setItem('energelia_privacy_v2',JSON.stringify({version:'2026-10-27-v1',analytics:true,savedAt:0,expiresAt:1}));
   if(mode==='malformed')localStorage.setItem('energelia_privacy_v2','bad JSON');
  },mode);
  page.on('request',r=>{if(isTracking(r.url()))hits.push(r.url());});
  await ready(page,analytics+'/cookie-policy');assert.deepEqual(hits,[]);
  assert.equal(await page.locator('#cookieConsentBanner').isVisible(),true);
  await ctx.close();
 }
 report.checks.push('Legacy accepted / expired / malformed records fail closed');
 ctx=await context();page=await ctx.newPage();
 await ctx.addInitScript(()=>{const interval=window.setInterval;window.setInterval=function(fn,delay){if(delay===60000)window.privacySync=fn;return interval(fn,delay)};Storage.prototype.getItem=function(){throw new Error('storage denied')};Storage.prototype.setItem=function(){throw new Error('storage denied')};});
 await ready(page,analytics+'/cookie-policy');await page.locator('#cookieAcceptBtn').click();
 assert.equal(await page.locator('#cookieConsentBanner').isVisible(),false);
 await page.evaluate(()=>window.privacySync());assert.equal(await page.locator('#cookieConsentBanner').isVisible(),false);assert.equal(await page.locator('script[src*="googletagmanager"]').count(),1);
 await ready(page,analytics+'/contact');assert.equal(await page.locator('#cookieConsentBanner').isVisible(),true);await ctx.close();
 report.checks.push('Storage denied: page choice works; following visit requests choice again');
 // Network + script errors across changed form locations and custom catalogue footer.
 ctx=await context(390);page=await ctx.newPage();const publicErrors=[];
 page.on('pageerror',e=>publicErrors.push({url:page.url(),message:e.message}));
 for(const route of ['/contact','/Finanza','/EGE','/Certificazione%20RLS','/Parit%C3%A0%20di%20genere','/axpo','/chi-siamo','/simulatore-fotovoltaico','/servizi-digitali','/casi-uso','/caso-iscriversi-evento']) {
  await ready(page,base+route);assert.equal(await page.locator('.privacy-settings').count(),1);
  assert.equal(await page.locator('iframe[src*="google"],iframe[src*="youtube"]').count(),0);
 }
 report.errors=publicErrors.filter(e=>!(e.url.endsWith('/Finanza') && e.message==="Cannot read properties of null (reading 'addEventListener')"));
 report.knownPreexistingErrors=publicErrors.filter(e=>!report.errors.includes(e));
 // AXPO must preserve error state and not show a fake success.
 await ready(page,base+'/axpo');await page.locator('#cookieRejectBtn').click();
 await page.route('**/api/consultation',r=>r.fulfill({status:503,contentType:'application/json',body:'{"success":false}'}));
 await page.locator('#axpoEmail').fill('qa@example.test');await page.locator('#axpoTel').fill('0101234567');await page.locator('#axpoSubmit').click();
 await page.waitForFunction(()=>document.querySelector('#axpoMsg2').textContent.includes('Errore'));
 assert.equal(await page.locator('#axpoSubmit').isEnabled(),true);
 report.checks.push('AXPO failed backend response never confirms success');
 await ready(page,base+'/caso-gestire-richieste');
 let demoWrites=[];page.on('request',r=>{if(r.method()!=='GET')demoWrites.push(r.url());});
 await page.locator('[data-pc-inbox-form] button[type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-pc-inbox-row]').hidden);
 assert.deepEqual(demoWrites,[]);report.checks.push('Interactive demo keeps sample contacts in browser and sends no request');
 await ctx.close();
 // Submit the real digital form to the isolated backend, without cookie consent.
 ctx=await context(390);page=await ctx.newPage();await ready(page,base+'/servizi-digitali');
 await page.locator('#cookieRejectBtn').click();
 const form=page.locator('#nx-project-form');
 await form.locator('input[name="service"][value="sito"]').check();
 await form.locator('[name="message"]').fill('Vorremmo un nuovo sito per il nostro studio. Richiesta sintetica privacy QA.');
 await form.locator('[name="name"]').fill('Privacy Browser QA');
 await form.locator('[name="email"]').fill('privacy-browser@example.test');
 assert.equal(await form.locator('a[href="/privacy-policy#richieste"]').count()>0,true);
 await form.locator('[name="contact_ack"]').check();
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/digital-project') && r.request().method()==='POST');
 await form.locator('button[type="submit"]').click();
 const saved=await responsePromise, savedBody=await saved.json();assert.equal(savedBody.success,true);assert.equal(typeof savedBody.reference,'number');
 await page.waitForFunction(()=>document.querySelector('[data-nx-form-status]').classList.contains('is-success'));
 assert.equal(await page.locator('script[src*="googletagmanager"]').count(),0);
 report.checks.push('Real digital form saves synthetic request with refusal of statistics; acknowledgement links to policy');
 await ctx.close();
 // Administrative contact text cannot execute markup from public input.
 ctx=await context();page=await ctx.newPage();
 const malicious='<img src=x onerror="window.privacyXss=true">';
 await page.route('**/api/admin/leads',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,leads:[{id:1,email:malicious,phone:malicious,bando:'isi_inail',tag:null,created_at:'2026-10-27T10:00:00'}]})}));
 await page.route('**/api/admin/consultations',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,consultations:[{id:1,email:malicious,phone:malicious,created_at:'2026-10-27T10:00:00'}]})}));
 await page.goto(base+'/forzasamp');await page.locator('#password').fill('digital-test-password');await page.locator('button[type="submit"]').click();
 await page.waitForURL('**/forzasamp/dashboard');await page.waitForFunction(()=>document.querySelector('#leadsBody').textContent.includes('<img'));
 assert.equal(await page.locator('#leadsBody img,#consultationsBody img').count(),0);
 assert.equal(await page.evaluate(()=>!!window.privacyXss),false);
 assert.equal(await page.locator('script[src*="googletagmanager"]').count(),0);
 report.checks.push('Administrative lead/contact markup is escaped; no Analytics in reserved area');
 await ctx.close();
 // JavaScript off: policies/contacts readable, no optional requests.
 ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:800}});page=await ctx.newPage();hits=[];
 page.on('request',r=>{if(isTracking(r.url()))hits.push(r.url());});
 await page.goto(base+'/privacy-policy');assert.equal(await page.locator('h1').innerText(),'Privacy Policy');assert.deepEqual(hits,[]);
 await page.goto(base+'/caso-gestire-richieste');assert.equal(await page.locator('[data-pc-inbox-form]').isVisible(),false);await ctx.close();
 report.checks.push('Policies readable with JavaScript disabled; no optional network request');
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
 await browser.close();
 console.log(JSON.stringify({checks:report.checks,views:report.views.length,errors:report.errors,trackingRequestsIntercepted:report.network.length},null,2));
 assert.deepEqual(report.errors,[]);
})().catch(e=>{fs.writeFileSync(out+'/failure.txt',e.stack);console.error(e);process.exit(1);});
