/* Mini-rendu Markdown (titres, blocs de code, listes, gras, code en ligne) pour les réponses de l'IA.
 * Volontairement minimal et sûr : tout le texte est échappé avant transformation. */
import { esc } from './dom.js';

export function renderMd(t) {
  const blocks = String(t || '').split(/```/);
  return blocks.map((b, i) => {
    if (i % 2) { const nl = b.indexOf('\n'); return `<pre class="ai-code">${esc(nl > 0 && nl < 24 ? b.slice(nl + 1) : b)}</pre>`; }
    return esc(b)
      .replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/^[-*] (.*)$/gm, '• $1')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }).join('');
}
