/* Connexion au service NEXORA Cloud (Supabase). La clé « anon » est publique par conception : la sécurité
 * repose sur les règles d'accès (RLS) de la base. La clé service_role n'est JAMAIS dans l'application. */
/* global __NX_SUPABASE_URL__, __NX_SUPABASE_ANON__ */
export const SUPABASE_URL = (typeof __NX_SUPABASE_URL__ !== 'undefined' && __NX_SUPABASE_URL__) || 'https://dcwfgnwaxsrtuvomttbp.supabase.co';
export const SUPABASE_ANON = (typeof __NX_SUPABASE_ANON__ !== 'undefined' && __NX_SUPABASE_ANON__)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjd2ZnbndheHNydHV2b210dGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MjE1NzcsImV4cCI6MjEwODk5NzU3N30.k-LmO2wJecDAi_LJIT7103vDVOAds4-2JFjcv6SStcY';
export const IS_WEB = typeof window !== 'undefined' && Boolean(window.__NEXORA_WEB__);
export const APP_VERSION = '1.0.0';
