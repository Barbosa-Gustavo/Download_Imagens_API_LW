const express  = require('express');
const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');

const app          = express();
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOAD_DIR));

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/login', async (req, res) => {
  const { login, senha } = req.body;
  try {
    const { data } = await axios.post(
      'https://api.lwtecnologia.com.br/api/login',
      { login, senha },
      { timeout: 10_000 }
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = status === 401 ? 'Usuário ou senha inválidos' : 'Erro ao conectar com a API';
    res.status(status).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// JOBS  —  processamento em background + polling
// ═══════════════════════════════════════════════════════════════════════════════
const jobs = new Map();
let   jobSeq = 0;

/**
 * POST /api/jobs
 * Inicia o download em background e retorna { jobId, total } imediatamente.
 */
app.post('/api/jobs', (req, res) => {
  const { token, ids, referencias, delay = 300 } = req.body;

  if (!token)
    return res.status(400).json({ error: 'Token obrigatório' });

  const validIds = (ids || []).map(i => String(i).trim()).filter(Boolean);
  const refs     = (referencias || []).filter(Boolean);

  if (!validIds.length) return res.status(400).json({ error: 'Nenhum ID válido' });
  if (!refs.length)     return res.status(400).json({ error: 'Nenhuma referência selecionada' });

  // monta lista de pares ID × ref
  const pairs = [];
  for (const id of validIds)
    for (const ref of refs)
      pairs.push({ id, ref });

  const jobId = String(++jobSeq);
  const job = {
    id:        jobId,
    status:    'running',    // 'running' | 'done' | 'cancelled'
    total:     pairs.length,
    done:      0,
    ok:        0,
    fail:      0,
    nIds:      validIds.length,
    nRefs:     refs.length,
    current:   null,         // { id, ref, idNum, refNum }
    files:     [],           // arquivos salvos com sucesso
    log:       [],           // log completo para o cliente
    startedAt: Date.now(),
  };

  jobs.set(jobId, job);
  res.json({ jobId, total: pairs.length });

  // processa sem bloquear o servidor
  runJob(job, pairs, token, Number(delay)).catch(err => {
    console.error(`[job ${jobId}] erro fatal:`, err.message);
    job.status = 'done';
  });
});

async function runJob(job, pairs, token, delay) {
  for (let i = 0; i < pairs.length; i++) {
    if (job.status === 'cancelled') break;

    const { id, ref } = pairs[i];

    job.current = {
      id,
      ref,
      idNum:  Math.floor(i / job.nRefs) + 1,
      refNum: (i % job.nRefs) + 1,
    };

    try {
      const response = await axios.get(
        `https://api.lwtecnologia.com.br/api/imagensPdf/${id}?referencias=${ref}`,
        {
          headers:        { Authorization: token },
          responseType:   'arraybuffer',
          timeout:        30_000,
          validateStatus: () => true,   // nunca lança exceção por status HTTP
        }
      );

      const s = response.status;
      if (s === 401 || s === 403) throw new Error('Token inválido ou expirado');
      if (s === 404 || s === 204) throw new Error('ID não possui a referência solicitada');
      if (s >= 500)               throw new Error('ID não possui a referência solicitada');
      if (s !== 200)              throw new Error(`HTTP ${s}`);

      const buf = Buffer.from(response.data);
      if (buf.length === 0)                                          throw new Error('Sem conteúdo');
      if (buf.length < 4 || buf.toString('ascii', 0, 4) !== '%PDF') throw new Error('Resposta não é PDF');

      const refDir = path.join(DOWNLOAD_DIR, ref.toUpperCase());
      if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });

      const filename = `${id}.pdf`;
      fs.writeFileSync(path.join(refDir, filename), buf);

      job.ok++;
      job.files.push({ ref, file: filename });
      job.log.push({ type: 'success', id, ref, msg: `${ref.toUpperCase()}/${filename}` });

    } catch (err) {
      job.fail++;
      let msg = err.message || 'Erro desconhecido';
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') msg = 'Timeout (30s)';
      job.log.push({ type: 'error', id, ref, msg });
    }

    job.done = i + 1;

    if (delay > 0 && job.status !== 'cancelled')
      await new Promise(r => setTimeout(r, delay));
  }

  job.current = null;
  job.status  = job.status === 'cancelled' ? 'cancelled' : 'done';
  console.log(`[job ${job.id}] ${job.status} — ok:${job.ok} fail:${job.fail} total:${job.total}`);
}

/** GET /api/jobs/:id — polling de progresso */
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  res.json(job);
});

/** DELETE /api/jobs/:id — cancela o job */
app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  job.status = 'cancelled';
  res.json({ ok: true });
});

/** GET /api/jobs/:id/zip — baixa ZIP dos arquivos do job */
app.get('/api/jobs/:id/zip', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job)            return res.status(404).json({ error: 'Job não encontrado' });
  if (!job.files.length) return res.status(404).json({ error: 'Nenhum arquivo disponível' });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type',        'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="imagens_lw_${ts}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', console.error);
  archive.pipe(res);

  for (const { ref, file } of job.files) {
    const fp = path.join(DOWNLOAD_DIR, ref.toUpperCase(), file);
    if (fs.existsSync(fp))
      archive.file(fp, { name: `${ref.toUpperCase()}/${file}` });
  }

  archive.finalize();
});

// ═══════════════════════════════════════════════════════════════════════════════
// ARQUIVOS EM DISCO
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/files — lista todos os PDFs salvos */
app.get('/api/files', (req, res) => {
  if (!fs.existsSync(DOWNLOAD_DIR)) return res.json([]);
  const result = [];
  for (const ref of fs.readdirSync(DOWNLOAD_DIR)) {
    const dir = path.join(DOWNLOAD_DIR, ref);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.pdf')))
      result.push({ ref, file, webPath: `downloads/${ref}/${file}` });
  }
  res.json(result);
});

/** GET /api/zip/all — ZIP de tudo que está em downloads/ */
app.get('/api/zip/all', (req, res) => {
  if (!fs.existsSync(DOWNLOAD_DIR))
    return res.status(404).json({ error: 'Pasta downloads não encontrada' });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type',        'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="imagens_lw_completo_${ts}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', console.error);
  archive.pipe(res);
  archive.directory(DOWNLOAD_DIR, false);   // mantém REF/arquivo.pdf como estrutura
  archive.finalize();
});

// ═══════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3002;
app.listen(PORT, () =>
  console.log(`\n  Servidor: http://localhost:${PORT}\n`)
);
