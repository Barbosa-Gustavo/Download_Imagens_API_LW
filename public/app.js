'use strict';

// ─── Estado ────────────────────────────────────────────────────────────────────
let bearerToken  = null;
let abortCtrl    = null;   // AbortController do job em andamento
let timerInterval = null;
let timerSeconds  = 0;

// ─── Elementos ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const themeToggle     = $('themeToggle');
const loginInput      = $('loginInput');
const senhaInput      = $('senhaInput');
const loginBtn        = $('loginBtn');
const authHint        = $('authHint');
const authPill        = $('authPill');
const authPillLabel   = $('authPillLabel');
const authToggleBtn   = $('authToggleBtn');
const authBody        = $('authBody');

const idsInput        = $('idsInput');
const idsBadge        = $('idsBadge');
const customRefsInput = $('customRefsInput');
const refCbs          = document.querySelectorAll('.ref-cb');
const selectAllRefs   = $('selectAllRefs');
const delayInput      = $('delayInput');
const delayLabel      = $('delayLabel');
const summaryLine     = $('summaryLine');

const downloadBtn     = $('downloadBtn');
const progressCard    = $('progressCard');
const progressBar     = $('progressBar');
const progressText    = $('progressText');
const timerDisplay    = $('timerDisplay');
const statOk          = $('statOk');
const statErr         = $('statErr');
const currentLabel    = $('currentLabel');
const logBox          = $('logBox');

// ─── Tema ──────────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('lw-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);
})();

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lw-theme', next);
});

// ─── IDs ───────────────────────────────────────────────────────────────────────
function parseIds() {
  return idsInput.value
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

idsInput.addEventListener('input', () => {
  const ids = parseIds();
  idsBadge.textContent = `${ids.length} ID${ids.length !== 1 ? 's' : ''}`;
  updateSummary();
  updateDownloadBtn();
});

// ─── Referências ───────────────────────────────────────────────────────────────
function selectedRefs() {
  const checked = [...refCbs].filter(c => c.checked).map(c => c.value);
  const custom  = (customRefsInput.value || '')
    .split(/[\s,;]+/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set([...checked, ...custom])];
}

customRefsInput.addEventListener('input', () => { updateSummary(); updateDownloadBtn(); });

refCbs.forEach(cb => {
  cb.addEventListener('change', () => { updateSummary(); updateDownloadBtn(); });
  cb.closest('tr')?.addEventListener('click', e => {
    if (e.target === cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  });
});

let allSelected = false;
selectAllRefs.addEventListener('click', () => {
  allSelected = !allSelected;
  refCbs.forEach(cb => { cb.checked = allSelected; });
  selectAllRefs.textContent = allSelected ? 'Nenhuma' : 'Todas';
  updateSummary();
  updateDownloadBtn();
});

// ─── Delay ─────────────────────────────────────────────────────────────────────
delayInput.addEventListener('input', () => {
  delayLabel.textContent = `${delayInput.value} ms`;
  updateSummary();
});

// ─── Resumo ────────────────────────────────────────────────────────────────────
function updateSummary() {
  const ids   = parseIds();
  const refs  = selectedRefs();
  const total = ids.length * refs.length;
  const delay = parseInt(delayInput.value, 10);
  const estSec = Math.ceil(total * delay / 1000);

  if (total === 0) { summaryLine.innerHTML = '—'; return; }

  const estStr = estSec >= 60 ? `~${Math.ceil(estSec / 60)} min` : `~${estSec}s`;
  summaryLine.innerHTML =
    `<strong>${ids.length}</strong> ID${ids.length !== 1 ? 's' : ''} &times; ` +
    `<strong>${refs.length}</strong> ref${refs.length !== 1 ? 's' : ''} = ` +
    `<strong>${total}</strong> requisições` +
    (delay > 0 ? ` &mdash; ${estStr}` : '');
}

function updateDownloadBtn() {
  const running = abortCtrl !== null;
  const ready   = bearerToken && parseIds().length > 0 && selectedRefs().length > 0;
  downloadBtn.disabled = !ready && !running;
  downloadBtn.textContent = running ? 'Cancelar' : 'Iniciar Download';
  if (running) downloadBtn.classList.add('cancelling');
  else         downloadBtn.classList.remove('cancelling');
}

// ─── Login ─────────────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', doLogin);
senhaInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const login = loginInput.value.trim();
  const senha = senhaInput.value;
  if (!login || !senha) { showHint('Preencha login e senha.', 'error'); return; }

  loginBtn.disabled    = true;
  loginBtn.textContent = 'Aguarde...';
  showHint('');

  try {
    const res  = await fetch('/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ login, senha }),
    });
    const data = await res.json();
    if (!res.ok) { showHint(data.error || 'Erro ao autenticar.', 'error'); return; }

    bearerToken = data.token;
    authBody.style.display      = 'none';
    authToggleBtn.style.display = 'inline';
    authPill.classList.add('active');
    authPillLabel.textContent = login.split('@')[0];
    showHint(`Autenticado como ${login}`, 'ok');
    updateDownloadBtn();
    idsInput.focus();

  } catch {
    showHint('Erro de rede.', 'error');
  } finally {
    loginBtn.disabled    = false;
    loginBtn.textContent = 'Autenticar';
  }
}

authToggleBtn.addEventListener('click', () => {
  authBody.style.display      = 'block';
  authToggleBtn.style.display = 'none';
  senhaInput.value = '';
  bearerToken      = null;
  authPill.classList.remove('active');
  authPillLabel.textContent = 'Não autenticado';
  showHint('');
  updateDownloadBtn();
});

function showHint(msg, type = '') {
  authHint.textContent = msg;
  authHint.className   = `hint${type ? ' ' + type : ''}`;
}

// ─── Download (client-side loop + JSZip) ──────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (abortCtrl) {
    abortCtrl.abort();
    return;
  }
  startDownload();
});

async function startDownload() {
  const ids   = parseIds();
  const refs  = selectedRefs();
  const delay = parseInt(delayInput.value, 10);
  const total = ids.length * refs.length;

  // Reset UI
  logBox.innerHTML          = '';
  progressBar.style.width   = '0%';
  progressText.textContent  = `0 / ${total}`;
  statOk.textContent        = '0 ok';
  statErr.textContent       = '0 erro';
  currentLabel.textContent  = 'Iniciando…';
  progressCard.style.display = 'block';

  // Timer
  timerSeconds = 0;
  timerDisplay.textContent = '00:00';
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
  }, 1000);

  abortCtrl = new AbortController();
  updateDownloadBtn();

  const zip      = new JSZip();
  let done = 0, ok = 0, fail = 0;
  let cancelled = false;

  outer:
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    for (let j = 0; j < refs.length; j++) {
      const ref = refs[j];
      done++;

      currentLabel.textContent =
        `ID ${i + 1}/${ids.length} — ${id}  |  Ref ${j + 1}/${refs.length}: ${ref}  [${done}/${total}]`;

      try {
        const res = await fetch(`/api/pdf/${encodeURIComponent(id)}?ref=${encodeURIComponent(ref)}`, {
          headers: { 'X-LW-Token': bearerToken },
          signal:  abortCtrl.signal,
        });

        if (res.ok) {
          const buf = await res.arrayBuffer();
          zip.folder(ref.toUpperCase()).file(`${id}.pdf`, buf);
          ok++;
          addLog('success', id, ref, 'OK');
        } else {
          const errData = await res.json().catch(() => ({}));
          fail++;
          addLog('error', id, ref, errData.error || `HTTP ${res.status}`);
        }

      } catch (err) {
        if (err.name === 'AbortError') {
          cancelled = true;
          break outer;
        }
        fail++;
        addLog('error', id, ref, err.message || 'Erro de rede');
      }

      const pct = Math.round(done / total * 100);
      progressBar.style.width  = `${pct}%`;
      progressText.textContent = `${done} / ${total}`;
      statOk.textContent       = `${ok} ok`;
      statErr.textContent      = `${fail} erro`;

      // Delay entre requisições (não aplicar na última)
      if (!cancelled && (i < ids.length - 1 || j < refs.length - 1)) {
        await sleep(delay);
      }
    }
  }

  // Finaliza
  clearInterval(timerInterval);
  abortCtrl = null;
  progressBar.style.width = '100%';

  if (cancelled) {
    currentLabel.textContent = `Cancelado — ${ok} ok, ${fail} erro(s).`;
    updateDownloadBtn();
    return;
  }

  currentLabel.textContent = `Concluído — ${ok} ok, ${fail} erro(s).`;
  updateDownloadBtn();

  if (ok > 0) {
    currentLabel.textContent += ' Gerando ZIP…';
    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const a    = Object.assign(document.createElement('a'), {
        href:     URL.createObjectURL(blob),
        download: `imagens_lw_${ts}.zip`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      currentLabel.textContent = `Concluído — ${ok} ok, ${fail} erro(s). ZIP baixado.`;
    } catch (err) {
      currentLabel.textContent = `Concluído — ${ok} ok, ${fail} erro(s). Erro ao gerar ZIP: ${err.message}`;
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addLog(cls, id, ref, msg) {
  const icon = cls === 'success' ? '✓' : '✗';
  const el   = document.createElement('div');
  el.className = `log-entry ${cls}`;
  el.innerHTML =
    `<span class="log-icon">${icon}</span>` +
    `<span class="log-id">${id}</span>` +
    `<span class="log-ref">${ref}</span>` +
    `<span class="log-msg" title="${msg}">${msg}</span>`;
  logBox.appendChild(el);
  logBox.scrollTop = logBox.scrollHeight;
}

// Init
updateSummary();
updateDownloadBtn();
