'use strict';
const {chromium}=require('/home/andrea/dev/Energelia/.ai-sync/qa/node_modules/playwright');
const assert=require('assert/strict'), fs=require('fs');
const out='/tmp/energelia-legal-editorial';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch();const report={views:[],errors:[],tracking:[],checks:[]};
 for(const width of [1440,320])for(const motion of ['no-preference','reduce']) {
  const ctx=await b.newContext({viewport:{width,height:900},reducedMotion:motion});
  await ctx.route('**/*',r=>{
   if(!r.request().url().startsWith('http://127.0.0.1:5075')) {
    if(/googletagmanager|google-analytics|googleadservices|doubleclick/.test(r.request().url()))report.tracking.push(r.request().url());
    return r.abort();
   }
   return r.continue();
  });
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  for(const route of ['/privacy-policy','/cookie-policy']) {
   await p.goto('http://127.0.0.1:5075'+route,{waitUntil:'networkidle'});
   await p.waitForFunction(()=>!!window.EnergeliaPrivacy);
   assert.equal(await p.locator('#cookieConsentBanner').count(),0);
   assert.equal(await p.locator('.legal-review').count(),0);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await p.evaluate(()=>localStorage.getItem('energelia_privacy_v2')),null);
   assert.equal(await p.locator('h1').count(),1);
   if(motion==='no-preference')await p.screenshot({path:out+'/'+route.slice(1)+'-'+width+'.png'});
   report.views.push({route,width,motion,overflow:false});
  }
  await p.locator('.privacy-settings').click();
  assert.equal(await p.locator('#cookiePreferences').evaluate(e=>e.open),true);
  assert.equal(await p.locator('#cookieAcceptBtn,#cookieSaveBtn,#cookieAnalytics').count(),0);
  assert.equal(await p.locator('#cookieResetBtn').count(),1);
  if(motion==='no-preference')await p.screenshot({path:out+'/cookie-information-'+width+'.png'});
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('privacy-settings')),true);
  // Historical acceptance never loads tracking or a banner; reset creates no replacement choice.
  await p.evaluate(()=>{
   localStorage.setItem('energelia_cookie_consent','accepted');
   localStorage.setItem('energelia_privacy_v2',JSON.stringify({version:'2026-10-27-v1',analytics:true,savedAt:Date.now(),expiresAt:Date.now()+1e8}));
   document.cookie='_ga=old;path=/';
  });
  await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>!!window.EnergeliaPrivacy);
  assert.equal(await p.locator('script[src*="googletagmanager"]').count(),0);
  assert.equal(await p.locator('#cookieConsentBanner').count(),0);
  assert.equal(await p.evaluate(()=>document.cookie.includes('_ga=')),false);
  await p.locator('.privacy-settings').click();await p.locator('#cookieResetBtn').click();
  assert.equal(await p.evaluate(()=>localStorage.getItem('energelia_cookie_consent')),null);
  assert.equal(await p.evaluate(()=>localStorage.getItem('energelia_privacy_v2')),null);
  await ctx.close();
 }
 const c=await b.newContext({javaScriptEnabled:false,viewport:{width:320,height:900}}),p=await c.newPage();
 await p.goto('http://127.0.0.1:5075/privacy-policy');assert.equal(await p.locator('h1').innerText(),'Privacy Policy');await c.close();
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.tracking,[]);
 report.checks=['No automatic banner or consent choice with technical tools only','No new consent storage','Old acceptance never enables tracking','Reset removes old choices without creating new consent','Dialog focus/Escape','Policies readable without JavaScript'];
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await b.close();console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
