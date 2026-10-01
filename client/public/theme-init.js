// Aplica el tema guardado antes de pintar la página (evita destellos).
(function () {
  try {
    var pref = localStorage.getItem('ca-theme') || 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1b1715' : '#fbf6f0');
  } catch (e) {}
})();
