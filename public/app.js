'use strict';

// ─── Estado ────────────────────────────────────────────────────────────────────
let bearerToken    = null;
let currentJobId   = null;    // job em andamento
let pollIntervalId = null;    // setInterval do polling
let timerInterval  = null;
let timerSeconds   = 0;
let lastLogShown   = 0;       // índice do último log já exibido

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

const filesCard       = $('filesCard');
const filesBody       = $('filesBody');
const refreshFilesBtn = $('refreshFilesBtn');
const zipBtn          = $('zipBtn');
const zipAllBtn       = $('zipAllBtn');

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
  // desabilita se não autenticado, sem IDs, sem refs OU com job em andamento
  const ready = bearerToken && parseIds().length > 0 && selectedRefs().length > 0 && !currentJobId;
  downloadBtn.disabled = !ready;
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

// ─── Download (polling) ────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (currentJobId) {
    if (!confirm('Cancelar o download em andamento?')) return;
    cancelCurrentJob();
    return;
  }
  startDownload();
});

async function startDownload() {
  const ids   = parseIds();
  const refs  = selectedRefs();
  const delay = parseInt(delayInput.value, 10);

  // Reset UI
  logBox.innerHTML         = '';
  progressBar.style.width  = '0%';
  progressText.textContent = '—';
  statOk.textContent       = '0 ok';
  statErr.textContent      = '0 erro';
  currentLabel.textContent = 'Iniciando…';
  progressCard.style.display = 'block';
  filesCard.style.display    = 'none';
  zipBtn.style.display       = 'none';
  lastLogShown = 0;

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

  downloadBtn.textContent = 'Cancelar';
  downloadBtn.classList.add('cancelling');
  downloadBtn.disabled = false;

  try {
    const res  = await fetch('/api/jobs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token: bearerToken, ids, referencias: refs, delay }),
    });

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`Servidor não reconheceu a rota (HTTP ${res.status}). Reinicie o servidor com "npm start".`);
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    currentJobId             = data.jobId;
    progressText.textContent = `0 / ${data.total}`;

    // Inicia polling a cada 800ms
    clearInterval(pollIntervalId);
    pollIntervalId = setInterval(pollJob, 800);

  } catch (err) {
    currentLabel.textContent = `Erro ao iniciar: ${err.message}`;
    finishDownload();
  }
}

async function pollJob() {
  if (!currentJobId) return;

  try {
    const job = await fetch(`/api/jobs/${currentJobId}`).then(r => r.json());

    // Barra de progresso
    const pct = job.total > 0 ? Math.round(job.done / job.total * 100) : 0;
    progressBar.style.width  = `${pct}%`;
    progressText.textContent = `${job.done} / ${job.total}`;
    statOk.textContent       = `${job.ok} ok`;
    statErr.textContent      = `${job.fail} erro`;

    // Label com ID e ref atual
    if (job.current) {
      const { id, ref, idNum, refNum } = job.current;
      currentLabel.textContent =
        `ID ${idNum}/${job.nIds} — ${id}  |  Ref ${refNum}/${job.nRefs}: ${ref}  [${job.done + 1}/${job.total}]`;
    }

    // Novos logs desde o último poll
    if (job.log.length > lastLogShown) {
      job.log.slice(lastLogShown).forEach(e => addLog(e.type, e.id, e.ref, e.msg));
      lastLogShown = job.log.length;
    }

    // Job finalizado
    if (job.status !== 'running') {
      progressBar.style.width  = '100%';
      progressText.textContent = `${job.done} / ${job.total}`;
      currentLabel.textContent = job.status === 'cancelled'
        ? `Cancelado — ${job.ok} ok, ${job.fail} erro(s).`
        : `Concluído — ${job.ok} ok, ${job.fail} erro(s).`;

      if (job.ok > 0) {
        zipBtn.dataset.jobId = currentJobId;
        zipBtn.style.display = 'inline-flex';
      }

      finishDownload();
      loadFiles();
    }

  } catch (err) {
    console.warn('Poll error:', err);
  }
}

function finishDownload() {
  clearInterval(pollIntervalId);
  clearInterval(timerInterval);
  pollIntervalId           = null;
  currentJobId             = null;
  downloadBtn.textContent  = 'Iniciar Download';
  downloadBtn.classList.remove('cancelling');
  updateDownloadBtn();
}

async function cancelCurrentJob() {
  const jid = currentJobId;
  if (!jid) return;
  try { await fetch(`/api/jobs/${jid}`, { method: 'DELETE' }); } catch { /* ok */ }
  // O próximo poll vai detectar status=cancelled e chamar finishDownload()
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

// ─── ZIP da sessão ─────────────────────────────────────────────────────────────
zipBtn.addEventListener('click', () => {
  const jobId = zipBtn.dataset.jobId;
  if (jobId) triggerDownload(`/api/jobs/${jobId}/zip`);
});

// ─── ZIP completo (todos os arquivos em disco) ─────────────────────────────────
zipAllBtn.addEventListener('click', () => triggerDownload('/api/zip/all'));

async function triggerDownload(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `imagens_lw_${ts}.zip`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Erro ao baixar: ' + err.message);
  }
}

// ─── Arquivos salvos ───────────────────────────────────────────────────────────
refreshFilesBtn.addEventListener('click', loadFiles);

async function loadFiles() {
  filesCard.style.display = 'block';
  filesBody.innerHTML = '<div class="empty-state">Carregando…</div>';

  try {
    const files = await fetch('/api/files').then(r => r.json());

    if (!files.length) {
      filesBody.innerHTML = '<div class="empty-state">Nenhum arquivo encontrado.</div>';
      return;
    }

    const byRef = {};
    files.forEach(f => {
      (byRef[f.ref] = byRef[f.ref] || []).push(f);
    });

    filesBody.innerHTML = '';
    for (const [ref, items] of Object.entries(byRef).sort()) {
      const hdr = document.createElement('div');
      hdr.className   = 'files-group-header';
      hdr.textContent = `${ref} — ${items.length} arquivo${items.length !== 1 ? 's' : ''}`;
      filesBody.appendChild(hdr);

      items.forEach(({ file, webPath }) => {
        const row = document.createElement('div');
        row.className = 'file-row';
        row.innerHTML =
          `<span class="file-name">${file}</span>` +
          `<a class="file-link" href="/${webPath}" target="_blank" download>Download</a>`;
        filesBody.appendChild(row);
      });
    }
  } catch {
    filesBody.innerHTML = '<div class="empty-state">Erro ao carregar arquivos.</div>';
  }
}

// Init
updateSummary();
updateDownloadBtn();
