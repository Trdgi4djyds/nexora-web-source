// NEXORA › audit de sécurité défensif d'un site (lecture seule : en-têtes, TLS, cookies, fichiers sensibles
// exposés). Destiné à vérifier SES PROPRES sites. Connexion requise, quota par équipe et par jour, adresses
// privées refusées, résultat enregistré dans l'historique de l'équipe.
import { admin, caller, cors, json, assertPublicUrl, safeFetch } from './_lib.ts';
import { scan } from './scan.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return json({ error: 'Connexion requise.' }, 401);
    if (me.status !== 'active') return json({ error: 'Compte suspendu.' }, 403);
    const { url, org_id: orgId, project_id: projectId } = await req.json().catch(() => ({}));
    const { data: flag } = await admin.from('feature_flags').select('enabled').eq('key', 'security').maybeSingle();
    if (flag && flag.enabled === false) return json({ error: 'L’audit de sécurité est momentanément désactivé.' }, 403);
    const { data: member } = await admin.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', me.id).maybeSingle();
    if (!member) return json({ error: 'Équipe inconnue.' }, 403);
    // Quota de l'offre.
    const { data: sub } = await admin.from('subscriptions').select('plan_id, plans(limits)').eq('org_id', orgId).maybeSingle();
    const limit = Number((sub as { plans?: { limits?: Record<string, number> } })?.plans?.limits?.scans_per_day ?? 3);
    const today = new Date().toISOString().slice(0, 10);
    const { data: used } = await admin.from('usage_daily').select('value').eq('org_id', orgId).eq('day', today).eq('metric', 'security_scan').maybeSingle();
    if (limit >= 0 && (used?.value ?? 0) >= limit) return json({ error: `Quota atteint : ${limit} audit(s) par jour avec ton offre.` }, 429);
    const u = await assertPublicUrl(url);
    const report = await scan(u.href, { fetchImpl: (x: string, o: RequestInit = {}) => safeFetch(x, o), page: null, onStep: () => {} });
    await admin.from('usage_daily').upsert({ org_id: orgId, day: today, metric: 'security_scan', value: (used?.value ?? 0) + 1 });
    const grade = report.score >= 90 ? 'A' : report.score >= 75 ? 'B' : report.score >= 60 ? 'C' : report.score >= 40 ? 'D' : 'F';
    await me.client.from('security_scans').insert({ org_id: orgId, project_id: projectId || null, url: u.href, score: report.score, grade, findings: report.findings, created_by: me.id });
    return json({ ...report, grade });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 400);
  }
});
