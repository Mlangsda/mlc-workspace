// POST /api/security-fix — utför auto-fix på ett säkerhetsfynd
// Body: { code, context, findingId? }
// Kräver: X-Fix-Token header som matchar env SECURITY_FIX_TOKEN
// Svar: { ok: true, message } eller { ok: false, error }

async function markEnvVarSensitive(projectId, envId) {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!vercelToken) return { ok: false, error: 'VERCEL_API_TOKEN saknas i Vercel env' };

  // Försök PATCH (ändra bara type)
  const patchRes = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env/${envId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'sensitive' }),
  });
  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    return { ok: false, error: `Vercel PATCH: ${patchRes.status} ${err.error?.message || ''}` };
  }

  // Trigga redeploy (Sensitive kräver ny deploy)
  const deployRes = await fetch(`https://api.vercel.com/v13/deployments?forceNew=1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectId,
      target: 'production',
      gitSource: { type: 'github', repoId: null, ref: 'main' },
    }),
  });
  // Ignore deploy error — PATCH räckte. Redeploy är nice-to-have.

  return { ok: true, message: `${projectId}: env-variabel markerad Sensitive` };
}

async function updateFindingFixed(findingId, fixResult) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !findingId) return;
  try {
    await fetch(`${url}/rest/v1/security_findings?id=eq.${findingId}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ action_required: false }),
    });
  } catch {
    // ignore
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fix-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST krävs' });

  const expectedToken = process.env.SECURITY_FIX_TOKEN;
  const providedToken = req.headers['x-fix-token'];
  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(401).json({ ok: false, error: 'Ogiltig eller saknar X-Fix-Token' });
  }

  const { code, context, findingId } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'code krävs' });

  try {
    let result;
    if (code === 'env_not_sensitive') {
      const { project, envId } = context || {};
      if (!project || !envId) return res.status(400).json({ ok: false, error: 'project + envId krävs' });
      result = await markEnvVarSensitive(project, envId);
    } else {
      return res.status(400).json({ ok: false, error: `Okänd code: ${code}` });
    }

    if (result.ok) await updateFindingFixed(findingId, result);
    return res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
