const TIMEOUT_MS = 8000;

const MLC_PROJECTS = [
  { name: 'MLC Workspace', url: 'https://mlc-workspace.vercel.app' },
  { name: 'Lead Finder', url: 'https://lead-finder-cyan.vercel.app' },
  { name: 'Ideas Dashboard', url: 'https://ideas-dashboard-bay.vercel.app' },
  { name: 'Inkorgsrapport', url: 'https://inkorgsrapport.vercel.app' },
  { name: 'MLC Website', url: 'https://mlc-website-xi.vercel.app' },
  { name: 'Sälj & Marknadsstrategi', url: 'https://mlc-salj-strategi.vercel.app' },
];

const THIRD_PARTY = [
  { name: 'Vercel', url: 'https://www.vercel-status.com/api/v2/status.json' },
  { name: 'Supabase', url: 'https://status.supabase.com/api/v2/status.json' },
  { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
  { name: 'OpenAI', url: 'https://status.openai.com/api/v2/status.json' },
];

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkProject(p) {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(p.url, { redirect: 'follow' });
    const ms = Date.now() - start;
    if (res.ok) return { ...p, status: ms > 3000 ? 'WARN' : 'OK', detail: `${res.status} (${ms}ms)` };
    return { ...p, status: 'FAIL', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ...p, status: 'FAIL', detail: err.name === 'AbortError' ? 'Timeout' : err.message };
  }
}

async function checkThirdParty(s) {
  try {
    const res = await fetchWithTimeout(s.url);
    if (!res.ok) return { ...s, status: 'WARN', detail: `Status-API svarar ${res.status}` };
    const data = await res.json();
    const indicator = data.status?.indicator || 'unknown';
    const description = data.status?.description || 'Okänt';
    const map = { none: 'OK', minor: 'WARN', major: 'FAIL', critical: 'FAIL' };
    return { ...s, status: map[indicator] || 'WARN', detail: description };
  } catch (err) {
    return { ...s, status: 'WARN', detail: `Status-API nås ej` };
  }
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return { name: 'Supabase REST', status: 'WARN', detail: 'Env-vars saknas' };
  try {
    const res = await fetchWithTimeout(`${url}/auth/v1/health`, { headers: { apikey: key } });
    return { name: 'Supabase REST', status: res.ok ? 'OK' : 'FAIL', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'Supabase REST', status: 'FAIL', detail: err.message };
  }
}

async function checkMsGraph() {
  const clientId = process.env.MS_CLIENT_ID;
  const tenantId = process.env.MS_TENANT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !tenantId || !clientSecret) return { name: 'MS Graph', status: 'WARN', detail: 'Env-vars saknas' };
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const res = await fetchWithTimeout(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    return { name: 'MS Graph', status: data.access_token ? 'OK' : 'FAIL', detail: data.access_token ? 'Token OK' : (data.error_description || 'Ingen token') };
  } catch (err) {
    return { name: 'MS Graph', status: 'FAIL', detail: err.message };
  }
}

async function checkHuggingFace() {
  const key = process.env.HF_API_KEY;
  if (!key) return { name: 'Hugging Face', status: 'WARN', detail: 'Env-var saknas' };
  try {
    const res = await fetchWithTimeout('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { name: 'Hugging Face', status: res.ok ? 'OK' : 'FAIL', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'Hugging Face', status: 'FAIL', detail: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const [projects, thirdParty, supabase, msGraph, hf] = await Promise.all([
    Promise.all(MLC_PROJECTS.map(checkProject)),
    Promise.all(THIRD_PARTY.map(checkThirdParty)),
    checkSupabase(),
    checkMsGraph(),
    checkHuggingFace(),
  ]);

  const integrations = [supabase, msGraph, hf];
  const all = [...projects, ...thirdParty, ...integrations];
  const fails = all.filter(r => r.status === 'FAIL').length;
  const warns = all.filter(r => r.status === 'WARN').length;

  res.status(200).json({
    timestamp: new Date().toISOString(),
    summary: { ok: all.length - fails - warns, warn: warns, fail: fails, total: all.length },
    projects, thirdParty, integrations,
  });
}
