# NEXORA — version web (SaaS)

La plateforme NEXORA dans le navigateur : **Responsive Lab**, **NEX-DESIGN** (design 2D avec objets 3D en calques),
**3D & Motion Studio** (scènes, maquettes photo réalistes, présentations), **audit de sécurité**, **supervision de sites**,
**équipes**, **synchronisation temps réel** avec l’application Windows et **tableau de bord d’administration**.

## Architecture

| Élément | Rôle |
|---|---|
| `renderer/src` | Interface NEXORA (mêmes espaces que l’application Windows) |
| `renderer/src/web` | Pont navigateur (`shim.js`), cadre `<webview>` en iframe, page d’accueil publique, démarrage web |
| `renderer/src/cloud` | NEXORA Cloud : session, compte, équipes, synchronisation, temps réel, administration |
| `supabase/migrations` | Schéma PostgreSQL complet : 28 tables, RLS partout, temps réel, stockage, tâches planifiées |
| `supabase/functions` | Fonctions Edge : `admin-users`, `org-invite`, `security-scan`, `site-info` |
| `web/` | Page HTML et script de construction (site statique dans `web/dist`) |

### Base de données (Supabase)

- **Comptes** : `profiles`, `user_settings`, `devices` — le **premier compte créé devient super-administrateur**.
- **Équipes** : `organizations`, `organization_members` (propriétaire, administrateur, éditeur, lecteur), `invitations`.
- **Offres** : `plans`, `subscriptions`, `usage_daily` (quotas par offre).
- **Contenus** : `projects`, `device_boards`, `design_documents` (+ fichiers dans le stockage), `studio_items`, `assets`, `comments`, `share_links`.
- **Supervision** : `monitors`, `monitor_checks`, `monitor_requests` (vérifications par `pg_cron` + `pg_net`, alertes en temps réel).
- **Sécurité** : `security_scans` (audit défensif via la fonction `security-scan`, adresses privées refusées, quota par jour).
- **Communication** : `notifications`, `announcements`, `announcement_reads`, `support_tickets`, `ticket_messages`.
- **Pilotage** : `feature_flags`, `app_config`, `audit_logs` (journal automatique par déclencheurs).
- **RLS** sur toutes les tables ; fonctions d’aide dans le schéma `private` (non exposé) ; colonnes sensibles (rôle, statut) protégées.
- **Stockage** : `avatars` (public), `design-files`, `assets`, `exports` (privés, dossier par équipe).

## Démarrer

```bash
npm install
npm run build        # site statique dans web/dist
npm run preview      # http://localhost:5173
```

Pour un autre projet Supabase : copier `.env.example` en variables d’environnement (`NEXORA_SUPABASE_URL`, `NEXORA_SUPABASE_ANON`)
avant `npm run build`, puis appliquer `supabase/migrations/*.sql` (SQL Editor ou `supabase db push`) et déployer les fonctions
(`supabase functions deploy --use-api`).

## Mise en ligne

`web/dist` est un site statique : Vercel, Netlify, Cloudflare Pages, GitHub Pages ou ton VPS.
Ensuite, dans Supabase › **Authentication › URL Configuration** : mettre l’adresse du site dans **Site URL** et
`https://ton-domaine/**` dans **Redirect URLs** (liens de confirmation, mot de passe oublié, invitations).

### E-mails

Le service d’e-mail par défaut de Supabase est très limité (quelques e-mails par heure, adresses de l’équipe Supabase seulement).
Pour un vrai SaaS, configure un **SMTP personnalisé** (Resend, Brevo, Mailgun…) dans **Authentication › Emails › SMTP Settings** ;
les modèles d’e-mails en français se règlent ensuite au même endroit.

## Sécurité

- La clé `anon` est publique par conception ; la sécurité repose sur les règles RLS.
- La clé `service_role` n’apparaît **jamais** dans ce dépôt : seules les fonctions Edge l’utilisent (fournie par Supabase).
- Les fonctions Edge vérifient le jeton de l’appelant, ses droits (admin, équipe) et refusent les adresses privées (SSRF).

## Limites de la version web

Le Browser Lab, le Dev Lab (terminal, Git local) et l’App Builder (APK/AAB) ont besoin de l’ordinateur : ils restent dans
l’application Windows, connectée au même compte. Dans le navigateur, le Responsive Lab affiche les sites dans des cadres :
les sites qui l’interdisent (X-Frame-Options / CSP) sont signalés.
