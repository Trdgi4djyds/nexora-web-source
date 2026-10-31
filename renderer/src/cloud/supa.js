/* Client Supabase unique (session gardée dans le navigateur ou dans l'application). */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON, IS_WEB } from './config.js';

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: IS_WEB, flowType: 'pkce', storageKey: 'nexora-auth',
  },
  realtime: { params: { eventsPerSecond: 10 } },
  global: { headers: { 'x-client-info': IS_WEB ? 'nexora-web' : 'nexora-desktop' } },
});

// Message d'erreur lisible en français.
export function errText(err) {
  const m = String((err && (err.message || err.error_description || err.msg)) || err || '');
  if (/Invalid login credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse e-mail (lien reçu par e-mail).';
  if (/User already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (/Password should be at least/i.test(m)) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives : patiente quelques minutes.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Connexion impossible : vérifie ton accès Internet.';
  if (/JWT expired/i.test(m)) return 'Ta session a expiré : reconnecte-toi.';
  if (/row-level security|permission denied/i.test(m)) return 'Tu n’as pas les droits pour cette action.';
  if (/inscriptions sont fermées/i.test(m)) return 'Les inscriptions sont fermées pour le moment.';
  return m.replace(/^Error:\s*/, '') || 'Une erreur est survenue.';
}

// Appel d'une fonction serveur (Edge Function) avec la session de l'utilisateur.
export async function callFn(name, body) {
  const { data, error } = await supa.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* corps illisible */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
