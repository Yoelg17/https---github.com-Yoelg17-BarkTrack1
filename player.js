/* Vinilo · player.js
   Reproductor con <audio> real, lista (tracks.js), aleatorio, repetir,
   favoritos y Media Session (controles en pantalla de bloqueo). */
(() => {
  const TRACKS = window.TRACKS || [];
  const $ = (id) => document.getElementById(id);
  const app = $('app'), audio = $('audio'), toggle = $('toggle'), seek = $('seek');
  const now = $('now'), dur = $('dur'), title = $('title'), artist = $('artist');
  const like = $('like'), shuffleBtn = $('shuffle'), repeatBtn = $('repeat');
  if (!TRACKS.length) return;

  let index = 0, shuffle = false, repeat = 'off';   // repeat: off | all | one
  const history = [];
  const emit = (n) => document.dispatchEvent(new CustomEvent('vinilo:' + n));
  const favs = new Set(read('vinilo:favs', []));
  let plays = read('vinilo:plays', 0);

  function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  const fmt = (s) => (isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00');

  /* ---- Interfaz ---- */
  function paint() {
    const max = +seek.max || 1;
    seek.style.setProperty('--p', (seek.value / max * 100) + '%');
    now.textContent = fmt(+seek.value);
  }

  function load(i, autoplay) {
    index = (i + TRACKS.length) % TRACKS.length;
    const t = TRACKS[index];
    audio.src = t.src;
    title.textContent = t.title;
    artist.textContent = t.artist;
    document.title = `${t.title} · ${t.artist}`;
    app.style.setProperty('--label', t.color);      // el disco cambia de color
    seek.value = 0; seek.max = 0; dur.textContent = '0:00'; paint();
    setLike();
    setMediaSession(t);
    emit('track');
    if (autoplay) play();
  }

  function setLike() {
    const on = favs.has(TRACKS[index].src);
    like.setAttribute('aria-pressed', on);
    like.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Guardar en favoritos');
  }

  /* ---- Reproducción ---- */
  function play() { audio.play().catch((e) => console.warn('No se pudo reproducir:', e)); }
  function pause() { audio.pause(); }

  function next(auto = false) {
    if (repeat === 'off' && auto && !shuffle && index === TRACKS.length - 1) {
      load(0, false);                                   // fin de la lista: se detiene
      return;
    }
    history.push(index);
    if (shuffle && TRACKS.length > 1) {
      let n; do { n = Math.floor(Math.random() * TRACKS.length); } while (n === index);
      load(n, true);
    } else load(index + 1, true);
  }

  function prev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }   // primero reinicia
    load(history.length ? history.pop() : index - 1, true);
  }

  audio.addEventListener('play', () => {
    if (audio.currentTime < 1) { plays++; save('vinilo:plays', plays); }
    sync(true);
  });
  audio.addEventListener('pause', () => sync(false));
  function sync(on) {
    app.classList.toggle('playing', on);
    emit('state');
    toggle.setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }

  audio.addEventListener('loadedmetadata', () => {
    seek.max = audio.duration; dur.textContent = fmt(audio.duration); paint(); position();
  });
  audio.addEventListener('timeupdate', () => {
    if (seeking) return;
    seek.value = audio.currentTime; paint(); position();
  });
  audio.addEventListener('ended', () => {
    if (repeat === 'one') { audio.currentTime = 0; play(); } else next(true);
  });
  audio.addEventListener('error', () => console.warn('Error de audio:', audio.src));

  let seeking = false;
  seek.addEventListener('input', () => { seeking = true; paint(); });
  seek.addEventListener('change', () => { audio.currentTime = +seek.value; seeking = false; });

  toggle.addEventListener('click', () => (audio.paused ? play() : pause()));
  $('next').addEventListener('click', () => next());
  $('prev').addEventListener('click', prev);

  shuffleBtn.addEventListener('click', () => {
    shuffle = !shuffle;
    shuffleBtn.setAttribute('aria-pressed', shuffle);
  });
  repeatBtn.addEventListener('click', () => {
    repeat = { off: 'all', all: 'one', one: 'off' }[repeat];
    repeatBtn.dataset.mode = repeat;
    repeatBtn.setAttribute('aria-pressed', repeat !== 'off');
    repeatBtn.setAttribute('aria-label', { off: 'Repetir: desactivado', all: 'Repetir la lista', one: 'Repetir esta canción' }[repeat]);
  });
  like.addEventListener('click', () => {
    const k = TRACKS[index].src;
    favs.has(k) ? favs.delete(k) : favs.add(k);
    save('vinilo:favs', [...favs]); setLike(); emit('favs');
  });

  /* ---- Media Session: pantalla de bloqueo y teclas multimedia ---- */
  function setMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: t.album || '',
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }
  function position() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!isFinite(audio.duration) || !audio.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate
      });
    } catch {}
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch {} };
    set('play', play);
    set('pause', pause);
    set('previoustrack', prev);
    set('nexttrack', () => next());
    set('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
    set('seekforward', (d) => { audio.currentTime = Math.min(audio.duration, audio.currentTime + (d.seekOffset || 10)); });
    set('seekto', (d) => { audio.currentTime = d.seekTime; });
  }

  /* ---- PWA: service worker (requiere https o localhost) ---- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW no registrado:', err));
    });
  }

  // API para app.js (pantallas, mini reproductor)
  window.Vinilo = {
    play: (i) => { if (i === index) { audio.paused ? play() : pause(); } else { history.push(index); load(i, true); } },
    toggle: () => (audio.paused ? play() : pause()),
    index: () => index,
    playing: () => !audio.paused,
    favs: () => [...favs],
    plays: () => plays
  };

  load(0, false);
})();
