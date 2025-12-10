export function createModal() {
  let el = document.createElement('div');
  el.className = 'app-modal';
  el.innerHTML = `
    <div class="modal-card">
      <h3 id="modalTitle"></h3>
      <div class="modal-body" id="modalBody"></div>
      <div class="modal-actions" id="modalActions"></div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

let _modal = null;
function ensureModal(){ if(!_modal) _modal = createModal(); return _modal; }

export function showModal({title='', body='', buttons=[{label:'關閉', cls:'ghost', onClick:()=>hideModal()}]}){
  const modal = ensureModal();
  modal.style.display = 'flex';
  modal.querySelector('#modalTitle').textContent = title;
  const bodyEl = modal.querySelector('#modalBody');
  if (typeof body === 'string') bodyEl.innerHTML = body; else { bodyEl.innerHTML=''; bodyEl.appendChild(body); }
  const actions = modal.querySelector('#modalActions'); actions.innerHTML='';
  buttons.forEach(b=>{
    const btn = document.createElement('button'); btn.className = 'btn ' + (b.cls||'ghost'); btn.textContent = b.label;
    btn.onclick = ()=>{ try{ b.onClick && b.onClick(); } catch(e){ console.error(e);} }
    actions.appendChild(btn);
  });
}

export function hideModal(){ if(_modal) _modal.style.display='none'; }

export function showToast(msg, timeout=2500){
  const t = document.createElement('div'); t.className='app-toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity 300ms'; t.style.opacity=0; setTimeout(()=>t.remove(),300); }, timeout);
}

export function showCameraMissing(){
  const body = document.createElement('div'); body.className='camera-warning';
  body.innerHTML = `<div class="icon">📷</div><p>攝影機未啟動或未授權。請允許攝影機權限或使用可用的裝置。</p>`;
  showModal({ title: '攝影機未啟動', body, buttons: [{label:'關閉', cls:'ghost', onClick:hideModal}] });
}

export async function hasVideoDevice() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(d => d.kind === 'videoinput');
  } catch (e) {
    console.warn('enumerateDevices failed', e);
    return false;
  }
}
