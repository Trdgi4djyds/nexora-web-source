// NEXORA › administration des comptes (réservé aux administrateurs de la plateforme) :
// suspendre / réactiver (blocage de connexion), supprimer, créer, inviter, réinitialiser le mot de passe,
// et lire les informations de connexion (dernière connexion, e-mail confirmé).
import { admin, caller, cors, json } from './_lib.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return json({ error: 'Connexion requise.' }, 401);
    if (!['admin', 'superadmin'].includes(me.role) || me.status !== 'active') return json({ error: 'Réservé aux administrateurs.' }, 403);
    const body = await req.json().catch(() => ({}));
    const { action, user_id: uid, email, password, full_name: fullName, redirect, ids } = body;
    const target = uid ? (await admin.from('profiles').select('id, app_role, email').eq('id', uid).maybeSingle()).data : null;
    if (uid && !target) return json({ error: 'Utilisateur introuvable.' }, 404);
    if (target && target.app_role === 'superadmin' && me.role !== 'superadmin') return json({ error: 'Seul un super-administrateur peut agir sur ce compte.' }, 403);
    if (target && target.id === me.id && ['ban', 'delete'].includes(action)) return json({ error: 'Action impossible sur ton propre compte.' }, 400);

    switch (action) {
      case 'auth-info': {
        // Informations de connexion pour une liste d'utilisateurs (100 max).
        const want = new Set<string>((ids || []).slice(0, 100));
        const out: Record<string, unknown> = {};
        for (let page = 1; page <= 20 && want.size; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          for (const u of data.users) {
            if (want.has(u.id)) {
              out[u.id] = { last_sign_in_at: u.last_sign_in_at, confirmed_at: u.email_confirmed_at, banned_until: (u as { banned_until?: string }).banned_until ?? null, providers: u.app_metadata?.providers ?? [] };
              want.delete(u.id);
            }
          }
          if (data.users.length < 200) break;
        }
        return json({ users: out });
      }
      case 'ban':
      case 'unban': {
        const { error } = await admin.auth.admin.updateUserById(uid, { ban_duration: action === 'ban' ? '876000h' : 'none' });
        if (error) throw error;
        // Statut du profil changé au nom de l'administrateur (journal d'audit et notification).
        const r = await me.client.rpc('admin_set_status', { target: uid, new_status: action === 'ban' ? 'suspended' : 'active' });
        if (r.error) throw r.error;
        return json({ ok: true });
      }
      case 'delete': {
        if (me.role !== 'superadmin') return json({ error: 'Seul un super-administrateur peut supprimer un compte.' }, 403);
        await admin.from('audit_logs').insert({ actor_id: me.id, action: 'delete', entity: 'auth.users', entity_id: uid, meta: { email: target?.email } });
        const { error } = await admin.auth.admin.deleteUser(uid);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'create': {
        if (!email || !password || String(password).length < 8) return json({ error: 'Adresse e-mail et mot de passe (8 caractères minimum) requis.' }, 400);
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName || '' } });
        if (error) throw error;
        await admin.from('audit_logs').insert({ actor_id: me.id, action: 'create', entity: 'auth.users', entity_id: data.user.id, meta: { email } });
        return json({ ok: true, id: data.user.id });
      }
      case 'invite': {
        if (!email) return json({ error: 'Adresse e-mail requise.' }, 400);
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redirect || undefined });
        if (error) throw error;
        await admin.from('audit_logs').insert({ actor_id: me.id, action: 'invite', entity: 'auth.users', entity_id: data.user.id, meta: { email } });
        return json({ ok: true, id: data.user.id });
      }
      case 'reset': {
        const mail = target?.email || email;
        if (!mail) return json({ error: 'Adresse e-mail inconnue.' }, 400);
        const { error } = await admin.auth.resetPasswordForEmail(mail, { redirectTo: redirect || undefined });
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: 'Action inconnue.' }, 400);
    }
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
