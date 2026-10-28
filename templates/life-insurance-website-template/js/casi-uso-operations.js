/* Energelia — operational demonstrations 04–06. Client-side illustrative state only. */
(() => {
  'use strict';
  const amount = n => { const [whole,cents]=Number(n).toFixed(2).split('.'); return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+cents; };
  const money = n => '€ '+amount(n);
  const get = (root, selector) => root.querySelector(selector);
  const text = (root, sel, value) => { const el=get(root,sel); if(el) el.textContent=String(value); };
  const show = (root, sel, visible) => { const el=get(root,sel); if(el) el.hidden=!visible; };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const escapeHtml = s => String(s).replace(/[&<>"']/g, a => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));

  function connect(root) {
    const panels=get(root,'.uc-demo-panels');
    const left=get(panels,'.uc-demo-editor');
    const right=get(panels,'.uc-demo-site');
    const media=window.matchMedia('(max-width:810px)');
    const progress=root.closest('.uc-detail-main').querySelector('[data-uc-progress]');
    const switcher=document.createElement('div');
    switcher.className='uc-view-switcher uc-process-switcher';
    switcher.setAttribute('role','group');
    switcher.setAttribute('aria-label','Vista laboratorio');
    let view='left';
    const uid=root.dataset.ucProcess;
    left.id='pc-'+uid+'-left';right.id='pc-'+uid+'-right';
    const buttons={};
    [['left',root.dataset.pcViewLeft,left],['right',root.dataset.pcViewRight,right]].forEach(([key,label,panel])=>{
      const btn=document.createElement('button');btn.type='button';btn.textContent=label;
      btn.setAttribute('aria-controls',panel.id);
      btn.addEventListener('click',()=>setView(key));
      switcher.append(btn);buttons[key]=btn;
    });
    panels.before(switcher);
    const paint=()=>{
      left.hidden=media.matches&&view==='right';right.hidden=media.matches&&view==='left';
      switcher.hidden=!media.matches;
      Object.entries(buttons).forEach(([key,btn])=>btn.setAttribute('aria-pressed',String(view===key)));
    };
    const setView=(next,reframe=false)=>{
      view=next;paint();
      if(reframe&&media.matches){
        window.requestAnimationFrame(()=>{
          const rect=switcher.getBoundingClientRect();
          if(rect.top < -15 || rect.top > innerHeight-85){
            window.scrollTo({top:Math.max(0,scrollY+rect.top-12),behavior:'instant'});
          }
        });
      }
    };
    const setStep=n=>{
      progress.style.setProperty('--uc-progress-fraction',String((n-1)/2));
      progress.querySelectorAll('[data-uc-step]').forEach(el=>{
        const i=Number(el.dataset.ucStep);
        el.classList.toggle('is-current',i===n);el.classList.toggle('is-complete',i<n);
        if(i===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
      });
      root.dataset.pcPhase=String(n);
    };
    const message=t=>text(root,'[data-pc-message]',t);
    if(media.addEventListener)media.addEventListener('change',paint);else media.addListener(paint);
    paint();setStep(1);
    return {setView,setStep,message};
  }

  function initInbox(root) {
    const nav=connect(root);
    const form=get(root,'[data-pc-inbox-form]');
    const assignee=get(root,'[data-pc-inbox-assignee]');
    const assign=get(root,'[data-pc-inbox-assign]');
    const start=get(root,'[data-pc-inbox-start]');
    let submitted=false,assigned=false,started=false;
    form.addEventListener('submit',e=>{
      e.preventDefault();if(submitted||!form.reportValidity())return;
      const f=new FormData(form);submitted=true;
      ['name','email','category','subject','description'].forEach(k=>{
        const data=String(f.get(k)||'').trim();
        const selectors={name:['[data-pc-inbox-person]','[data-pc-inbox-client]'],email:['[data-pc-inbox-email]'],category:['[data-pc-inbox-category]'],subject:['[data-pc-inbox-subject]'],description:['[data-pc-inbox-description]']};
        selectors[k].forEach(sel=>text(root,sel,data));
      });
      const name=String(f.get('name'));
      text(root,'.uc-process-inbox-item.is-new .uc-process-avatar',name.split(/\s+/).map(s=>s.charAt(0)).slice(0,2).join('').toUpperCase());
      form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
      show(root,'[data-pc-inbox-row]',true);show(root,'[data-pc-inbox-empty]',false);show(root,'[data-pc-inbox-case]',true);
      text(root,'[data-pc-inbox-badge]','3 richieste');
      nav.setStep(2);nav.message('Richiesta n. 1042 ricevuta dal sito: scegli il tecnico e assegna la pratica.');nav.setView('right',true);
    });
    assignee.addEventListener('change',()=>{assign.disabled=!assignee.value||assigned;});
    assign.addEventListener('click',()=>{
      if(!submitted||!assignee.value||assigned)return;
      assigned=true;assignee.disabled=true;
      const internalNote=get(root,'[data-pc-inbox-note]').value.trim();
      text(root,'[data-pc-inbox-note-content]',internalNote);
      show(root,'[data-pc-inbox-note-preview]',!!internalNote);
      get(root,'[data-pc-inbox-note]').disabled=true;
      text(root,'[data-pc-inbox-assigned-name]',assignee.value);
      text(root,'[data-pc-inbox-row-status]','Assegnata');text(root,'[data-pc-inbox-state]','Assegnata');
      show(root,'[data-pc-inbox-assignment]',false);show(root,'[data-pc-inbox-assigned]',true);
      nav.message('La richiesta è stata assegnata. Ora puoi avviare la lavorazione.');
    });
    start.addEventListener('click',()=>{
      if(!assigned||started)return;
      started=true;text(root,'[data-pc-inbox-state]','In lavorazione');text(root,'[data-pc-inbox-row-status]','In corso');
      text(root,'[data-pc-inbox-outcome-tech]',assignee.value);
      show(root,'[data-pc-inbox-assigned]',false);show(root,'[data-pc-inbox-outcome]',true);
      nav.setStep(3);nav.message('Richiesta n. 1042 in lavorazione: assegnazione e avvio completati nella simulazione.');nav.setView('right',true);
    });
    get(root,'[data-pc-reset]').addEventListener('click',()=>{
      submitted=assigned=started=false;form.reset();form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);
      assignee.value='';assignee.disabled=false;assign.disabled=true;get(root,'[data-pc-inbox-note]').value='';get(root,'[data-pc-inbox-note]').disabled=false;
      show(root,'[data-pc-inbox-row]',false);show(root,'[data-pc-inbox-empty]',true);show(root,'[data-pc-inbox-case]',false);
      show(root,'[data-pc-inbox-assignment]',true);show(root,'[data-pc-inbox-assigned]',false);show(root,'[data-pc-inbox-outcome]',false);show(root,'[data-pc-inbox-note-preview]',false);text(root,'[data-pc-inbox-note-content]','');
      text(root,'[data-pc-inbox-badge]','2 in archivio');text(root,'[data-pc-inbox-row-status]','Nuova');text(root,'[data-pc-inbox-state]','Nuova');
      nav.setStep(1);nav.message('Demo ripristinata: invia una nuova richiesta dal modulo cliente.');nav.setView('left',true);
    });
  }

  // A4 PDF, laid out entirely in the browser. No third-party library, no network requests.
  // Content streams are ASCII; visible text uses WinAnsi hex codes for proper accents and euros.
  function buildPdf(documentData, photoImage=null) {
    const W=595.28,H=841.89;
    const lines=[];
    const clamp=n=>Math.round(n*100)/100;
    const ink='#143248',muted='#567186',navy='#09273D',red='#E9163D',pale='#F3F7F9';
    const cpMap={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
    const toHex=value=>Array.from(String(value)).map(ch=>{
      const code=ch.codePointAt(0);
      const byte=cpMap[ch]??(code>=32&&code<=255?code:63);
      return byte.toString(16).padStart(2,'0');
    }).join('').toUpperCase();
    const rgb=hex=>[1,3,5].map(i=>clamp(parseInt(hex.slice(i,i+2),16)/255)).join(' ');
    const box=(x,y,w,h,color)=>lines.push(`${rgb(color)} rg ${clamp(x)} ${clamp(y)} ${clamp(w)} ${clamp(h)} re f`);
    const line=(x1,y1,x2,y2,color,width=1)=>lines.push(`${rgb(color)} RG ${width} w ${clamp(x1)} ${clamp(y1)} m ${clamp(x2)} ${clamp(y2)} l S`);
    const ctx=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
    const measure=(str,size,bold=false)=>{
      if(ctx){ctx.font=(bold?'bold ':'')+size+'px Arial';return ctx.measureText(str).width;}
      return Array.from(str).reduce((sum,ch)=>sum+size*(/[WMW@€]/.test(ch)?.84:/[il1\., ]/.test(ch)?.28:.54),0);
    };
    const shorten=(value,width,size,bold=false)=>{
      let s=String(value);
      if(measure(s,size,bold)<=width)return s;
      while(s.length&&measure(s+'…',size,bold)>width)s=s.slice(0,-1);
      return s+'…';
    };
    const textAt=(value,x,y,size=10,color=ink,bold=false,align='left',maxWidth)=>{
      const valueSafe=maxWidth?shorten(value,maxWidth,size,bold):String(value);
      const actualX=align==='right'?x-measure(valueSafe,size,bold):x;
      lines.push(`${rgb(color)} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${clamp(actualX)} ${clamp(y)} Tm <${toHex(valueSafe)}> Tj ET`);
    };
    const wrap=(value,width,size,bold=false,maxLines=4)=>{
      let words=String(value).replace(/\s+/g,' ').trim().split(' '),current='',out=[];
      for(let word of words){
        if(!word)continue;
        const candidate=current?current+' '+word:word;
        if(measure(candidate,size,bold)<=width){current=candidate;continue;}
        if(current){out.push(current);current='';}
        while(measure(word,size,bold)>width && word.length>1){
          let cut=1;while(cut<word.length&&measure(word.slice(0,cut+1),size,bold)<=width)cut++;
          out.push(word.slice(0,cut));word=word.slice(cut);
        }
        current=word;
      }
      if(current)out.push(current);
      if(out.length>maxLines){out=out.slice(0,maxLines);out[maxLines-1]=shorten(out[maxLines-1]+'…',width,size,bold);}
      return out;
    };
    const paragraph=(value,x,y,width,size=9,color=ink,leading=13,maxLines=4,bold=false)=>{
      const rows=wrap(value,width,size,bold,maxLines);
      rows.forEach((r,i)=>textAt(r,x,y-i*leading,size,color,bold));
      return y-rows.length*leading;
    };
    // Header: deliberate editorial hierarchy and a clear DEMO flag.
    box(0,H-148,W,148,navy);
    box(45,H-150,54,3,red);
    textAt('ATELIER LEGNO',46,787,24,'#FFFFFF',true);
    textAt('FALEGNAMERIA SU MISURA',47,763,10,'#BED8E7');
    textAt('DOCUMENTO DIMOSTRATIVO',548,784,9,'#D8E9F1',true,'right');
    textAt('Preventivo n. 1042',548,760,16,'#FFFFFF',true,'right');
    textAt('PREVENTIVO',46,653,23,ink,true);
    textAt('Data: '+new Intl.DateTimeFormat('it-IT').format(new Date()),548,655,10,muted,false,'right');
    line(46,634,549,634,'#D7E3EB');
    // Balanced information columns, never free-flowing labels one below another.
    box(46,486,244,127,pale);box(302,486,247,127,pale);
    box(46,486,3,127,'#9BBBCD');box(302,486,3,127,'#9BBBCD');
    textAt('CLIENTE',60,590,9,muted,true);
    paragraph(documentData.name,60,570,218,12,ink,14,2,true);
    textAt('EMAIL',60,534,9,muted,true);
    paragraph(documentData.email,60,518,216,9,ink,12,2);
    textAt('PROGETTO',317,590,9,muted,true);
    textAt(documentData.product,317,571,12,ink,true,'left',216);
    textAt('Dimensioni: '+documentData.width+' × '+documentData.height+' cm',317,551,10,ink);
    textAt('Quantità: '+documentData.quantity,317,532,10,ink);
    textAt('Foto: '+shorten(documentData.photo,205,9),317,511,9,muted);
    // A real amount table with aligned numeric columns and alternate row fills.
    textAt('DETTAGLIO ECONOMICO',46,457,13,ink,true);
    box(46,410,503,32,navy);
    textAt('DESCRIZIONE',59,421,9,'#FFFFFF',true);
    textAt('Q.TÀ',344,421,9,'#FFFFFF',true,'right');
    textAt('PREZZO UNIT.',447,421,9,'#FFFFFF',true,'right');
    textAt('IMPORTO',538,421,9,'#FFFFFF',true,'right');
    const entries=[
      ['Prodotto: '+documentData.product,documentData.quantity,documentData.unit,documentData.quantity*documentData.unit],
      ['Montaggio e posa',documentData.quantity,documentData.install,documentData.quantity*documentData.install]
    ];
    entries.forEach(([label,q,u,subtotal],index)=>{
      const y=369-index*42;
      box(46,y,503,41,index===0?'#F4F8FA':'#FFFFFF');
      textAt(label,59,y+16,10,ink,index===0,'left',236);
      textAt(String(q),344,y+16,10,ink,false,'right');
      textAt(money(u),447,y+16,10,ink,false,'right');
      textAt(money(subtotal),538,y+16,10,ink,true,'right');
      line(46,y,549,y,'#DFE7EC',.7);
    });
    box(46,244,503,63,navy);box(46,244,4,63,red);
    textAt('TOTALE STIMATO',61,279,11,'#D7E9F4',true);
    textAt('IVA esclusa',61,259,9,'#AFCBD9');
    textAt(money(documentData.quantity*(documentData.unit+documentData.install)),534,268,20,'#FFFFFF',true,'right');
    textAt('NOTE',46,215,12,ink,true);
    paragraph(documentData.notes||'Nessuna nota aggiuntiva.',46,195,photoImage?285:496,9,muted,14,5);
    if(photoImage){
      textAt('FOTOGRAFIA ALLEGATA',358,215,9,muted,true);
      box(358,108,190,101,pale);
      const ratio=Math.min(184/photoImage.width,95/photoImage.height);
      const width=clamp(photoImage.width*ratio),height=clamp(photoImage.height*ratio);
      const x=clamp(358+(190-width)/2),y=clamp(108+(101-height)/2);
      lines.push(`q ${width} 0 0 ${height} ${x} ${y} cm /Im1 Do Q`);
    }
    line(46,89,549,89,'#D8E3E9');
    textAt('DOCUMENTO DIMOSTRATIVO · Nessun valore fiscale o commerciale',46,72,8,muted);
    textAt('Importi indicativi. Nessun invio reale; il PDF viene creato sul dispositivo.',46,57,8,muted);
    // Binary-safe PDF assembly with optional embedded JPEG XObject.
    const encoder=new TextEncoder(),blocks=[];let size=0;
    const put=value=>{const bytes=encoder.encode(value);blocks.push(bytes);size+=bytes.length;};
    const stream=lines.join('\n')+'\n';
    const objects=[null,
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${clamp(W)} ${clamp(H)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${photoImage?'/XObject << /Im1 7 0 R >>':''} >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`
    ];
    if(photoImage)objects.push({header:`<< /Type /XObject /Subtype /Image /Width ${photoImage.width} /Height ${photoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${photoImage.bytes.length} >>\nstream\n`,bytes:photoImage.bytes});
    put('%PDF-1.4\n%ENERGELIA\n');const offsets=[0];
    for(let i=1;i<objects.length;i++){
      offsets[i]=size;put(i+' 0 obj\n');
      if(typeof objects[i]==='string')put(objects[i]);
      else{put(objects[i].header);blocks.push(objects[i].bytes);size+=objects[i].bytes.length;put('\nendstream');}
      put('\nendobj\n');
    }
    const xref=size;put(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
    for(let i=1;i<objects.length;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
    put(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(blocks,{type:'application/pdf'});
  }
  // JPEG, PNG and WebP are normalized to a bounded RGB JPEG in-memory.
  function pdfPhoto(file){
    if(!file)return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{try{
        const scale=Math.min(1,900/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const ctx=canvas.getContext('2d');
        if(!ctx)throw new Error('Canvas non disponibile');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const raw=atob(canvas.toDataURL('image/jpeg',0.83).split(',')[1]);
        const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        resolve({width:canvas.width,height:canvas.height,bytes});
      }catch(error){reject(error)}finally{URL.revokeObjectURL(url)}};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Immagine non leggibile'))};
      image.src=url;
    });
  }
  function initQuote(root){
    const nav=connect(root),form=get(root,'[data-pc-quote-form]');
    const photo=get(root,'[data-pc-quote-photo]');
    const unit=get(root,'[data-pc-quote-unit]'),install=get(root,'[data-pc-quote-install]');
    const notes=get(root,'[data-pc-quote-notes]');
    const make=get(root,'[data-pc-quote-generate]');
    const download=get(root,'[data-pc-quote-download]');
    const err=get(root,'[data-pc-quote-error]'),finErr=get(root,'[data-pc-quote-fin-error]');
    let request=null,pdfUrl=null,photoUrl=null;
    const validMoney=()=>[unit,install].every(el=>el.validity.valid&&el.value.trim()!==''&&Number.isFinite(Number(el.value)));
    const total=()=>request?.quantity*(Number(unit.value)+Number(install.value))||0;
    const clearPdf=()=>{if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}download.removeAttribute('href');};
    const paintTotal=()=>{
      const valid=validMoney();
      make.disabled=!valid||!request;
      text(root,'[data-pc-quote-total]',valid&&request?money(total()):'Importi da correggere');
      finErr.hidden=valid;finErr.textContent=valid?'':'Inserisci importi validi da 0 a 99.999 €, con massimo due decimali.';
    };
    photo.addEventListener('change',()=>{
      if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl=null;}
      const f=photo.files[0];
      err.hidden=true;
      const valid=!f||(f.size<=2097152&&['image/jpeg','image/png','image/webp'].includes(f.type));
      if(!valid){err.textContent='Immagine non valida: usa JPG/PNG/WebP fino a 2 MB.';err.hidden=false;photo.value='';}
      if(valid&&f){photoUrl=URL.createObjectURL(f);get(root,'[data-pc-quote-photo-img]').src=photoUrl;text(root,'[data-pc-quote-photo-label]',f.name);}
      show(root,'[data-pc-quote-photo-preview]',!!photoUrl);
    });
    form.addEventListener('submit',e=>{
      e.preventDefault();if(request||!form.reportValidity())return;
      const f=new FormData(form), img=photo.files[0];
      if(img&&(img.size>2097152||!['image/jpeg','image/png','image/webp'].includes(img.type))){err.textContent='Seleziona una fotografia supportata sotto 2 MB.';err.hidden=false;return;}
      request=Object.fromEntries(['name','email','product','width','height','quantity'].map(k=>[k,k==='quantity'?Number(f.get(k)):String(f.get(k)).trim()]));
      request.photo=img?.name||'Nessuna';
      text(root,'[data-pc-quote-person]',request.name);text(root,'[data-pc-quote-product]',request.product);
      text(root,'[data-pc-quote-dimensions]',`${request.width} × ${request.height} cm`);
      text(root,'[data-pc-quote-quantity]',request.quantity);text(root,'[data-pc-quote-attachment]',request.photo);
      form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
      show(root,'[data-pc-quote-empty]',false);show(root,'[data-pc-quote-case]',true);
      text(root,'[data-pc-quote-badge]','Bozza da completare');text(root,'[data-pc-quote-state]','Bozza');
      paintTotal();nav.setStep(2);nav.message('Richiesta ricevuta: verifica prezzi e posa, poi genera il preventivo in PDF.');nav.setView('right',true);
    });
    const onFinance=()=>{
      if(!request)return;
      clearPdf();show(root,'[data-pc-quote-outcome]',false);show(root,'[data-pc-quote-editor]',true);
      text(root,'[data-pc-quote-badge]','Bozza aggiornata');text(root,'[data-pc-quote-state]','Da rigenerare');
      nav.setStep(2);nav.message('Importi modificati: genera nuovamente il PDF per applicare i valori aggiornati.');paintTotal();
    };
    [unit,install,notes].forEach(el=>el.addEventListener('input',onFinance));
    make.addEventListener('click',async()=>{
      if(!request||!validMoney()||make.disabled)return;
      make.disabled=true;const oldLabel=make.innerHTML;
      make.textContent='Creazione PDF…';clearPdf();
      try{
        const embedded=await pdfPhoto(photo.files[0]);
        pdfUrl=URL.createObjectURL(buildPdf({
          ...request,unit:Number(unit.value),install:Number(install.value),notes:notes.value.trim()
        },embedded));
        download.href=pdfUrl;
      }catch(error){
        finErr.textContent='Impossibile leggere la fotografia allegata. Riprova con JPG, PNG o WebP.';
        finErr.hidden=false;
        return;
      }finally{
        make.innerHTML=oldLabel;make.disabled=!validMoney()||!request;
      }
      text(root,'[data-pc-quote-badge]','Documento pronto');text(root,'[data-pc-quote-state]','PDF creato');
      text(root,'[data-pc-quote-result-total]',money(total()));text(root,'[data-pc-quote-paper-product]',request.product);
      text(root,'[data-pc-quote-paper-measures]',`${request.width} × ${request.height} cm · ${request.quantity} pezzi`);
      text(root,'[data-pc-quote-paper-total]',money(total())+' · IVA esclusa');
      show(root,'[data-pc-quote-editor]',false);show(root,'[data-pc-quote-outcome]',true);
      nav.setStep(3);nav.message('Preventivo n. 1042 generato: usa il pulsante Scarica PDF per ottenere il documento.');nav.setView('right',true);
    });
    get(root,'[data-pc-quote-revise]').addEventListener('click',()=>{
      clearPdf();show(root,'[data-pc-quote-outcome]',false);show(root,'[data-pc-quote-editor]',true);
      text(root,'[data-pc-quote-badge]','Da aggiornare');text(root,'[data-pc-quote-state]','Bozza');
      nav.setStep(2);nav.message('Puoi modificare le voci economiche e generare un nuovo PDF aggiornato.');paintTotal();nav.setView('right',true);
    });
    get(root,'[data-pc-reset]').addEventListener('click',()=>{
      request=null;clearPdf();if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl=null;}
      form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);form.reset();photo.value='';
      show(root,'[data-pc-quote-photo-preview]',false);err.hidden=true;
      unit.value='480';install.value='160';notes.value='Misure definitive e finiture da confermare.';
      show(root,'[data-pc-quote-case]',false);show(root,'[data-pc-quote-empty]',true);
      show(root,'[data-pc-quote-editor]',true);show(root,'[data-pc-quote-outcome]',false);
      text(root,'[data-pc-quote-badge]','In attesa');text(root,'[data-pc-quote-state]','Da preparare');
      nav.setStep(1);nav.message('Demo ripristinata: compila la scheda cliente per preparare una nuova richiesta.');nav.setView('left',true);paintTotal();
    });
    paintTotal();
  }

  function initBooking(root){
    const nav=connect(root),form=get(root,'[data-pc-book-form]');
    const dates=get(root,'[data-pc-book-days]'),times=get(root,'[data-pc-book-times]');
    const submit=get(root,'[data-pc-book-submit]');
    const slots=['09:30','11:30','15:00','16:30'];
    const dayList=[];let next=new Date();next.setHours(12,0,0,0);next.setDate(next.getDate()+1);
    while(dayList.length<5){if(next.getDay()!==0&&next.getDay()!==6)dayList.push(new Date(next));next.setDate(next.getDate()+1);}
    const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const pretty=d=>new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
    const miniDay=d=>new Intl.DateTimeFormat('it-IT',{weekday:'short'}).format(d).replace('.','');
    let day=dayList[0],time='',review=false,booked=false;
    const occupied=new Set(dayList.map(d=>key(d)+'@15:00'));
    const pickKey=(d,t)=>key(d)+'@'+t;
    const bookedEntry=()=>booked?pickKey(day,time):null;
    const disabled=()=>booked||!time||occupied.has(pickKey(day,time));
    const drawDays=()=>{
      dates.innerHTML='';
      dayList.forEach(d=>{
        const btn=document.createElement('button');btn.type='button';btn.className='uc-process-day';
        btn.innerHTML=`<small>${escapeHtml(miniDay(d))}</small><strong>${d.getDate()}</strong>`;
        btn.setAttribute('aria-pressed',String(key(d)===key(day)));
        btn.disabled=booked;
        btn.addEventListener('click',()=>{day=d;time='';review=false;nav.setStep(1);draw();});
        dates.append(btn);
      });
    };
    const drawTimes=()=>{
      times.innerHTML='';
      slots.forEach(t=>{
        const btn=document.createElement('button');btn.type='button';btn.className='uc-process-time';
        const taken=occupied.has(pickKey(day,t));btn.disabled=taken||booked;
        btn.textContent=taken?`${t} · Occupato`:t;
        btn.setAttribute('aria-pressed',String(time===t));
        btn.addEventListener('click',()=>{time=t;review=false;nav.setStep(1);draw();});times.append(btn);
      });
    };
    const paintAgenda=()=>{
      text(root,'[data-pc-book-agenda-date]',pretty(day));
      const agenda=get(root,'[data-pc-book-agenda]');agenda.innerHTML='';
      slots.forEach(t=>{
        const taken=occupied.has(pickKey(day,t));const ours=booked&&bookedEntry()===pickKey(day,t);
        const card=document.createElement('div');card.className='uc-process-agenda-slot'+(ours?' is-ours':'');
        const label=ours?form.elements.name.value:'Impegno già presente';
        card.innerHTML=`<span>${t}</span><div><strong>${taken?escapeHtml(label):'Disponibile'}</strong><small>${ours?'Prenotazione n. 2066':taken?'Prenotazione dimostrativa':'Slot libero'}</small></div><span class="uc-process-tag${taken?' is-alert':''}">${taken?'Occupato':'Libero'}</span>`;
        agenda.append(card);
      });
    };
    const draw=()=>{
      text(root,'[data-pc-book-month]',new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(day));
      drawDays();drawTimes();
      if(!booked){show(root,'[data-pc-book-review]',review);submit.disabled=disabled();submit.textContent=review?'Conferma appuntamento →':'Controlla la prenotazione →';}
      paintAgenda();
    };
    form.addEventListener('submit',e=>{
      e.preventDefault();if(booked||disabled()||!form.reportValidity())return;
      const name=form.elements.name.value.trim();if(name.length<2)return;
      if(!review){
        review=true;text(root,'[data-pc-book-review-date]',`${pretty(day)} · ${time}`);text(root,'[data-pc-book-review-person]',`${name} · ${form.elements.email.value.trim()}`);
        nav.setStep(2);nav.message('Controlla data, orario e recapiti; poi conferma esplicitamente la prenotazione.');draw();return;
      }
      if(occupied.has(pickKey(day,time))){nav.message('Questo orario non è più disponibile: seleziona un altro slot.');return;}
      booked=true;occupied.add(pickKey(day,time));
      form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
      text(root,'[data-pc-book-confirmation]',`${pretty(day)}, ore ${time} · ${name} · Prenotazione n. 2066`);
      text(root,'[data-pc-book-agenda-summary]',`${name} · ${pretty(day)} alle ${time}. Lo slot è ora occupato nella demo.`);
      text(root,'[data-pc-book-badge]','Agenda aggiornata');
      show(root,'[data-pc-book-outcome]',true);show(root,'[data-pc-book-agenda-outcome]',true);show(root,'[data-pc-book-agenda-hint]',false);
      show(root,'[data-pc-book-review]',false);submit.hidden=true;
      nav.setStep(3);nav.message('Prenotazione n. 2066 confermata: lo slot è occupato nell’agenda dimostrativa.');draw();nav.setView('right',true);
    });
    form.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{
      if(review&&!booked){review=false;nav.setStep(1);nav.message('Recapiti modificati: controlla nuovamente la prenotazione prima di confermare.');draw();}
    }));
    get(root,'[data-pc-reset]').addEventListener('click',()=>{
      day=dayList[0];time='';review=booked=false;
      occupied.clear();dayList.forEach(d=>occupied.add(pickKey(d,'15:00')));
      form.querySelectorAll('input,button').forEach(el=>el.disabled=false);form.reset();submit.hidden=false;
      show(root,'[data-pc-book-review]',false);show(root,'[data-pc-book-outcome]',false);
      show(root,'[data-pc-book-agenda-outcome]',false);show(root,'[data-pc-book-agenda-hint]',true);
      text(root,'[data-pc-book-badge]','Disponibilità');
      nav.setStep(1);nav.message('Demo ripristinata: scegli uno slot disponibile e inserisci i recapiti.');draw();nav.setView('left',true);
    });
    draw();
  }
  function initOrder(root){
    const nav=connect(root),form=get(root,'[data-pc-order-form]');
    const qty=[...root.querySelectorAll('[data-pc-order-qty]')];
    const error=get(root,'[data-pc-order-error]');
    const submit=get(root,'[data-pc-order-submit]');
    const start=get(root,'[data-pc-order-start]');
    const ready=get(root,'[data-pc-order-ready]');
    let submitted=false, started=false, completed=false;
    const priceLine=(name,qty,price)=>`${qty} × ${money(price)} · ${money(qty*price)}`;
    const items=()=>qty.map(input=>({
      key:input.dataset.pcOrderQty,
      label:input.closest('.uc-order-product').querySelector('strong').textContent.trim(),
      price:Number(input.dataset.pcPrice||0),
      qty:Math.max(0, Number(input.value||0))
    })).filter(item=>item.qty>0);
    const total=()=>items().reduce((sum,item)=>sum+item.qty*item.price,0);
    const sync=()=>{
      const ok = qty.every(x=>x.validity.valid) && items().length>0;
      text(root,'[data-pc-order-total]', ok ? money(total()) : '€ 0');
      submit.disabled=submitted||!ok;
      error.hidden=ok;
      if (!ok && !submitted) error.textContent='Seleziona almeno un prodotto prima di inviare l’ordine.';
    };
    qty.forEach(input=>input.addEventListener('input', ()=>{
      if(submitted) return;
      if(input.value!=='' && Number.isFinite(Number(input.value)))input.value = String(Math.max(0, Math.min(9, Math.trunc(Number(input.value)))));
      sync();
    }));
    form.elements.name.addEventListener('input',()=>form.elements.name.setCustomValidity(''));
    form.addEventListener('submit',e=>{
      e.preventDefault();
      if(submitted || !form.reportValidity()) return;
      const customer=String(form.elements.name.value||'').trim();
      if(customer.length<2){form.elements.name.setCustomValidity('Inserisci un nome di almeno due caratteri.');form.reportValidity();return;}
      const chosen=items();
      if(!chosen.length){ error.hidden=false; sync(); return; }
      submitted=true;
      const data=new FormData(form);
      const name=String(data.get('name')||'').trim();
      const pickup=String(data.get('pickup')||'').trim();
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
      text(root,'[data-pc-order-person]',name);
      text(root,'[data-pc-order-pickup]',pickup);
      text(root,'[data-pc-order-total-right]',money(total()));
      const list=get(root,'[data-pc-order-lines]');
      list.innerHTML='';
      chosen.forEach(item=>{
        const li=document.createElement('li');
        li.innerHTML=`<strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(priceLine(item.label,item.qty,item.price))}</span>`;
        list.append(li);
      });
      show(root,'[data-pc-order-empty]',false); show(root,'[data-pc-order-case]',true);
      text(root,'[data-pc-order-badge]','Nuovo ordine');
      text(root,'[data-pc-order-state]','Ricevuto');
      nav.setStep(2);
      nav.message(`Ordine n. 3077 ricevuto: prepara ${chosen.length===1?'1 prodotto':chosen.length+' prodotti'} e conferma quando è pronto.`);
      nav.setView('right',true);
      sync();
    });
    start.addEventListener('click',()=>{
      if(!submitted || started) return;
      started=true;
      text(root,'[data-pc-order-badge]','In preparazione');
      text(root,'[data-pc-order-state]','In preparazione');
      show(root,'[data-pc-order-start-wrap]',false); show(root,'[data-pc-order-ready-wrap]',true);
      nav.message('Preparazione avviata: quando l’ordine è completo, puoi segnarlo come pronto per il ritiro.');
    });
    ready.addEventListener('click',()=>{
      if(!started || completed) return;
      completed=true;
      text(root,'[data-pc-order-badge]','Pronto per il ritiro');
      text(root,'[data-pc-order-state]','Pronto');
      text(root,'[data-pc-order-summary]',`${get(root,'[data-pc-order-person]').textContent} ritirerà alle ${get(root,'[data-pc-order-pickup]').textContent}. Totale dimostrativo ${money(total())}.`);
      show(root,'[data-pc-order-ready-wrap]',false); show(root,'[data-pc-order-outcome]',true);
      nav.setStep(3);
      nav.message('Ordine n. 3077 pronto: il cliente può ritirarlo nell’orario scelto.');
      nav.setView('right',true);
    });
    get(root,'[data-pc-reset]').addEventListener('click',()=>{
      submitted=started=completed=false;
      form.reset();
      qty.forEach(input=>{ if(input.dataset.pcOrderQty==='lasagne') input.value='1'; else if(input.dataset.pcOrderQty==='tiramisu') input.value='1'; else input.value='0'; });
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);form.elements.name.setCustomValidity('');
      show(root,'[data-pc-order-empty]',true); show(root,'[data-pc-order-case]',false);
      show(root,'[data-pc-order-start-wrap]',true); show(root,'[data-pc-order-ready-wrap]',false); show(root,'[data-pc-order-outcome]',false);
      text(root,'[data-pc-order-badge]','In attesa');
      text(root,'[data-pc-order-state]','Ricevuto');
      error.hidden=true;
      nav.setStep(1);
      nav.message('Demo ripristinata: scegli i prodotti e invia un nuovo ordine per il ritiro.');
      nav.setView('left',true);
      sync();
    });
    sync();
  }

  function initEnroll(root){
    const nav=connect(root), form=get(root,'[data-pc-enroll-form]');
    const day=new Date();day.setHours(12,0,0,0);day.setDate(day.getDate()+(6-day.getDay()||7));
    const dateText=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(day);
    root.querySelectorAll('[data-pc-enroll-event-date]').forEach(el=>el.textContent='Ceramica base · '+dateText);
    
    const submit=get(root,'[data-pc-enroll-submit]');
    form.elements.name.addEventListener('input',()=>form.elements.name.setCustomValidity(''));
    const checkin=get(root,'[data-pc-enroll-checkin]');
    let enrolled=false, present=false;
    const presentExisting=new Set();
    const updatePresentCount=()=>{const count=1+presentExisting.size+(present?1:0);text(root,'[data-pc-enroll-checkin-count]',count+' '+(count===1?'presenza registrata':'presenze registrate'));};
    root.querySelectorAll('[data-pc-demo-checkin]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.pcDemoCheckin;if(presentExisting.has(id))return;
      presentExisting.add(id);const row=button.closest('[data-pc-demo-person]');
      const state=row.querySelector('[data-pc-demo-person-status]');state.textContent='Presente';state.classList.remove('is-enrolled');state.classList.add('is-present');
      button.textContent='✓ Registrato';button.disabled=true;updatePresentCount();
      nav.message('Presenza registrata anche per un partecipante già iscritto.');
    }));
    form.addEventListener('submit',e=>{
      e.preventDefault();
      if(enrolled || !form.reportValidity()) return;
      if(String(form.elements.name.value||'').trim().length<2){form.elements.name.setCustomValidity('Inserisci un nome di almeno due caratteri.');form.reportValidity();return;}
      enrolled=true;
      const data=new FormData(form);
      const name=String(data.get('name')||'').trim();
      const email=String(data.get('email')||'').trim();
      form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);
      text(root,'[data-pc-enroll-person]',name);
      text(root,'[data-pc-enroll-email]',email);
      text(root,'[data-pc-enroll-badge]','9 / 12 posti');
      text(root,'[data-pc-enroll-course-count]','9 / 12 posti occupati');
      text(root,'[data-pc-enroll-state]','Iscritto');
      show(root,'[data-pc-enroll-row]',true); show(root,'[data-pc-enroll-action]',true);
      nav.setStep(2);
      nav.message('Nuovo iscritto registrato: ora l’organizzatore vede l’elenco aggiornato e può registrare la presenza.');
      nav.setView('right',true);
    });
    checkin.addEventListener('click',()=>{
      if(!enrolled || present) return;
      present=true;
      text(root,'[data-pc-enroll-state]','Presente');
      updatePresentCount();
      text(root,'[data-pc-enroll-summary]',`${get(root,'[data-pc-enroll-person]').textContent} è stato registrato come presente al corso di ceramica.`);
      show(root,'[data-pc-enroll-action]',false); show(root,'[data-pc-enroll-outcome]',true);
      nav.setStep(3);
      nav.message('Presenza registrata: l’iscrizione è stata trasformata in partecipazione confermata nella demo.');
      nav.setView('right',true);
    });
    get(root,'[data-pc-reset]').addEventListener('click',()=>{
      enrolled=present=false;presentExisting.clear();
      root.querySelectorAll('[data-pc-demo-checkin]').forEach(button=>{
        button.disabled=false;button.textContent='Segna presente';
        const label=button.closest('[data-pc-demo-person]').querySelector('[data-pc-demo-person-status]');
        label.textContent='Iscritto';label.classList.remove('is-present');label.classList.add('is-enrolled');
      });
      form.reset();
      form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);form.elements.name.setCustomValidity('');
      form.elements.name.value='Chiara Milani';
      form.elements.email.value='chiara@example.com';
      text(root,'[data-pc-enroll-badge]','8 / 12 posti');
      text(root,'[data-pc-enroll-course-count]','8 / 12 posti occupati');
      text(root,'[data-pc-enroll-state]','Iscritto');
      updatePresentCount();
      show(root,'[data-pc-enroll-row]',false); show(root,'[data-pc-enroll-action]',false); show(root,'[data-pc-enroll-outcome]',false);
      nav.setStep(1);
      nav.message('Demo ripristinata: inserisci una nuova iscrizione al corso e osserva l’aggiornamento dell’elenco.');
      nav.setView('left',true);
    });
  }

  document.querySelectorAll('[data-uc-process="inbox"]').forEach(initInbox);
  document.querySelectorAll('[data-uc-process="quote"]').forEach(initQuote);
  document.querySelectorAll('[data-uc-process="booking"]').forEach(initBooking);
  document.querySelectorAll('[data-uc-process="order"]').forEach(initOrder);
  document.querySelectorAll('[data-uc-process="enroll"]').forEach(initEnroll);
})();
