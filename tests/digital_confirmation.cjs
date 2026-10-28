/* Only the fixed local QA server; real local persistence, no email configuration. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const out=process.env.DIGITAL_QA_OUTPUT||'/tmp/energelia-resend-confirmation';
  fs.mkdirSync(out,{recursive:true});
  const results=[];
  try {
    for(const width of [1440,320]) {
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce',locale:'it-IT'});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route(/googletagmanager|google-analytics|doubleclick/,route=>route.abort());
      await page.addInitScript(()=>localStorage.setItem('energelia_cookie_consent','rejected'));
      await page.goto('http://127.0.0.1:5057/servizi-digitali',{waitUntil:'networkidle'});
      await page.locator('[name=service][value=sito]').check();
      await page.locator('[name=message]').fill('Vorremmo un sito per presentare i servizi dello studio.');
      await page.locator('[name=name]').fill('Conferma Browser QA');
      await page.locator('[name=email]').fill(`confirmation-${width}@example.test`);
      await page.locator('[name=contact_ack]').check();
      const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/digital-project'));
      await page.locator('.nx-submit').click();
      const response=await responsePromise;
      const data=await response.json();
      assert.equal(response.status(),201);
      assert.equal(typeof data.reference,'number');
      await page.locator('.nx-form-status.is-success').waitFor();
      const text=await page.locator('.nx-form-status.is-success').innerText();
      assert.equal(text,'Grazie, abbiamo ricevuto la tua richiesta. Energelia ti ricontatterà per un primo confronto sul progetto.');
      assert.equal(text.includes('#'),false);
      assert.equal(await page.locator('.nx-submit').isDisabled(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      assert.deepEqual(errors,[]);
      await page.locator('.nx-form-status.is-success').screenshot({path:`${out}/confirmation-${width}.png`});
      results.push({width,reference:data.reference,publicConfirmation:text,errors});
      await page.close();
    }
    fs.writeFileSync(out+'/report.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
