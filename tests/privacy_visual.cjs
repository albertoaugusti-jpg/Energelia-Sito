'use strict';
const {chromium}=require('/home/andrea/dev/Energelia/.ai-sync/qa/node_modules/playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch(),out='/tmp/energelia-privacy-qa';
for(const width of [1440,320]) {
 const ctx=await b.newContext({viewport:{width,height:900}}),p=await ctx.newPage();
 await ctx.addInitScript(()=>localStorage.setItem('energelia_privacy_v2',JSON.stringify({version:'2026-10-27-v1',analytics:false,savedAt:Date.now(),expiresAt:Date.now()+1e8})));
 for(const [path,selector,name] of [
  ['/privacy-policy','#richieste','privacy-table'],
  ['/cookie-policy','.legal-table','cookie-table'],
  ['/contact','.box-form-domanda','contact'],
  ['/contact','.cta-section','news-call'],
  ['/axpo','.axpo-form','axpo'],
  ['/servizi-digitali','.dr-privacy','digital-notice'],
  ['/casi-uso','.uc-site-footer','catalogue-footer']
 ]) {
  await p.goto('http://127.0.0.1:5058'+path,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!window.EnergeliaPrivacy);await p.waitForTimeout(350);
  const el=p.locator(selector).first();await el.scrollIntoViewIfNeeded();
  if(name==='privacy-table'){await p.screenshot({path:out+'/'+name+'-'+width+'.png'});}
  else await el.screenshot({path:out+'/'+name+'-'+width+'.png'});
 }
 await ctx.close();
}await b.close();console.log('14 focused captures completed');})().catch(e=>{console.error(e);process.exit(1)});
