const $ = s => document.querySelector(s);

const app   = $('#app'), veil = $('#veil');
const msgs  = $('#messages');
const input = $('#input'), send = $('#send');
const oracle= $('#oracle'), line = $('#oracleLine'), goBtn = $('#goBtn');
const orb   = $('#orb');

const now = () => new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date());

function addMessage(side, text, typing=false){
  const row = document.createElement('div');
  row.className = `row ${side}`;
  const avClass = side==='me' ? 'me' : side==='dead' ? 'dead' : 'user';
  const avText  = side==='me' ? 'ME' : side==='dead' ? 'M' : 'IO';
  row.innerHTML = `
    <div class="avatar ${avClass}">${avText}</div>
    <div>
      <div class="bubble">${typing?`<span class="typing"><span class="dotSmall"></span><span class="dotSmall"></span><span class="dotSmall"></span></span>`:text}</div>
      <div class="meta">${now()}</div>
    </div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  return row;
}

function obscure(on){
  if(on){ veil.classList.add('show'); app.classList.add('obscured'); }
  else  { veil.classList.remove('show'); app.classList.remove('obscured'); }
}

async function typeLine(text, speed=22){
  line.textContent = '';
  const caret = document.createElement('span');
  caret.className = 'caret';
  line.appendChild(caret);
  for(let i=0;i<text.length;i++){
    await new Promise(r=>setTimeout(r, speed));
    caret.insertAdjacentText('beforebegin', text[i]);
  }
  // caret resta: si chiude con "VAI"
}

function showVirgilio(){ obscure(true); oracle.classList.add('show'); }
function hideVirgilio(){ oracle.classList.remove('show'); obscure(false); }

// Parallax lieve sulla sfera
window.addEventListener('mousemove', (e)=>{
  const {innerWidth:w, innerHeight:h}=window;
  const dx=(e.clientX/w-.5)*6, dy=(e.clientY/h-.5)*-6;
  orb.style.transform=`perspective(900px) rotateY(${dx}deg) rotateX(${dy}deg)`;
}, {passive:true});

async function callBackend(message){
  const res = await fetch("/ask", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ message })
  });
  if(!res.ok) throw new Error("Errore backend");
  return await res.json();
}

// Flusso dinamico: Utente -> API -> Virgilio (popup) -> click VAI -> Morto in chat
async function invoke(prompt){
  addMessage('me', prompt);
  send.disabled = true;

  try{
    const data = await callBackend(prompt);
    const virgilio = (data.virgilio||"").trim();
    const morto    = (data.morto||"").trim();

    showVirgilio();
    await typeLine(virgilio || "Virgilio ascolta…", 20);

    // Attende il click su VAI: il popup rimane finché non si clicca
    await new Promise(resolve => { goBtn.onclick = () => resolve(); });

    hideVirgilio();

    // opzionale: breve attesa e typing del Morto
    const t = addMessage('dead','', true);
    await new Promise(r=>setTimeout(r, 800));
    t.remove();

    addMessage('dead', morto || "Il Morto tace, ma non per sempre.");

  } catch(err){
    const t = addMessage('dead','', true);
    await new Promise(r=>setTimeout(r, 600));
    t.remove();
    addMessage('dead', "Si è interrotto il filo. Ripeti la domanda.");
  } finally {
    send.disabled = false;
    input.focus();
  }
}

// Handlers
send.addEventListener('click', ()=> {
  const txt = input.value.trim();
  if(!txt) return;
  input.value = '';
  invoke(txt);
});

input.addEventListener('keydown', e=>{
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    const txt = input.value.trim();
    if(!txt) return;
    input.value = '';
    invoke(txt);
  }
});

// Messaggio seed iniziale
setTimeout(()=> addMessage('dead','Io sono il Morto: parlo piano perché l’eco non mi serve.'), 400);
