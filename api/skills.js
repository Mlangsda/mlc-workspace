// GET /api/skills              — lista alla skills sorterade på category + display_order
// PUT /api/skills               — body: { id, notes?, status? } — uppdatera en skill
// POST /api/skills              — body: { name, category, description, status, notes } — skapa ny
// DELETE /api/skills?id=...     — radera en skill (för manuellt borttagna)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY saknas' });
  }

  try {
    if (req.method === 'GET') {
      const url = `${SUPABASE_URL}/rest/v1/skills?select=*&order=category.asc,display_order.asc`;
      const r = await fetch(url, { headers: headers() });
      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({ error: errText });
      }
      const data = await r.json();
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const { id, notes, status, description, name } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id krävs' });

      const update = {};
      if (typeof notes === 'string') update.notes = notes;
      if (typeof status === 'string') update.status = status;
      if (typeof description === 'string') update.description = description;
      if (typeof name === 'string') update.name = name;
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'inget att uppdatera (notes, status, description eller name krävs)' });
      }

      const url = `${SUPABASE_URL}/rest/v1/skills?id=eq.${id}`;
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers(), Prefer: 'return=representation' },
        body: JSON.stringify(update),
      });
      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({ error: errText });
      }
      const data = await r.json();
      return res.status(200).json(data[0] || null);
    }

    if (req.method === 'POST') {
      const { name, category, description, status, notes } = req.body || {};
      if (!name || !category) {
        return res.status(400).json({ error: 'name och category krävs' });
      }
      const row = {
        name,
        category,
        description: description || '',
        status: status || 'aktiv',
        notes: notes || '',
        display_order: 999,
      };
      const url = `${SUPABASE_URL}/rest/v1/skills`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...headers(), Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({ error: errText });
      }
      const data = await r.json();
      return res.status(201).json(data[0] || null);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id krävs' });
      const url = `${SUPABASE_URL}/rest/v1/skills?id=eq.${id}`;
      const r = await fetch(url, { method: 'DELETE', headers: headers() });
      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({ error: errText });
      }
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
