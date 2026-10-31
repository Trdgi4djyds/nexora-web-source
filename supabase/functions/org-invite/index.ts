// NEXORA › invitation dans une équipe : si la personne a déjà un compte, elle reçoit une notification dans
// l'application (temps réel) ; sinon le lien d'invitation (copié par l'inviteur) lui permet de s'inscrire puis
// de rejoindre l'équipe. Seuls les propriétaires et administrateurs de l'équipe peuvent inviter.
import { admin, caller, cors, json } from './_lib.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return json({ error: 'Connexion requise.' }, 401);
    const { token, redirect } = await req.json().catch(() => ({}));
    const { data: inv } = await admin.from('invitations').select('id, org_id, email, role, status, organizations(name)').eq('token', token).maybeSingle();
    if (!inv || inv.status !== 'pending') return json({ error: 'Invitation introuvable.' }, 404);
    const { data: m } = await admin.from('organization_members').select('role').eq('org_id', inv.org_id).eq('user_id', me.id).maybeSingle();
    if (!m || !['owner', 'admin'].includes(m.role)) return json({ error: 'Seuls les responsables de l’équipe peuvent inviter.' }, 403);
    const { data: who } = await admin.from('profiles').select('id').ilike('email', inv.email).maybeSingle();
    if (!who) return json({ sent: false, reason: 'no-account' });
    const org = (inv as { organizations?: { name?: string } }).organizations?.name || 'une équipe';
    const { data: from } = await admin.from('profiles').select('full_name').eq('id', me.id).maybeSingle();
    await admin.from('notifications').insert({
      user_id: who.id, kind: 'invite', title: `Invitation : ${org}`, body: `${from?.full_name || 'Un membre'} t’invite à rejoindre l’équipe ${org}.`, link: redirect || '#/invite/' + token,
    });
    return json({ sent: true });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
