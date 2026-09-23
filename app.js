/* Vinilo · app.js
   Navegación entre pantallas (Inicio, Buscar, Biblioteca, Perfil),
   mini reproductor y reproductor a pantalla completa. */
(() => {
  const T = window.TRACKS || [], V = window.Vinilo;
  if (!T.length || !V) return;

  const $ = (id) => document.getElementById(id);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const app = $('app'), player = $('player');
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const all = T.map((_, i) => i);

  let name = read('vinilo:name', ''), theme = read('vinilo:theme', 'auto');
  let lib = 'all', last = 'home', opened = false;

  /* ---------- Plantillas ---------- */
  const thumb = (t, size) => `<span class="thumb" style="--label:${esc(t.color)}${size ? `;--s:${size}px` : ''}"></span>`;
  const row = (i) => `<li><button class="row" data-i="${i}">${thumb(T[i])}<span class="txt"><b>${esc(T[i].title)}</b><span>${esc(T[i].artist)}</span></span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></button></li>`;
  const fill = (el, idx) => { el.innerHTML = idx.map(row).join(''); };

  /* ---------- Estado del reproductor reflejado en la interfaz ---------- */
  function mark() {
    const cur = V.index();
    $$('.row').forEach((el) => el.setAttribute('aria-current', String(+el.dataset.i === cur)));
  }
  function renderNow() {
    const i = V.index(), t = T[i], on = V.playing();
    $('hero').innerHTML = `${thumb(t, 84)}<span class="txt"><small>${on ? 'Sonando ahora' : 'En pausa'}</small><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></span>`;
    $('mini-thumb').style.setProperty('--label', t.color);
    $('mini-title').textContent = t.title;
    $('mini-artist').textContent = t.artist;
    $('mini-toggle').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
    mark();
  }

  /* ---------- Pantallas ---------- */
  function renderHome() {
    const h = new Date().getHours();
    const g = h < 6 || h >= 20 ? 'Buenas noches' : h < 12 ? 'Buenos días' : 'Buenas tardes';
    $('greet').textContent = name.trim() ? `${g}, ${name.trim()}` : g;
    $('rail').innerHTML = all.map((i) => `<button class="card" data-i="${i}">${thumb(T[i], 132)}<b>${esc(T[i].title)}</b><span>${esc(T[i].artist)}</span></button>`).join('');
    fill($('list-home'), all);
    renderNow();
  }
  function renderSearch() {
    const raw = $('q').value.trim(), q = norm(raw);
    if (!q) { $('list-search').innerHTML = ''; $('hint').textContent = 'Escribe el nombre de una canción o de un artista.'; return; }
    const idx = all.filter((i) => norm(T[i].title + ' ' + T[i].artist).includes(q));
    fill($('list-search'), idx);
    $('hint').textContent = idx.length ? `${idx.length} ${idx.length === 1 ? 'resultado' : 'resultados'}` : `Sin resultados para «${raw}». Prueba con otra palabra.`;
    mark();
  }
  const favList = () => V.favs().filter((s) => T.some((t) => t.src === s));
  function renderLibrary() {
    const favs = favList();
    const idx = all.filter((i) => lib === 'all' || favs.includes(T[i].src));
    fill($('list-library'), idx);
    $('favcount').textContent = favs.length || '';
    $('lib-hint').textContent = idx.length ? '' : 'Aún no tienes favoritos. Toca el corazón en el reproductor para guardar una canción aquí.';
    $$('[data-lib]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lib === lib)));
    mark();
  }
  function renderStats() {
    $('st-fav').textContent = favList().length;
    $('st-tracks').textContent = T.length;
    $('st-plays').textContent = V.plays();
  }
  function renderProfile() {
    $('name').value = name;
    $('avatar').textContent = (name.trim()[0] || '♪').toUpperCase();
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme)));
    renderStats();
  }
  const renderers = { home: renderHome, search: renderSearch, library: renderLibrary, profile: renderProfile };

  /* ---------- Navegación por hash: #/home, #/search, #/library, #/profile, #/player ---------- */
  function showScreen(s) {
    last = s;
    $$('.screen').forEach((el) => { el.hidden = el.dataset.screen !== s; });
    $$('.tabbar a').forEach((a) => (a.dataset.tab === s ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('screens').scrollTop = 0;
    renderers[s]();
  }
  function setPlayer(open) {
    player.classList.toggle('open', open);
    player.inert = !open;
    if (open) $('close-player').focus({ preventScroll: true });
  }
  function route() {
    const r = location.hash.replace(/^#\/?/, '') || 'home';
    if (r === 'player') { setPlayer(true); return; }
    opened = false;
    setPlayer(false);
    showScreen(renderers[r] ? r : 'home');
  }
  const openPlayer = () => { opened = true; location.hash = '#/player'; };
  const closePlayer = () => { if (opened) { opened = false; history.back(); } else location.hash = '#/' + last; };

  window.addEventListener('hashchange', route);
  $('hero').addEventListener('click', openPlayer);
  $('mini-open').addEventListener('click', openPlayer);
  $('mini-toggle').addEventListener('click', () => V.toggle());
  $('close-player').addEventListener('click', closePlayer);
  $('queue').addEventListener('click', () => { location.hash = '#/library'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && player.classList.contains('open')) closePlayer(); });

  /* ---------- Interacción dentro de las pantallas ---------- */
  $('screens').addEventListener('click', (e) => {
    const song = e.target.closest('[data-i]');
    if (song) return V.play(+song.dataset.i);
    const l = e.target.closest('[data-lib]');
    if (l) { lib = l.dataset.lib; return renderLibrary(); }
    const th = e.target.closest('[data-theme-set]');
    if (th) { theme = th.dataset.themeSet; store('vinilo:theme', theme); applyTheme(); renderProfile(); }
  });
  $('q').addEventListener('input', renderSearch);
  $('name').addEventListener('input', (e) => {
    name = e.target.value; store('vinilo:name', name);
    $('avatar').textContent = (name.trim()[0] || '♪').toUpperCase();
  });

  /* ---------- Tema ---------- */
  function applyTheme() {
    const root = document.documentElement;
    theme === 'auto' ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]').content = dark ? '#12142A' : '#F3F4F9';
  }

  /* ---------- Instalación ---------- */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install-box').hidden = false; });
  window.addEventListener('appinstalled', () => { $('install-box').hidden = true; });
  $('install').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt(); await deferred.userChoice; deferred = null; $('install-box').hidden = true;
  });

  /* ---------- Eventos del reproductor ---------- */
  document.addEventListener('vinilo:track', () => { renderNow(); });
  document.addEventListener('vinilo:state', renderNow);
  document.addEventListener('vinilo:favs', () => { if (last === 'library') renderLibrary(); renderStats(); });

  applyTheme();
  showScreen('home');
  route();
})();
