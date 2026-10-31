/* Accès au processus principal (exposé par preload.js). */
export const api = window.vitrine;
export const IS_WIN = api.platform === 'win32';
export const CHROME_FULL = api.chromeVersion || '140.0.0.0';
export const CHROME_MAJOR = String(CHROME_FULL).split('.')[0];
