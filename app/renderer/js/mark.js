/* mark.js — Orion'un statik markası (küçük temsiller için).
   ------------------------------------------------------------------
   Canlı avatar (canvas + bundle) yalnız panelde, kendi katmanında yaşar.
   Başlık, ray, bento, kapalı hap ve asistan baloncuğu gibi küçük yerlerde
   aynı kimliği taşıyan STATİK bir SVG kullanılır: bulut gövde + iki dikey
   göz çubuğu. Palet tasarım dokümanından (gövde #8FA8D8, göz #1C1E26).

   Kullanım: <span data-orion-mark="46" aria-hidden="true"></span>
   Modül yüklenince boyutu ölçekten okur ve SVG'yi yerleştirir. */

function markSvg(size){
  const s = Number(size) || 26;
  return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true" focusable="false">`
    + `<circle cx="24" cy="24" r="23.25" fill="#fff" stroke="rgba(28,30,38,.10)" stroke-width="1.5"/>`
    + `<path d="M13.6 31c-3.5 0-6.3-2.7-6.3-6 0-3.1 2.4-5.7 5.5-6C13.9 15.2 17.6 12.4 22 12.4c4.7 0 8.7 3.1 9.7 7.4 3.1.5 5.3 3 5.3 6.1 0 3.4-2.9 6.1-6.4 6.1H13.6Z" fill="#8FA8D8"/>`
    + `<rect x="18.6" y="19.6" width="2.6" height="7.2" rx="1.3" fill="#1C1E26"/>`
    + `<rect x="26" y="19.6" width="2.6" height="7.2" rx="1.3" fill="#1C1E26"/>`
    + `</svg>`;
}

export function hydrateMarks(root = document){
  root.querySelectorAll("[data-orion-mark]").forEach((host) => {
    if (host.firstElementChild) return;          // zaten dolu
    host.innerHTML = markSvg(host.dataset.orionMark);
  });
}

hydrateMarks();
