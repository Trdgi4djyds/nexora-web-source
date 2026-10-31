/* Identité du navigateur imitée pour chaque appareil. */
import { CHROME_MAJOR, CHROME_FULL } from '../core/api.js';

export const OS_LABEL = {
  ios: 'iOS, Safari', ipados: 'iPadOS, Safari', android: 'Android, Chrome', 'android-tablet': 'Android, Chrome', 'windows-touch': 'Windows, écran tactile', windows: 'Windows, Chrome', macos: 'macOS, Safari', tv: 'Téléviseur connecté',
};

export function uaFor(dev) {
  const brands = [{ brand: 'Chromium', version: CHROME_MAJOR }, { brand: 'Google Chrome', version: CHROME_MAJOR }, { brand: 'Not.A/Brand', version: '99' }];
  const fullVersionList = brands.map((b) => ({ brand: b.brand, version: b.brand === 'Not.A/Brand' ? '99.0.0.0' : CHROME_FULL }));
  const meta = (platform, platformVersion, mobile) => ({
    brands, fullVersionList, fullVersion: CHROME_FULL, platform, platformVersion, architecture: mobile ? '' : 'x86', model: '', mobile,
  });
  switch (dev.os) {
    case 'ios': return { mobile: true, touch: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1', uaMeta: { navigatorPlatform: 'iPhone' } };
    case 'ipados': return { mobile: true, touch: true, ua: 'Mozilla/5.0 (iPad; CPU OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1', uaMeta: { navigatorPlatform: 'iPad' } };
    case 'android': return { mobile: true, touch: true, ua: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Mobile Safari/537.36`, uaMeta: { navigatorPlatform: 'Linux armv81', meta: meta('Android', '16.0.0', true) } };
    case 'android-tablet': return { mobile: true, touch: true, ua: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`, uaMeta: { navigatorPlatform: 'Linux armv81', meta: meta('Android', '16.0.0', false) } };
    case 'windows-touch': return { mobile: false, touch: true, ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`, uaMeta: { navigatorPlatform: 'Win32', meta: meta('Windows', '15.0.0', false) } };
    case 'macos': return { mobile: false, touch: false, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15', uaMeta: { navigatorPlatform: 'MacIntel' } };
    case 'tv': return { mobile: false, touch: false, ua: `Mozilla/5.0 (SMART-TV; Linux; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 TV Safari/537.36`, uaMeta: { navigatorPlatform: 'Linux armv7l' } };
    default: return { mobile: false, touch: false, ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`, uaMeta: { navigatorPlatform: 'Win32', meta: meta('Windows', '15.0.0', false) } };
  }
}
