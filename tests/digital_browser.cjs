/* Browser QA for the isolated server only. Never run this against a published site. */
const {chromium} = require('playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:5057';
const out = process.env.DIGITAL_QA_OUTPUT || '/tmp/energelia-digital-qa';
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true});
  const report = {views:[], flow:{}, errors:[], failedLocal:[]};
  function monitor(page) {
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => {if(response.url().startsWith(base+'/static/') && response.status()>=400) report.failedLocal.push([response.status(),response.url()]);});
  }
  async function setup(context) {
    await context.route('**/*', route => {
      const url = route.request().url();
      // Keep webfonts and public libraries for an accurate rendering. No analytics.
      if (/google-analytics|googletagmanager|facebook|youtube|doubleclick/.test(url)) return route.abort();
      return route.continue();
    });
    await context.addInitScript(() => localStorage.setItem('energelia_cookie_consent','rejected'));
  }
  for (const [width,motion] of [[1440,'reduce'],[390,'reduce'],[320,'reduce'],[360,'reduce'],[768,'reduce'],[1024,'reduce'],[1440,'no-preference'],[390,'no-preference']]) {
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:motion});
    await setup(context);
    const page = await context.newPage(); monitor(page);
    await page.goto(base+'/servizi-digitali', {waitUntil:'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#contatto').scrollIntoViewIfNeeded();
    await page.locator('[name=service][value=app-software]').check();
    await page.locator('[name=goals][value=prenotazioni]').check();
    assert.equal(await page.locator('[name=goals]').count(),3);
    const metrics = await page.evaluate(() => ({
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      sectionWidth:document.querySelector('#contatto').getBoundingClientRect().width,
      fontSerif:document.fonts.check('16px "Source Serif 4"'),
      fontInter:document.fonts.check('16px Inter'),
      invalidInputs:[...document.querySelectorAll('#contatto input:not([type=radio]):not([type=checkbox]),#contatto textarea,#contatto select')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>el.name)
    }));
    assert.equal(metrics.overflow,false); assert.deepEqual(metrics.invalidInputs,[]);
    report.views.push({width,motion,...metrics});
    if (motion==='reduce' && [1440,390,320].includes(width)) {
      await page.locator('#contatto').screenshot({path:`${out}/form-${width}.png`});
      await page.locator('.dr-more summary').click();
      // The current form links directly to the policy; older versions used a disclosure.
      if (await page.locator('.dr-privacy summary').count()) await page.locator('.dr-privacy summary').click();
      await page.locator('.ed-form-wrap').screenshot({path:`${out}/form-expanded-${width}.png`});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    }
    if (motion==='no-preference') {
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      // Target the page gutter rather than the last form control under the pointer.
      await page.mouse.move(width-8,400);
      await page.mouse.wheel(0,400);
      await page.waitForFunction(()=>scrollY>0,{},{timeout:3000});
    }
    await context.close();
  }
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await setup(context);
  const page = await context.newPage(); monitor(page);
  await page.goto(base+'/servizi-digitali',{waitUntil:'networkidle'});
  await page.locator('.nx-submit').click();
  assert.equal(await page.locator('[name=service]').first().getAttribute('aria-invalid'),'true');
  report.flow.accessibleValidation = true;
  for (const category of ['sito','app-software','gestionale','automazioni','da-definire']) {
    await page.locator(`[name=service][value="${category}"]`).check();
    assert.equal(await page.locator('[name=goals]').count(),3);
  }
  await page.locator('[name=service][value=app-software]').check();
  await page.locator('[name=goals][value=prenotazioni]').check();
  await page.locator('[name=message]').fill('Vorremmo un portale prenotazioni per il nostro studio.');
  await page.locator('.dr-more summary').click();
  await page.locator('[name=project_context]').fill('Studio QA con tre operatori e due sedi.');
  await page.locator('[name=existing_solution]').fill('Fogli Excel e un sito vetrina.');
  await page.locator('[name=timeline]').selectOption('1-3-mesi');
  await page.locator('[name=name]').fill('Cliente Browser QA');
  await page.locator('[name=email]').fill('browser-qa@example.test');
  await page.locator('[name=phone]').fill('+39 010 7654321');
  await page.locator('[name=contact_ack]').check();
  // Persist the request, then simulate a lost response. The browser must retain
  // values/key and a retry must find the same database record.
  let firstReference;
  await page.route('**/api/digital-project',async route => {
    const response = await route.fetch();
    firstReference = (await response.json()).reference;
    await route.abort('connectionfailed');
  });
  await page.locator('.nx-submit').click();
  await page.locator('.nx-form-status.is-error').waitFor();
  assert.equal(await page.locator('[name=message]').inputValue(),'Vorremmo un portale prenotazioni per il nostro studio.');
  assert.equal(await page.locator('.nx-submit').isEnabled(),true);
  await page.locator('.ed-form-wrap').screenshot({path:`${out}/form-network-error.png`});
  await page.unroute('**/api/digital-project');
  const [retry] = await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/digital-project')),page.locator('.nx-submit').click()]);
  const result = await retry.json();
  assert.equal(result.reference,firstReference); assert.equal(result.duplicate,true);
  await page.locator('.nx-form-status.is-success').waitFor();
  assert.equal(await page.locator('.nx-form-status.is-success').innerText(), 'Grazie, abbiamo ricevuto la tua richiesta. Energelia ti ricontatterà per un primo confronto sul progetto.');
  assert.equal((await page.locator('.nx-form-status.is-success').innerText()).includes('#'), false);
  assert.equal(await page.locator('.nx-submit').isDisabled(),true);
  await page.locator('.ed-form-wrap').screenshot({path:`${out}/form-success.png`});
  report.flow.reference = firstReference; report.flow.lostResponseRetry = true;
  // Real existing login, real database-backed user, no test authentication route.
  await page.goto(base+'/crm/');
  await page.locator('[name=email]').fill('digital-admin@example.test');
  await page.locator('[name=password]').fill('digital-test-password');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(base+'/crm/');
  await page.getByRole('link',{name:'Richieste digitali',exact:true}).click();
  await page.locator('.dr-admin').screenshot({path:`${out}/admin-list-1440.png`});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`${out}/admin-navigation-1440.png`});
  await page.locator('[name=service]').selectOption('app-software');
  await page.getByRole('button',{name:'Applica filtri'}).click();
  assert.equal(await page.locator('.dr-table tbody tr').count(),1);
  await page.getByRole('link',{name:`Apri richiesta ${firstReference} di Cliente Browser QA`}).click();
  assert.ok((await page.locator('.dr-detail-grid').innerText()).includes('Studio QA con tre operatori e due sedi.'));
  assert.ok((await page.locator('.dr-detail-grid').innerText()).includes('Fogli Excel e un sito vetrina.'));
  await page.locator('[name=status]').selectOption('in-confronto');
  await page.locator('[name=internal_notes]').fill('Confronto preliminare fissato. Preparare una prima proposta visiva.');
  await page.getByRole('button',{name:'Salva modifiche'}).click();
  await page.getByRole('status').filter({hasText:'Modifiche salvate'}).waitFor();
  assert.equal(await page.locator('[name=status]').inputValue(),'in-confronto');
  await page.locator('.dr-admin').screenshot({path:`${out}/admin-detail-1440.png`});
  await page.locator('[name=status]').selectOption('chiusa');
  await page.locator('[name=outcome]').selectOption('vinta');
  await page.getByRole('button',{name:'Salva modifiche'}).click();
  await page.getByRole('status').filter({hasText:'Modifiche salvate'}).waitFor();
  assert.equal(await page.locator('[name=outcome]').inputValue(),'vinta');
  report.flow.commercialUpdate = true;
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.locator('.dr-admin').screenshot({path:`${out}/admin-detail-${width}.png`});
    await page.goto(base+'/crm/richieste-digitali');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.locator('.dr-admin').screenshot({path:`${out}/admin-list-${width}.png`});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`${out}/admin-navigation-${width}.png`});
    await page.goto(base+`/crm/richieste-digitali/${firstReference}`);
  }
  await context.close();
  await browser.close();
  assert.deepEqual(report.errors,[]); assert.deepEqual(report.failedLocal,[]);
  fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
