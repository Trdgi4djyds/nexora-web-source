/* État partagé de la session (non enregistré). */
export const S = {
  source: null, // { mode: 'url' | 'project', url?, name, dir?, analysis?, script? }
  server: { status: 'idle', url: null, message: '' },
  baseUrl: null,
  serverLog: [],
  recorder: null,
  presenting: false,
  search: '',
  board: null,
  lastFile: null,
  audit: null,
};
