// NEXORA › informations publiques d'une page (titre, description, icônes, couleur) et possibilité de
// l'afficher dans un cadre (X-Frame-Options / CSP frame-ancestors), pour le Responsive Lab de la version web.
import { caller, cors, json, safeFetch } from './_lib.ts';

const pick = (html: string, re: RegExp) => (re.exec(html)?.[1] || '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return json({ error: 'Connexion requise.' }, 401);
    const { url } = await req.json().catch(() => ({}));
    const r = await safeFetch(url, { method: 'GET' });
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = r.headers.get('content-security-policy') || '';
    const fa = /frame-ancestors([^;]*)/i.exec(csp)?.[1]?.trim() || '';
    const frameable = !(xfo.includes('deny') || xfo.includes('sameorigin')) && !(fa && !/\*/.test(fa));
    const type = r.headers.get('content-type') || '';
    const html = type.includes('html') ? (await r.text()).slice(0, 300000) : '';
    const icons = [...html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)].map((m) => pick(m[0], /href=["']([^"']+)["']/i)).filter(Boolean).map((h) => { try { return new URL(h, r.url || url).href; } catch { return ''; } }).filter(Boolean).slice(0, 6);
    return json({
      ok: r.ok, status: r.status, url: r.url || url, frameable, reason: frameable ? '' : (fa ? `frame-ancestors ${fa}` : `X-Frame-Options: ${xfo}`),
      title: pick(html, /<title[^>]*>([^<]*)<\/title>/i), description: pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i),
      themeColor: pick(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']*)/i), icons,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 400);
  }
});
