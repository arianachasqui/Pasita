// Función serverless de Vercel: sube/borra fotos en GitHub vía API
const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH = 'main', ADMIN_PASSWORD } = process.env;
const H = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'cumple-admin', 'Content-Type': 'application/json' };
const url = p => `https://api.github.com/repos/${GITHUB_REPO}/contents/${p}`;
const get = async p => { const r = await fetch(`${url(p)}?ref=${GITHUB_BRANCH}`, { headers: H }); return r.ok ? r.json() : null; };
const put = async (p, content, message, sha) => {
  const r = await fetch(url(p), { method: 'PUT', headers: H, body: JSON.stringify({ message, content, branch: GITHUB_BRANCH, sha }) });
  if (!r.ok) throw new Error('GitHub: ' + (await r.text()).slice(0, 200));
};
async function manifest() {
  const f = await get('photos.json');
  return { sha: f?.sha, list: f ? JSON.parse(Buffer.from(f.content, 'base64').toString()) : [] };
}
const saveManifest = (list, sha) => put('photos.json', Buffer.from(JSON.stringify(list, null, 2)).toString('base64'), 'Actualizar fotos', sha);

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!GITHUB_TOKEN || !GITHUB_REPO || !ADMIN_PASSWORD) return res.status(500).json({ error: 'Faltan variables de entorno' });
    const { password, action, name, content } = req.body || {};
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
    const safe = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '');

    if (action === 'list') return res.json(await manifest());

    if (action === 'upload') {
      if (!safe || !content) return res.status(400).json({ error: 'Datos incompletos' });
      await put(`photos/${safe}`, content, `Subir foto ${safe}`);
      const m = await manifest();
      m.list.push(`/photos/${safe}`);
      await saveManifest(m.list, m.sha);
      return res.json({ ok: true });
    }

    if (action === 'delete') {
      const f = await get(`photos/${safe}`);
      if (f) {
        const r = await fetch(url(`photos/${safe}`), { method: 'DELETE', headers: H, body: JSON.stringify({ message: `Borrar ${safe}`, sha: f.sha, branch: GITHUB_BRANCH }) });
        if (!r.ok) throw new Error('GitHub: ' + (await r.text()).slice(0, 200));
      }
      const m = await manifest();
      await saveManifest(m.list.filter(s => !s.endsWith('/' + safe)), m.sha);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Acción inválida' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
