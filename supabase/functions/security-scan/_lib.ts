// Outils communs aux fonctions NEXORA (copiés dans chaque fonction au déploiement).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Client « administrateur » (clé service_role, fournie par Supabase à la fonction : jamais côté navigateur).
export const admin: SupabaseClient = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export type Caller = { id: string; email: string; role: string; status: string; client: SupabaseClient };

/* Utilisateur à l'origine de l'appel (jeton vérifié), avec un client qui agit en son nom (RLS appliquée). */
export async function caller(req: Request): Promise<Caller | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: p } = await admin.from('profiles').select('app_role, status').eq('id', data.user.id).maybeSingle();
  const client = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  return { id: data.user.id, email: data.user.email ?? '', role: p?.app_role ?? 'user', status: p?.status ?? 'active', client };
}

// Adresses privées et locales refusées (protection SSRF : les serveurs NEXORA ne sondent que l'Internet public).
function privateIp(ip: string) {
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:127.') || v6.startsWith('::ffff:10.') || v6.startsWith('::ffff:192.168.');
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Adresse invalide.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Seules les adresses http et https sont acceptées.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error('Adresse locale : utilise l’application Windows NEXORA pour tester un site sur ton ordinateur.');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('Port non autorisé.');
  const ips: string[] = [];
  if (/^[\d.]+$/.test(host) || host.includes(':')) ips.push(host);
  else {
    for (const t of ['A', 'AAAA'] as const) { try { ips.push(...(await Deno.resolveDns(host, t))); } catch { /* aucun enregistrement */ } }
    if (!ips.length) throw new Error('Nom de domaine introuvable.');
  }
  if (ips.some(privateIp)) throw new Error('Adresse privée refusée.');
  return u;
}

/* fetch qui revérifie chaque redirection (pas de rebond vers une adresse privée). */
export async function safeFetch(input: string, init: RequestInit = {}, hops = 5): Promise<Response> {
  let url = input;
  for (let i = 0; i <= hops; i++) {
    await assertPublicUrl(url);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, { ...init, redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'NEXORA-Cloud/1.0 (+audit défensif)', ...(init.headers || {}) } }).finally(() => clearTimeout(t));
    if (init.redirect === 'manual' || r.status < 300 || r.status >= 400 || !r.headers.get('location')) return r;
    url = new URL(r.headers.get('location')!, url).href;
  }
  throw new Error('Trop de redirections.');
}
