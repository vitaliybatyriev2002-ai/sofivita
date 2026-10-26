(() => {
  const dialog = document.querySelector('#couple-chat');
  const trigger = document.querySelector('[data-chat-open]');
  if (!dialog || !trigger) return;
  const list = dialog.querySelector('[data-chat-messages]');
  const actor = dialog.querySelector('[data-chat-actor]');
  const form = dialog.querySelector('.couple-chat-form');
  const access = dialog.querySelector('[data-chat-access]');
  const password = access.querySelector('input');
  let accessCode = '';
  const input = form.querySelector('textarea');
  const send = form.querySelector('button');
  const status = dialog.querySelector('[data-chat-status]');
  const stamp = new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const names = {vitalya:'Виталя',sonya:'Соня'};
  let api = null, loading = false, sending = false, fingerprint = '', messages = [];
  let draftRequest = null, revision = 0;
  function messageId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  const syncButton = () => { send.disabled = !api || !accessCode || !actor.value || !input.value.trim() || sending; };
  async function request(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(api, {...options,headers:{...options.headers,Authorization:'Bearer '+accessCode},cache:'no-store',signal:controller.signal});
      if(response.status===401){accessCode='';access.hidden=false;syncButton();throw new Error('401');}
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (!Array.isArray(data.messages)) throw new Error('Invalid response');
      return data.messages;
    } finally { clearTimeout(timer); }
  }
  function render(items) {
    const key = JSON.stringify([items,actor.value]);
    if (key === fingerprint) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const first = !fingerprint;
    fingerprint = key; messages = items;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');empty.className='couple-chat-empty';empty.textContent='Здесь начинается наш разговор ♡';list.append(empty);
    }
    items.forEach(message => {
      if (!names[message.actor] || typeof message.text !== 'string' || !Number.isFinite(Date.parse(message.created_at))) return;
      const bubble = document.createElement('article');bubble.className='couple-message'+(message.actor===actor.value?' is-own':'');
      const name=document.createElement('b');name.textContent=names[message.actor];
      const text=document.createElement('p');text.textContent=message.text;
      const time=document.createElement('time');time.dateTime=message.created_at;time.textContent=stamp.format(new Date(message.created_at))+' МСК';
      bubble.append(name,text,time);list.append(bubble);
    });
    if (nearBottom || first) list.scrollTop=list.scrollHeight;
  }
  async function refresh() {
    if (!dialog.open || !api || !accessCode || loading || sending) return;
    loading=true;
    const currentRevision=revision;
    try { const items=await request();if(currentRevision===revision){render(items);status.textContent='';} }
    catch { status.textContent=accessCode?'Не удалось загрузить переписку. Попробуем ещё раз.':'Неверный код доступа.'; }
    finally { loading=false; }
  }
  trigger.addEventListener('click',async()=>{
    dialog.showModal();trigger.setAttribute('aria-expanded','true');
    if (!api) {
      status.textContent='Введите код доступа к переписке.';
      try {
        const response=await fetch(new URL('assets/data/quarrels-config.json',document.baseURI),{cache:'no-store'});
        if(!response.ok)throw new Error();
        const config=await response.json();api=new URL(config.apiUrl);if(api.protocol!=='https:')throw new Error();api.pathname='/messages';api.search='';api.hash='';
      } catch { api=null;status.textContent='Переписка пока недоступна. Попробуйте позже.'; }
    }
    syncButton();await refresh();
  });
  access.addEventListener('submit',async event=>{
    event.preventDefault();accessCode=password.value;
    try{render(await request());access.hidden=true;password.value='';status.textContent='';}
    catch{accessCode='';status.textContent='Не удалось войти. Проверьте код доступа и настройку Worker.';}
    syncButton();
  });
  dialog.querySelector('[data-chat-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right)dialog.close();}});
  dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');trigger.focus();});
  actor.addEventListener('change',()=>{draftRequest=null;syncButton();render(messages);});
  input.addEventListener('input',()=>{draftRequest=null;syncButton();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(send.disabled)return;
    const text=input.value.trim();const author=actor.value;
    if(!draftRequest)draftRequest={id:messageId(),actor:author,text};
    const payload=draftRequest;revision++;sending=true;syncButton();status.textContent='Отправляем…';
    try {
      const items=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      render(items);list.scrollTop=list.scrollHeight;
      if(input.value.trim()===text&&actor.value===author){input.value='';draftRequest=null;}
      status.textContent='';
    } catch {status.textContent='Не удалось подтвердить отправку. Нажмите отправить ещё раз — сообщение не продублируется.';}
    finally {sending=false;syncButton();}
  });
  setInterval(()=>{if(!document.hidden)refresh();},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  syncButton();
})();
