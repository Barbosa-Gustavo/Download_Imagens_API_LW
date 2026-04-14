const express = require('express');
const axios   = require('axios');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Login ────────────────────────────────────────────────────────────────────
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
    const s = err.response?.status || 500;
    res.status(s).json({ error: s === 401 ? 'Usuário ou senha inválidos' : 'Erro ao conectar com a API' });
  }
});

// ─── Proxy de PDF único ───────────────────────────────────────────────────────
// O browser chama este endpoint para cada ID × referência.
// O servidor apenas repassa a chamada à API LW e devolve o binário ao browser.
// Nenhum arquivo é salvo no servidor — tudo fica na memória do browser.
app.get('/api/pdf/:id', async (req, res) => {
  const { id }  = req.params;
  const { ref } = req.query;
  // Aceita token via header customizado (sem depender do formato do Authorization)
  const rawToken = req.headers['x-lw-token'] || req.headers.authorization || '';
  // Garante formato "Bearer <token>" independente do que o cliente enviou
  const token = rawToken.replace(/^bearer\s+/i, '');

  if (!token || !ref)
    return res.status(400).json({ error: 'Parâmetros obrigatórios: ref e X-LW-Token' });

  try {
    const r = await axios.get(
      `https://api.lwtecnologia.com.br/api/imagensPdf/${encodeURIComponent(id)}?referencias=${encodeURIComponent(ref)}`,
      {
        headers:        { Authorization: `Bearer ${token}` },
        responseType:   'arraybuffer',
        timeout:        30_000,
        validateStatus: () => true,
      }
    );

    const s = r.status;
    if (s === 401 || s === 403) return res.status(401).json({ error: 'Token inválido ou expirado' });
    if (s === 404 || s === 204 || s >= 500) return res.status(404).json({ error: 'ID não possui a referência solicitada' });
    if (s !== 200) return res.status(s).json({ error: `HTTP ${s}` });

    const buf = Buffer.from(r.data);
    if (buf.length === 0 || buf.toString('ascii', 0, 4) !== '%PDF')
      return res.status(404).json({ error: 'ID não possui a referência solicitada' });

    res.setHeader('Content-Type', 'application/pdf');
    res.send(buf);

  } catch (err) {
    const msg = (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') ? 'Timeout (30s)' : err.message;
    res.status(500).json({ error: msg });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
// module.exports permite que o Vercel use este app como handler serverless
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => console.log(`\n  http://localhost:${PORT}\n`));
}
