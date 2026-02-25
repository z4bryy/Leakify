/* ═══════════════════════════════════════════════
   LEAKIFY — JuiceWrld Premium Music Player
   Full Client-Side Logic
═══════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────
let allSongs      = [];
let filteredSongs = [];
let currentIndex  = -1;
let isPlaying     = false;
let shuffle       = false;
let repeat        = false;
let fpoOpen       = false;
let isSeeking        = false;
let playHistory      = []; // stack of previously-played indices for proper prev navigation
let activeTab        = 'home'; // tracks current tab for slide direction

// ══════════════════════════════════════════
//  SKELETON LOADING (replaces spinner)
// ══════════════════════════════════════════
function showSkeletons(container, count = 8) {
  const wrap = document.createElement('div');
  wrap.className = 'skeleton-list';
  for (let i = 0; i < count; i++) {
    wrap.innerHTML += `
      <div class="skeleton-card" style="animation-delay:${i*0.06}s">
        <div class="sk-num"></div>
        <div class="sk-art"></div>
        <div class="sk-info">
          <div class="sk-name" style="width:${45+Math.random()*30}%"></div>
          <div class="sk-sub"  style="width:${25+Math.random()*20}%"></div>
        </div>
        <div class="sk-btn"></div>
      </div>`;
  }
  container.innerHTML = '';
  container.appendChild(wrap);
}

// ══════════════════════════════════════════
//  ANIMATED COUNTER (count-up)
// ══════════════════════════════════════════
function countUp(el, target, duration = 700) {
  if (!el) return;
  const start = parseInt(el.textContent, 10) || 0;
  if (start === target) return;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (target - start) * eased);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
    else {
      el.textContent = target;
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 500);
    }
  };
  requestAnimationFrame(step);
}

// ══════════════════════════════════════════
//  ARTIST PHOTO LOADER
// ══════════════════════════════════════════
const ARTIST_PHOTOS = {
  'JuiceWrld':      '/static/img/artist-juicewrld.jpg',
  'Destroy Lonely': '/static/img/artist-destroy-lonely.jpg',
  'Ken Carson':     '/static/img/artist-ken-carson.jpg',
  'EsdeeKid':       '/static/img/artist-esdee-kid.jpg',
  'D4vd':           '/static/img/artist-d4vd.jpg',
};

function loadArtistPhotos() {
  document.querySelectorAll('.artist-card[data-artist]').forEach(card => {
    const artist = card.dataset.artist;
    const src    = ARTIST_PHOTOS[artist];
    if (!src) return;
    const avatar = card.querySelector('.artist-card-avatar');
    if (!avatar) return;
    // Skip if already loaded
    if (avatar.querySelector('.artist-photo')) return;
    const img = document.createElement('img');
    img.className = 'artist-photo';
    img.alt = artist;
    img.onload = () => {
      img.classList.add('loaded');
      avatar.classList.add('has-photo');
    };
    img.onerror = () => img.remove(); // keep initials on error
    img.src = src;
    avatar.insertBefore(img, avatar.firstChild);
  });
}

// ── Likes (localStorage) ──────────────────
let likes = new Set(JSON.parse(localStorage.getItem('leakify_likes') || '[]'));
function saveLikes() { localStorage.setItem('leakify_likes', JSON.stringify([...likes])); }

// ── Recently Played (localStorage, max 30) ────
let recentlyPlayed = JSON.parse(localStorage.getItem('leakify_recent') || '[]');
function saveRecent() { localStorage.setItem('leakify_recent', JSON.stringify(recentlyPlayed.slice(0,30))); }
function addToRecent(song) {
  recentlyPlayed = recentlyPlayed.filter(r => r.filename !== song.filename);
  recentlyPlayed.unshift({ display: song.display, artist: song.artist, filename: song.filename, tag: song.tag || '', url: song.url || '' });
  if (recentlyPlayed.length > 30) recentlyPlayed.pop();
  saveRecent();
}

// ── Sleep Timer ───────────────────────────────
let sleepTimerEndMs = 0;    // epoch ms when audio stops (0 = off)
let sleepTimerIvl   = null; // setInterval id for countdown update

// ── Audio Visualizer ──────────────────────────
let audioCtx     = null;
let analyserNode = null;
let vizAF        = null;
let vizData      = null;
const VIZ_BARS   = 52;

// ── Update toast ─────────────────────────────
function showUpdateToast(msg, isError) {
  const el = document.getElementById('update-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden', 'toast-error');
  if (isError) el.classList.add('toast-error');
  clearTimeout(el._timer);
  if (isError) el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Sync FPO volume range input gradient to current audio.volume ──
function syncVolume(vol) {
  const pct = Math.round(vol * 100);
  const slider = document.getElementById('fpo-volume');
  if (!slider) return;
  slider.value = pct;
  slider.style.background = `linear-gradient(to right, var(--purple) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
}

// ── Media Session API — iOS Lock Screen / Control Center / AirPods ──
// Without this, iOS PWA suspends audio when the screen locks or app backgrounds.
function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  song.display,
    artist: song.artist,
    album:  'Leakify · Private Vault',
    artwork: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
  // Register hardware control handlers (headphones, lock screen, CarPlay, etc.)
  navigator.mediaSession.setActionHandler('play', () => {
    audio.play().then(() => {
      isPlaying = true;
      updatePlayButtons(true);
      heroArt.classList.add('playing');
      heroEq.classList.add('active');
      fpoArt.classList.add('playing');
      nowPlayingBar.classList.add('playing');
      setVinylSpin(true);
      navigator.mediaSession.playbackState = 'playing';
    }).catch(() => {});
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    audio.pause();
    isPlaying = false;
    heroArt.classList.remove('playing');
    heroEq.classList.remove('active');
    fpoArt.classList.remove('playing');
    nowPlayingBar.classList.remove('playing');
    updatePlayButtons(false);
    setVinylSpin(false);
    navigator.mediaSession.playbackState = 'paused';
  });
  navigator.mediaSession.setActionHandler('previoustrack', prevSong);
  navigator.mediaSession.setActionHandler('nexttrack',     nextSong);
  navigator.mediaSession.playbackState = 'playing';
}

// ── DOM helpers ───────────────────────────────
const $  = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Element refs ──────────────────────────────
const audio          = $('audio-player');
const screenLoader   = $('screen-loader');
const screenLogin    = $('screen-login');
const screenPlayer   = $('screen-player');

// Login
const loginForm      = $('login-form');
const loginUser      = $('login-user');
const loginPass      = $('login-pass');
const loginError     = $('login-error');
const loginBtn       = loginForm.querySelector('.login-btn');

// Player
const searchToggle   = $('search-toggle-btn');
const searchBarWrap  = $('search-bar-wrap');
const searchInput    = $('search-input');
const searchClear    = $('search-clear');
const refreshBtn     = $('refresh-btn');
const updateBtn      = $('update-btn');
const updateToast    = $('update-toast');
const pillsInner     = $('pills-inner');
const songList       = $('song-list');
const trackCount     = $('track-count');

// Hero
const heroArt        = $('hero-art');
const heroGlow       = $('hero-glow');
const heroTrackName  = $('hero-track-name');
const heroArtistName = $('hero-artist-name');
const heroEq         = $('hero-eq');

// Mini player bar
const nowPlayingBar  = $('now-playing-bar');
const npbArt         = $('npb-art');
const npbTitle       = $('npb-title');
const npbArtist      = $('npb-artist');
const npbPlayBtn     = $('play-btn');
const prevBtn        = $('prev-btn');
const nextBtn        = $('next-btn');

// Full player overlay
const fpo            = $('full-player-overlay');
const fpoBg          = $('fpo-bg');
const fpoClose       = $('fpo-close');
const fpoArt         = $('fpo-art');
const fpoArtGlow     = $('fpo-art-glow');
const fpoTitle       = $('fpo-title');
const fpoArtist      = $('fpo-artist');
const fpoProgressBar = $('fpo-progress-bar');
const fpoFill        = $('fpo-progress-fill');
const fpoThumb       = $('fpo-progress-thumb');
const fpoElapsed     = $('fpo-elapsed');
const fpoDuration    = $('fpo-duration');
const npbInlineFill      = $('npb-inline-fill');
const fpoPlayBtn     = $('fpo-play-btn');
const fpoPrevBtn     = $('fpo-prev-btn');
const fpoNextBtn     = $('fpo-next-btn');
const fpoShuffleBtn  = $('fpo-shuffle-btn');
const fpoRepeatBtn   = $('fpo-repeat-btn');
const fpoVolume      = $('fpo-volume'); // range input – replaces custom drag bar

// ══════════════════════════════════════════
//  PARTICLES  (upgraded: connections + 999 symbols + more density)
// ══════════════════════════════════════════
(function particles() {
  const canvas = $('particles-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H;
  const pts = [];

  const COLORS = [
    'rgba(191,90,242,',   // purple
    'rgba(255,55,95,',    // pink
    'rgba(10,132,255,',   // blue
    'rgba(255,159,10,',   // orange
    'rgba(48,209,88,',    // green
  ];
  const MAX_DIST = 110;
  // Skip expensive O(n²) connection lines on mobile — not visible on small screens
  const showLines = window.innerWidth >= 768;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const count = window.innerWidth < 480 ? 75 : 130;
  for (let i = 0; i < count; i++) {
    pts.push({
      x:    Math.random() * window.innerWidth,
      y:    Math.random() * window.innerHeight,
      r:    Math.random() * 1.8 + 0.3,
      vx:   (Math.random() - 0.5) * 0.28,
      vy:   (Math.random() - 0.5) * 0.28,
      a:    Math.random(),
      da:   (Math.random() * 0.006 + 0.002) * (Math.random() < 0.5 ? 1 : -1),
      color:COLORS[Math.floor(Math.random() * COLORS.length)],
      is999:Math.random() < 0.045,         // ~4.5 % float as "999" text
      size999: Math.random() * 5 + 9,      // font size 9–14 px
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ── Connection lines (desktop only — O(n²) too costly on mobile) ──
    if (showLines) {
      for (let i = 0; i < pts.length - 1; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            const alpha = (1 - d / MAX_DIST) * 0.10;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(191,90,242,${alpha.toFixed(3)})`;
            ctx.lineWidth   = 0.6;
            ctx.stroke();
          }
        }
      }
    }

    // ── Dots & 999 symbols ──
    pts.forEach(p => {
      p.x  += p.vx;  p.y  += p.vy;
      p.a  += p.da;
      if (p.x < 0) p.x = W;  if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;  if (p.y > H) p.y = 0;
      if (p.a < 0 || p.a > 1) p.da *= -1;

      if (p.is999) {
        ctx.save();
        ctx.globalAlpha   = Math.max(0, p.a * 0.22);
        ctx.fillStyle     = `${p.color}1)`;
        ctx.font          = `700 ${p.size999}px Inter,sans-serif`;
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        ctx.fillText('999', p.x, p.y);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.a.toFixed(2)})`;
        ctx.fill();
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ══════════════════════════════════════════
//  PWA SERVICE WORKER
// ══════════════════════════════════════════
let swRegistration = null;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => { swRegistration = reg; console.log('[SW] registered'); })
      .catch(e => console.warn('[SW] failed:', e));
  });
}

// ══════════════════════════════════════════
//  BOOT — 999 Loader → Login
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  setupAllEvents();
  audio.volume = 0.8;
  syncVolume(0.8);
  // Boot: animate CSS 999 loader → show login
  startLoaderScreen();
});

function showScreen(el) {
  [screenLogin, screenPlayer].forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
    s.style.opacity = '0';
  });
  el.style.display = 'flex';
  requestAnimationFrame(() => {
    el.classList.add('active');
    el.style.opacity = '1';
  });
}

// ══════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════
function setupLoginEvents() {
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const u = loginUser.value.trim();
    const p = loginPass.value;
    loginBtn.classList.add('loading');
    loginError.classList.add('hidden');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: u, pass: p }),
      });
      const data = await res.json();
      if (data.ok) {
        // Clear credential fields from DOM before entering the app
        loginUser.value = '';
        loginPass.value = '';
        setTimeout(() => showPlayer(), 300);
      } else {
        loginError.classList.remove('hidden');
        loginError.textContent = 'Wrong credentials. Try again.';
        loginPass.value = '';
        loginPass.focus();
        loginBtn.classList.remove('loading');
      }
    } catch {
      loginError.classList.remove('hidden');
      loginError.textContent = 'Network error. Please retry.';
      loginBtn.classList.remove('loading');
    }
  });
}

// ══════════════════════════════════════════
//  CSS LOADER SCREEN (replaces video splash)
// ══════════════════════════════════════════
function startLoaderScreen() {
  screenLoader.classList.add('active');
  screenLoader.style.display = 'flex';
  const bar = $('loader-bar');
  if (bar) {
    bar.style.width = '0%';
    bar.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.transition = 'width 2.2s cubic-bezier(0.4, 0, 0.2, 1)';
        bar.style.width = '100%';
      });
    });
  }
  setTimeout(() => {
    screenLoader.classList.add('fade-out');
    setTimeout(() => {
      screenLoader.classList.remove('active', 'fade-out');
      screenLoader.style.display = 'none';
      showScreen(screenLogin);
    }, 600);
  }, 2600);
}

// ══════════════════════════════════════════
//  PLAYER ENTRY
// ══════════════════════════════════════════
function showPlayer() {
  showScreen(screenPlayer);
  loadLibrary();
}

// ══════════════════════════════════════════
//  LIBRARY
// ══════════════════════════════════════════
async function loadLibrary() {
  // Show skeleton while loading
  showSkeletons(songList);
  try {
    const res  = await fetch('/api/songs');
    // If session expired server-side, bounce back to login
    if (res.status === 401) {
      showScreen(screenLogin);
      return;
    }
    const data = await res.json();
    allSongs     = data.songs || [];
    playHistory  = []; // reset play history whenever the library reloads
    buildPills();
    applyFilter();
    // Update 999 tab stat counter
    const vibeNum = $('vibe-track-num');
    if (vibeNum) countUp(vibeNum, allSongs.length);
    // Populate Home tab
    renderHomeTab();
    // Load artist photos after DOM settles
    requestAnimationFrame(() => loadArtistPhotos());
  } catch (err) {
    console.error('Library load error:', err);
    songList.innerHTML = `<div class="no-songs"><strong>Could not load library</strong>Make sure Flask is running and music files are placed in<br><em>Leakify-music-src/</em></div>`;
  }
}

function buildPills() {
  const artists = [...new Set(allSongs.map(s => s.artist))].sort();
  // Remove old dynamic pills
  pillsInner.querySelectorAll('.pill:not([data-artist="all"])').forEach(p => p.remove());

  // ❤ Liked pill (first after All)
  const likedPill = document.createElement('button');
  likedPill.className = 'pill pill-liked';
  likedPill.dataset.artist = 'liked';
  likedPill.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg>Liked`;
  pillsInner.appendChild(likedPill);

  artists.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.dataset.artist = a;
    btn.textContent = a;
    pillsInner.appendChild(btn);
  });
  pillsInner.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pillsInner.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      applyFilter();
    });
  });
}

function applyFilter() {
  const activePill   = pillsInner.querySelector('.pill.active');
  const artistFilter = activePill ? activePill.dataset.artist : 'all';
  const searchTerm   = searchInput.value.trim().toLowerCase();

  filteredSongs = allSongs.filter(s => {
    const matchArtist = artistFilter === 'all'
      || (artistFilter === 'liked' ? likes.has(s.filename) : s.artist === artistFilter);
    const matchSearch = !searchTerm ||
      s.display.toLowerCase().includes(searchTerm) ||
      s.artist.toLowerCase().includes(searchTerm) ||
      (s.tag && s.tag.toLowerCase() === searchTerm) ||
      (s.subfolder && s.subfolder.toLowerCase().includes(searchTerm));
    return matchArtist && matchSearch;
  });

  renderSongs();
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════
// IntersectionObserver for staggered card reveals
let cardRevealObserver = null;
function setupRevealObserver() {
  if (cardRevealObserver) cardRevealObserver.disconnect();
  cardRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        cardRevealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px 40px 0px' });
}

function renderSongs() {
  trackCount.textContent = `${filteredSongs.length} song${filteredSongs.length !== 1 ? 's' : ''}`;

  if (filteredSongs.length === 0) {
    songList.innerHTML = `<div class="no-songs"><strong>No songs found</strong>Add MP3 files to Leakify-music-src/ and refresh.</div>`;
    return;
  }

  setupRevealObserver();

  const fragment = document.createDocumentFragment();
  filteredSongs.forEach((song, idx) => {
    const card = document.createElement('div');
    // Use reveal-ready for IntersectionObserver — first 12 cards animate immediately
    if (idx < 12) {
      card.className = 'track-card';
      const delay = Math.min(idx * 0.04, 0.45);
      card.style.animationDelay = `${delay}s`;
    } else {
      card.className = 'track-card reveal-ready';
    }
    if (idx === currentIndex) card.classList.add('active');

    card.innerHTML = `
      <div class="track-card-num">${idx + 1}</div>
      <div class="track-card-art">
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M16 11v18l14-9-14-9z" fill="currentColor"/>
        </svg>
        <div class="track-card-eq-overlay">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="track-card-info">
        <div class="track-card-name">${escHtml(song.display)}</div>
        <div class="track-card-sub">${escHtml(song.artist)}${song.subfolder ? ' · ' + escHtml(song.subfolder) : ''}</div>
      </div>
      ${song.tag ? `<span class="track-tag track-tag-${song.tag}">${song.tag}</span>` : ''}
      <button class="track-card-heart${likes.has(song.filename) ? ' liked' : ''}" data-filename="${escHtml(song.filename)}" title="Like" aria-label="Like">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg>
      </button>
      <button class="track-card-action" title="Play">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
    `;

    // Heart button
    card.querySelector('.track-card-heart').addEventListener('click', e => {
      e.stopPropagation();
      toggleLike(song.filename, card.querySelector('.track-card-heart'));
    });

    card.addEventListener('click', (e) => {
      // Ripple burst
      const ripple = document.createElement('span');
      ripple.className = 'track-ripple';
      const rect = card.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      ripple.style.left = cx + 'px';
      ripple.style.top  = cy + 'px';
      card.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
      playSong(idx);
    });

    fragment.appendChild(card);
  });

  songList.innerHTML = '';
  songList.appendChild(fragment);

  // Observe off-screen cards for staggered reveal
  songList.querySelectorAll('.track-card.reveal-ready').forEach(c => {
    cardRevealObserver && cardRevealObserver.observe(c);
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════
//  PLAYBACK
// ══════════════════════════════════════════
function playSong(idx, skipHistory = false) {
  if (idx < 0 || idx >= filteredSongs.length) return;
  // Push current track to history so prev can go back (capped at 50 entries)
  if (!skipHistory && currentIndex !== -1 && currentIndex !== idx) {
    playHistory.push(currentIndex);
    if (playHistory.length > 50) playHistory.shift();
  }
  currentIndex = idx;
  const song = filteredSongs[idx];

  // Init Web Audio context on first user gesture
  initAudioVisualizer();

  // Show buffering indicator immediately for fast visual feedback
  const cards = songList.querySelectorAll('.track-card');
  if (cards[idx]) cards[idx].classList.add('buffering');

  let _retried = false;
  const tryPlay = (url) => {
    // Do NOT call audio.load() — it forces a full reset and re-buffer from scratch,
    // causing 20-30s delays. Setting src + play() directly is the correct approach.
    audio.src = url;
    audio.play()
      .then(() => {
        isPlaying = true;
        addToRecent(song);
        onPlayStart(song);
      })
      .catch(err => {
        const errStr = String(err);
        console.error('Playback error:', errStr);
        // Only retry once for auth/network errors (not NotSupportedError = missing file)
        if (!_retried && song.filename
            && !errStr.includes('AbortError')
            && !errStr.includes('NotSupportedError')) {
          _retried = true;
          fetch(`/api/song-url?path=${encodeURIComponent(song.filename)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data && data.url) {
                song.url = data.url;
                tryPlay(data.url);
              }
            })
            .catch(() => {});
        }
      });
  };

  tryPlay(song.url || `/play/${encodeURIComponent(song.filename)}`);
}

// ── Home vinyl spin helper ──
function setVinylSpin(playing) {
  const wrap = $('home-hero-vinyl-wrap');
  if (!wrap) return;
  const state = playing ? 'running' : 'paused';
  wrap.querySelectorAll('.home-hero-vinyl, .home-vinyl-ring-1, .home-vinyl-ring-2').forEach(el => {
    el.style.animationPlayState = state;
  });
}

function onPlayStart(song) {
  // Hero
  heroTrackName.textContent  = song.display;
  heroArtistName.textContent = song.artist;
  heroArt.classList.add('playing');
  heroGlow.classList.add('active');
  heroEq.classList.add('active');

  // Home vinyl — spin when playing
  setVinylSpin(true);

  // Mini bar
  applyMarquee(npbTitle, song.display);
  npbArtist.textContent = song.artist;
  nowPlayingBar.classList.add('visible', 'playing');

  // FPO
  applyMarquee(fpoTitle, song.display);
  fpoArtist.textContent = song.artist;
  fpoArt.classList.add('playing');
  fpoArtGlow.classList.add('active');

  // Dynamic tint
  setArtTint(song.artist);

  // iOS Media Session (lock screen / Control Center)
  updateMediaSession(song);

  // Sync FPO like button
  syncFpoLikeBtn(song.filename);

  // Update recently played section on home if visible
  const homeTab = $('tab-home');
  if (homeTab && !homeTab.classList.contains('hidden')) {
    renderRecentSection();
  }

  updatePlayButtons(true);
  // Only update active class in DOM — no full re-render
  updateActiveCard();
}

/** Swap .active class onto the right card without rebuilding the list */
function updateActiveCard() {
  const cards = songList.querySelectorAll('.track-card');
  cards.forEach((c, i) => c.classList.toggle('active', i === currentIndex));
  if (cards[currentIndex]) {
    cards[currentIndex].classList.remove('buffering');
    cards[currentIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/** Set text on an element and start a marquee scroll if it overflows. */
function applyMarquee(el, text) {
  // Restore to plain text first for accurate measurement
  el.innerHTML = '';
  el.style.removeProperty('text-overflow');
  el.textContent = text;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > 6) {
      // Wrap in animated span so parent clips at its own width
      el.innerHTML = '';
      el.style.textOverflow = 'clip';
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText = 'display:inline-block; white-space:nowrap; padding-right:40px;';
      span.style.setProperty('--marquee-tx', `-${overflow + 40}px`);
      span.classList.add('marquee-text');
      el.appendChild(span);
    }
  }));
}

function setArtTint(artist) {
  // Map artists to accent colors
  const tints = {
    'JuiceWrld':       'rgba(191,90,242',
    'Destroy Lonely':  'rgba(255,55,95',
    'EsdeeKid':        'rgba(10,132,255',
    'Ken Carson':      'rgba(48,209,88',
    'D4vd':            'rgba(255,159,10',
    'default':         'rgba(191,90,242',
  };
  const c = tints[artist] || tints['default'];
  fpoBg.style.background = `linear-gradient(180deg, ${c},0.18) 0%, rgba(6,0,8,0.95) 55%)`;
  heroGlow.style.background = `radial-gradient(circle, ${c},0.3), transparent 70%)`;
  fpoArtGlow.style.background = `radial-gradient(circle, ${c},0.45), transparent 65%)`;
}

function togglePlay() {
  if (!audio.src || audio.src === window.location.href) {
    if (filteredSongs.length > 0) playSong(0);
    return;
  }
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    heroArt.classList.remove('playing');
    heroEq.classList.remove('active');
    fpoArt.classList.remove('playing');
    nowPlayingBar.classList.remove('playing');
    updatePlayButtons(false);
    setVinylSpin(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  } else {
    audio.play().then(() => {
      isPlaying = true;
      heroArt.classList.add('playing');
      heroEq.classList.add('active');
      fpoArt.classList.add('playing');
      nowPlayingBar.classList.add('playing');
      updatePlayButtons(true);
      setVinylSpin(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
  }
}

function prevSong() {
  if (!filteredSongs.length) return;
  // If we have history, go back to the actual last-played track (Spotify-style)
  if (playHistory.length > 0) {
    playSong(playHistory.pop(), true); // skipHistory — already popping the stack
  } else if (shuffle) {
    playSong(Math.floor(Math.random() * filteredSongs.length));
  } else {
    playSong((currentIndex - 1 + filteredSongs.length) % filteredSongs.length);
  }
}

function nextSong() {
  if (!filteredSongs.length) return;
  if (shuffle) {
    playSong(Math.floor(Math.random() * filteredSongs.length));
  } else {
    playSong((currentIndex + 1) % filteredSongs.length);
  }
}

function updatePlayButtons(playing) {
  const pauseSvg = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  const playSvg  = '<path d="M8 5v14l11-7z"/>';
  const icon = playing ? pauseSvg : playSvg;
  npbPlayBtn.querySelector('svg').innerHTML  = icon;
  fpoPlayBtn.querySelector('svg').innerHTML  = icon;
}

// ── Progress ───────────────────────────────
function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function updateProgress() {
  if (!audio.duration || isSeeking) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  const pctStr = pct + '%';
  fpoFill.style.width  = pctStr;
  fpoThumb.style.left  = pctStr;
  if (npbInlineFill) npbInlineFill.style.width = pctStr;
  fpoElapsed.textContent   = formatTime(audio.currentTime);
  fpoDuration.textContent  = formatTime(audio.duration);
}

function seekAt(e) {
  const rect = fpoProgressBar.getBoundingClientRect();
  const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
    fpoFill.style.width = (pct * 100) + '%';
    fpoThumb.style.left = (pct * 100) + '%';
  }
}

// ══════════════════════════════════════════
//  FULL PLAYER OVERLAY
// ══════════════════════════════════════════
function openFPO() {
  fpoOpen = true;
  fpo.classList.add('open');
  fpo.style.transform = '';
  // Show only the 'Playing' button as active while FPO is open
  $$('.bnav-btn').forEach(b => b.classList.remove('active'));
  const bp = $('bnav-player');
  if (bp) { bp.classList.add('active'); moveBnavPill(bp); }
}
function closeFPO() {
  fpoOpen = false;
  fpo.classList.remove('open');
  const bp = $('bnav-player');
  if (bp) bp.classList.remove('active');
  // Re-activate whichever underlying tab is currently visible
  const tabVault = $('tab-vault');
  const tab999   = $('tab-999');
  const tabHome  = $('tab-home');
  let reactivated;
  if (tabVault && !tabVault.classList.contains('hidden')) {
    reactivated = $('bnav-vault');
  } else if (tab999 && !tab999.classList.contains('hidden')) {
    reactivated = $('bnav-999');
  } else {
    reactivated = $('bnav-home');
  }
  if (reactivated) { reactivated.classList.add('active'); moveBnavPill(reactivated); }
}

// Swipe-down-to-close gesture (iOS native feel)
(function setupFPOSwipe() {
  let startY = 0, startX = 0, dragging = false, startTime = 0;

  fpo.addEventListener('touchstart', e => {
    // Don't initiate drag when touching an input (range slider, etc.)
    if (e.target.tagName === 'INPUT') return;
    // Only initiate from the handle area or top 80px of overlay (not content scroll)
    const touch = e.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    startTime = Date.now();
    dragging = true;
    fpo.style.transition = 'none';
  }, { passive: true });

  fpo.addEventListener('touchmove', e => {
    if (!dragging || !fpoOpen) return;
    // Don't interfere with input elements (range sliders)
    if (e.target.tagName === 'INPUT') return;
    const touch = e.touches[0];
    const dy = touch.clientY - startY;
    const dx = touch.clientX - startX;

    // Only track predominantly vertical drags downward
    if (dy < 0 || Math.abs(dx) > Math.abs(dy)) return;

    // Don't intercept if user is scrolling inside fpo-content
    if (e.target.closest('.fpo-content') && dy < 60) return;

    e.preventDefault();
    const resistance = Math.min(dy * 0.75, 300);
    fpo.style.transform = `translateY(${resistance}px)`;
  }, { passive: false });

  fpo.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const touch = e.changedTouches[0];
    const dy = touch.clientY - startY;
    const elapsed = Date.now() - startTime;
    const velocity = dy / elapsed; // px/ms

    fpo.style.transition = '';
    fpo.style.transform = '';

    if (dy > 120 || velocity > 0.5) {
      closeFPO();
    }
  }, { passive: true });
})();

// ══════════════════════════════════════════
//  EVENT SETUP
// ══════════════════════════════════════════
function setupAllEvents() {
  setupLoginEvents();

  // ── Player controls ──
  npbPlayBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
  prevBtn.addEventListener('click',    (e) => { e.stopPropagation(); prevSong(); });
  nextBtn.addEventListener('click',    (e) => { e.stopPropagation(); nextSong(); });

  fpoPlayBtn.addEventListener('click', togglePlay);
  fpoPrevBtn.addEventListener('click', prevSong);
  fpoNextBtn.addEventListener('click', nextSong);

  function toggleShuffle() {
    shuffle = !shuffle;
    fpoShuffleBtn.classList.toggle('active', shuffle);
  }
  function toggleRepeat() {
    repeat = !repeat;
    fpoRepeatBtn.classList.toggle('active', repeat);
  }
  fpoShuffleBtn.addEventListener('click', toggleShuffle);
  fpoRepeatBtn.addEventListener('click',  toggleRepeat);

  // Open FPO by tapping anywhere on mini bar except control buttons
  nowPlayingBar.querySelector('.npb-info').addEventListener('click', openFPO);
  nowPlayingBar.querySelector('.npb-art').addEventListener('click', openFPO);
  fpoClose.addEventListener('click', closeFPO);

  // Volume — single range input in FPO (reliable on all platforms including iOS)
  if (fpoVolume) {
    fpoVolume.addEventListener('input', () => {
      const vol = fpoVolume.value / 100;
      audio.volume = vol;
      syncVolume(vol);
    });
    // Prevent the FPO swipe-down gesture from stealing touch on the range slider
    fpoVolume.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  // Audio events
  audio.addEventListener('timeupdate', updateProgress);
  // Keep mediaSession.playbackState in sync
  audio.addEventListener('play',  () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });
  audio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });
  audio.addEventListener('ended', () => {
    if (repeat) {
      audio.currentTime = 0;
      audio.play();
    } else {
      nextSong();
    }
  });
  audio.addEventListener('loadedmetadata', () => {
    fpoDuration.textContent = formatTime(audio.duration);
  });
  // Buffering feedback — show spinner ring on the active track card
  audio.addEventListener('waiting', () => {
    const cards = songList.querySelectorAll('.track-card');
    if (cards[currentIndex]) cards[currentIndex].classList.add('buffering');
  });
  audio.addEventListener('playing', () => {
    songList.querySelectorAll('.track-card.buffering')
      .forEach(c => c.classList.remove('buffering'));
  });

  // Progress bar seek
  fpoProgressBar.addEventListener('mousedown', (e) => {
    isSeeking = true;
    fpoProgressBar.classList.add('seeking');
    seekAt(e);
  });
  fpoProgressBar.addEventListener('touchstart', (e) => {
    isSeeking = true;
    fpoProgressBar.classList.add('seeking');
    seekAt(e);
  }, { passive: true });
  window.addEventListener('mousemove', (e) => { if (isSeeking) seekAt(e); });
  window.addEventListener('touchmove', (e) => { if (isSeeking) seekAt(e); }, { passive: true });
  window.addEventListener('mouseup', () => {
    if (isSeeking) {
      isSeeking = false;
      fpoProgressBar.classList.remove('seeking');
    }
  });
  window.addEventListener('touchend', () => {
    if (isSeeking) {
      isSeeking = false;
      fpoProgressBar.classList.remove('seeking');
    }
  });

  // Search toggle
  searchToggle.addEventListener('click', () => {
    const wasOpen = searchBarWrap.classList.contains('open');
    searchBarWrap.classList.toggle('open');
    if (!wasOpen) {
      // Opening — focus
      setTimeout(() => searchInput.focus(), 350);
    } else {
      // Closing — clear search so vault shows all songs
      if (searchInput.value) {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        applyFilter();
      }
    }
  });
  searchInput.addEventListener('input', () => {
    searchClear.classList.toggle('hidden', !searchInput.value);
    applyFilter();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    applyFilter();
    searchInput.focus();
  });

  // Refresh
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    loadLibrary().then(() => {
      refreshBtn.classList.remove('spinning');
    });
  });

  // Update app — bust SW cache and hard reload
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    showUpdateToast('Updating…', false);
    try {
      if (swRegistration) await swRegistration.update();
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      showUpdateToast('Done! Reloading…', false);
      setTimeout(() => location.reload(true), 900);
    } catch {
      showUpdateToast('Update failed', true);
      updateBtn.disabled = false;
    }
  });

  // Keyboard shortcuts (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    // Space or K = play/pause
    if (e.code === 'Space' || e.code === 'KeyK') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyL') { e.preventDefault(); nextSong(); }
    if (e.code === 'ArrowLeft'  || e.code === 'KeyJ') { e.preventDefault(); prevSong(); }
    if (e.code === 'Escape' && fpoOpen) closeFPO();
    // M = mute/unmute
    if (e.code === 'KeyM') {
      audio.muted = !audio.muted;
      const opacity = audio.muted ? '0.4' : '1';
      if (fpoVolume) fpoVolume.style.opacity = opacity;
    }
  });

  // iOS: prevent bounce scroll on body
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.player-content') &&
        !e.target.closest('.fpo-content') &&
        !e.target.closest('.pills-inner') &&
        !e.target.closest('#screen-loader') &&
        !e.target.closest('.vibe-grid') &&
        !e.target.closest('.artist-shelf') &&
        !e.target.closest('.home-preview-list') &&
        !e.target.closest('#tab-home') &&
        !e.target.closest('#tab-999')) {
      e.preventDefault();
    }
  }, { passive: false });

  // ── iOS PWA: resume audio when returning from background / home screen ──
  // visibilitychange fires when user switches apps or locks screen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Resume suspended AudioContext (browser policy suspends after inactivity)
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      // If track was playing but iOS paused the audio element, restart it
      if (isPlaying && audio.paused && audio.src) {
        audio.play().catch(() => {});
      }
    } else {
      // App going to background — update mediaSession so iOS keeps control
      if ('mediaSession' in navigator && isPlaying) {
        navigator.mediaSession.playbackState = 'playing';
      }
    }
  });
  // pageshow fires on iOS PWA when restoring the page from the bfcache
  window.addEventListener('pageshow', (e) => {
    if (isPlaying && audio.paused && audio.src) {
      audio.play().catch(() => {});
    }
  });

  // ── Bottom Navigation ──
  setupBottomNav();

  // ── Parallax on scroll ──
  setupParallax();

  // ── New features ──
  setupSleepTimer();
  setupQueuePanel();
  setupFpoLike();
  setupTabSwipe();

  // Keyboard: F = like current song, ↑↓ = volume
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyF') {
      if (currentIndex >= 0 && filteredSongs[currentIndex]) {
        const song = filteredSongs[currentIndex];
        const heartEl = songList.querySelector(`.track-card-heart[data-filename="${CSS.escape(song.filename)}"]`);
        toggleLike(song.filename, heartEl);
      }
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      const v = Math.min(100, Math.round(audio.volume * 100) + 5);
      audio.volume = v / 100;
      syncVolume(v / 100);
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      const v = Math.max(0, Math.round(audio.volume * 100) - 5);
      audio.volume = v / 100;
      syncVolume(v / 100);
    }
  });
}

// ══════════════════════════════════════════
//  BOTTOM NAVIGATION
// ══════════════════════════════════════════
// ── Sliding pill indicator for bottom nav ──────────────────
function moveBnavPill(activeBtn) {
  const pill = $('bnav-pill');
  const nav  = $('bottom-nav');
  if (!pill || !activeBtn || !nav) return;
  const navRect = nav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const center   = btnRect.left - navRect.left + btnRect.width / 2;
  const pillW    = btnRect.width - 16;
  pill.style.width = pillW + 'px';
  pill.style.left  = (center - pillW / 2) + 'px';
}

function setupBottomNav() {
  const bnavHome   = $('bnav-home');
  const bnavVault  = $('bnav-vault');
  const bnav999    = $('bnav-999');
  const bnavPlayer = $('bnav-player');
  const tabHome    = $('tab-home');
  const tabVault   = $('tab-vault');
  const tab999     = $('tab-999');
  const allBtns    = [bnavHome, bnavVault, bnav999, bnavPlayer];

  function hideAllTabs() {
    allBtns.forEach(b => b && b.classList.remove('active'));
    [tabHome, tabVault, tab999].forEach(t => t && t.classList.add('hidden'));
  }

  function scrollTop() {
    const pc = $('player-content');
    if (pc) pc.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const TAB_ORDER = ['home', 'vault', '999', 'player'];

  function animateTabTransition(toTab, fromTab) {
    const allTabs = [tabHome, tabVault, tab999];
    const tabMap  = { home: tabHome, vault: tabVault, '999': tab999 };
    const incoming = tabMap[toTab];
    if (!incoming || !fromTab || fromTab === toTab) return;
    const fromIdx = TAB_ORDER.indexOf(fromTab);
    const toIdx   = TAB_ORDER.indexOf(toTab);
    const goingRight = toIdx > fromIdx;
    incoming.classList.remove('slide-in-left', 'slide-in-right');
    incoming.classList.add(goingRight ? 'slide-in-right' : 'slide-in-left');
    // Remove animation class after it's done
    incoming.addEventListener('animationend', () => {
      incoming.classList.remove('slide-in-left', 'slide-in-right');
    }, { once: true });
  }

  function setTab(tab) {
    const fromTab = activeTab;
    activeTab = tab;
    hideAllTabs();
    if (tab === 'home') {
      bnavHome  && bnavHome.classList.add('active');
      tabHome   && tabHome.classList.remove('hidden');
      animateTabTransition('home', fromTab);
      moveBnavPill(bnavHome);
      scrollTop();
    } else if (tab === 'vault') {
      bnavVault && bnavVault.classList.add('active');
      tabVault  && tabVault.classList.remove('hidden');
      animateTabTransition('vault', fromTab);
      moveBnavPill(bnavVault);
      scrollTop();
    } else if (tab === '999') {
      bnav999   && bnav999.classList.add('active');
      tab999    && tab999.classList.remove('hidden');
      animateTabTransition('999', fromTab);
      moveBnavPill(bnav999);
      // Update stat counter
      const vibeNum = $('vibe-track-num');
      if (vibeNum && allSongs.length > 0) countUp(vibeNum, allSongs.length);
      scrollTop();
    } else if (tab === 'player') {
      // Opens FPO if a song is active, else fall back to vault
      bnavVault && bnavVault.classList.add('active');
      tabVault  && tabVault.classList.remove('hidden');
      animateTabTransition('vault', fromTab);
      moveBnavPill(bnavVault);
      if (isPlaying || (audio.src && audio.src !== window.location.href)) {
        openFPO();
      }
    }
  }

  bnavHome   && bnavHome.addEventListener('click',   () => setTab('home'));
  bnavVault  && bnavVault.addEventListener('click',  () => setTab('vault'));
  bnav999    && bnav999.addEventListener('click',    () => setTab('999'));
  bnavPlayer && bnavPlayer.addEventListener('click', () => setTab('player'));

  // Reposition pill on resize (orientation change)
  window.addEventListener('resize', () => {
    const activeBtn = document.querySelector('.bnav-btn.active');
    if (activeBtn) moveBnavPill(activeBtn);
  });

  // Default tab on load: home
  // Use rAF so the nav has painted and getBoundingClientRect is accurate
  requestAnimationFrame(() => setTab('home'));
}

// ══════════════════════════════════════════
//  HOME TAB RENDERING
// ══════════════════════════════════════════
function renderHomeTab() {
  // ── Stat: total tracks (animated count-up) ──
  const statTracks = $('home-stat-tracks');
  if (statTracks) countUp(statTracks, allSongs.length || 0);

  // ── Stat: unique artists (animated) ──
  const statArtists = $('home-stat-artists');
  if (statArtists) {
    const uniqueArtists = new Set(allSongs.map(s => s.artist)).size;
    countUp(statArtists, uniqueArtists || 0);
  }

  // ── Artist card counts ──
  const artistMap = {
    'JuiceWrld':      'ac-JuiceWrld',
    'Destroy Lonely': 'ac-DestroyLonely',
    'Ken Carson':     'ac-KenCarson',
    'EsdeeKid':       'ac-EsdeeKid',
    'D4vd':           'ac-D4vd',
  };
  Object.entries(artistMap).forEach(([artist, id]) => {
    const el = $(id);
    if (!el) return;
    const n = allSongs.filter(s => s.artist === artist).length;
    el.textContent = n ? `${n} tracks` : '—';
  });

  // ── Category card counts ──
  const tagMap = {
    'leaked':  'cc-LEAKED',
    'session': 'cc-SESSION',
    'remaster':'cc-REMASTER',
    'extra':   'cc-EXTRA',
  };
  Object.entries(tagMap).forEach(([tag, id]) => {
    const el = $(id);
    if (!el) return;
    const n = allSongs.filter(s => s.tag && s.tag.toLowerCase() === tag).length;
    el.textContent = n ? `${n} tracks` : '—';
  });

  // ── Artist card clicks → vault filtered by artist ──
  document.querySelectorAll('.artist-card[data-artist]').forEach(card => {
    card.addEventListener('click', () => {
      switchToVaultAndFilter(card.dataset.artist, null);
    });
  });

  // ── Category card clicks → vault filtered by tag ──
  document.querySelectorAll('.category-card[data-filter]').forEach(card => {
    card.addEventListener('click', () => {
      switchToVaultAndFilter(null, card.dataset.filter.toLowerCase());
    });
  });

  // ── "See all" buttons ──
  document.querySelectorAll('.home-see-all[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchToVaultAndFilter(null, btn.dataset.filter.toLowerCase());
    });
  });

  // ── Hero: play all & shuffle ──
  const playAllBtn = $('home-play-all-btn');
  const shuffleBtn = $('home-shuffle-all-btn');
  if (playAllBtn) {
    playAllBtn.addEventListener('click', () => {
      if (allSongs.length) {
        filteredSongs = [...allSongs];
        playSong(0);
        switchToVaultAndFilter('all', null);
      }
    });
  }
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      if (allSongs.length) {
        filteredSongs = [...allSongs];
        shuffle = true;
        const fpoShuffleBtn = $('fpo-shuffle-btn');
        if (fpoShuffleBtn) fpoShuffleBtn.classList.add('active');
        const idx = Math.floor(Math.random() * allSongs.length);
        playSong(idx);
        switchToVaultAndFilter('all', null);
      }
    });
  }

  // ── Home preview lists ──
  renderHomePreviewList('home-leaked-list', 'leaked', 5);
  renderHomePreviewList('home-session-list', 'session', 5);

  // ── Liked section ──
  renderLikedSection();
  const seeLikedBtn = $('home-see-liked');
  if (seeLikedBtn) {
    seeLikedBtn.onclick = () => {
      const allPill = pillsInner.querySelector('.pill[data-artist="liked"]');
      if (allPill) { pillsInner.querySelectorAll('.pill').forEach(p => p.classList.remove('active')); allPill.classList.add('active'); }
      const tabHome = $('tab-home'); const tabVault = $('tab-vault');
      [$('bnav-home'), $('bnav-999')].forEach(b => b && b.classList.remove('active'));
      tabHome && tabHome.classList.add('hidden');
      $('bnav-vault') && $('bnav-vault').classList.add('active');
      tabVault && tabVault.classList.remove('hidden');
      applyFilter();
    };
  }

  // ── Recently played section ──
  renderRecentSection();
  const clearRecentBtn = $('home-clear-recent');
  if (clearRecentBtn) {
    clearRecentBtn.onclick = () => {
      recentlyPlayed = []; saveRecent();
      renderRecentSection();
    };
  }
}

/** Render a short preview list for the Home tab */
function renderHomePreviewList(containerId, tag, limit) {
  const container = $(containerId);
  if (!container) return;
  const songs = allSongs.filter(s => s.tag && s.tag.toLowerCase() === tag).slice(0, limit);

  if (!songs.length) {
    container.innerHTML = `<div class="home-preview-empty">No ${tag} tracks found</div>`;
    return;
  }

  container.innerHTML = '';
  songs.forEach((song, i) => {
    const row = document.createElement('div');
    row.className = 'home-preview-song';
    row.style.animationDelay = `${i * 0.06}s`;
    row.innerHTML = `
      <span class="hps-num">${i + 1}</span>
      <div class="hps-art">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
          <path d="M10 8l6 4-6 4V8z" fill="currentColor"/>
        </svg>
      </div>
      <div class="hps-info">
        <div class="hps-name">${escHtml(song.display)}</div>
        <div class="hps-sub">${escHtml(song.artist)}${song.subfolder ? ' · ' + escHtml(song.subfolder) : ''}</div>
      </div>
      ${song.tag ? `<span class="track-tag track-tag-${song.tag} hps-tag">${song.tag}</span>` : ''}
      <button class="hps-play" aria-label="Play">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
    `;
    row.addEventListener('click', () => {
      // Scope playback to the same tag, and sync the vault list so next/prev stays consistent
      filteredSongs = allSongs.filter(s => s.tag && s.tag.toLowerCase() === tag);
      const idx = filteredSongs.findIndex(s => s.filename === song.filename);
      playSong(idx >= 0 ? idx : 0);
      renderSongs(); // keep vault DOM in sync with the new filteredSongs
    });
    container.appendChild(row);
  });
}

/** Render Liked section on home tab */
function renderLikedSection() {
  const section = $('home-liked-section');
  const container = $('home-liked-list');
  if (!section || !container) return;

  const likedSongs = allSongs.filter(s => likes.has(s.filename)).slice(0, 5);
  if (!likedSongs.length) { section.style.display = 'none'; return; }
  section.style.display = '';

  container.innerHTML = '';
  likedSongs.forEach((song, i) => {
    const row = document.createElement('div');
    row.className = 'home-preview-song';
    row.style.animationDelay = `${i * 0.05}s`;
    row.innerHTML = `
      <span class="hps-num"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg></span>
      <div class="hps-art"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.4"/><path d="M10 8l6 4-6 4V8z" fill="currentColor"/></svg></div>
      <div class="hps-info">
        <div class="hps-name">${escHtml(song.display)}</div>
        <div class="hps-sub">${escHtml(song.artist)}</div>
      </div>
      <button class="hps-play" aria-label="Play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
    `;
    row.addEventListener('click', () => {
      filteredSongs = allSongs.filter(s => likes.has(s.filename));
      const idx = filteredSongs.findIndex(s => s.filename === song.filename);
      playSong(idx >= 0 ? idx : 0);
      renderSongs();
    });
    container.appendChild(row);
  });
}

/** Render Recently Played section on home tab */
function renderRecentSection() {
  const section = $('home-recent-section');
  const container = $('home-recent-list');
  if (!section || !container) return;

  const recent = recentlyPlayed.slice(0, 6);
  if (!recent.length) { section.style.display = 'none'; return; }
  section.style.display = '';

  container.innerHTML = '';
  recent.forEach((song, i) => {
    const row = document.createElement('div');
    row.className = 'home-preview-song';
    row.style.animationDelay = `${i * 0.05}s`;
    row.innerHTML = `
      <span class="hps-num">${i + 1}</span>
      <div class="hps-art"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.4"/><path d="M10 8l6 4-6 4V8z" fill="currentColor"/></svg></div>
      <div class="hps-info">
        <div class="hps-name">${escHtml(song.display)}</div>
        <div class="hps-sub">${escHtml(song.artist)}</div>
      </div>
      ${song.tag ? `<span class="track-tag track-tag-${song.tag} hps-tag">${song.tag}</span>` : ''}
      <button class="hps-play" aria-label="Play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
    `;
    row.addEventListener('click', () => {
      // Find in allSongs and play, scoping filteredSongs to all
      filteredSongs = [...allSongs];
      const idx = filteredSongs.findIndex(s => s.filename === song.filename);
      if (idx >= 0) {
        playSong(idx);
        renderSongs();
      }
    });
    container.appendChild(row);
  });
}

/** Switch to vault tab and optionally filter by artist or tag */
function switchToVaultAndFilter(artist, tag) {
  const bnavVault = $('bnav-vault');
  const tabHome   = $('tab-home');
  const tabVault  = $('tab-vault');
  const bnav999   = $('bnav-999');
  const tab999    = $('tab-999');
  const bnavHome  = $('bnav-home');

  // Switch UI to vault with slide animation from the left (home→vault)
  const fromTab = activeTab;
  activeTab = 'vault';
  [bnavHome, bnavVault, bnav999].forEach(b => b && b.classList.remove('active'));
  [tabHome, tab999].forEach(t => t && t.classList.add('hidden'));
  bnavVault && bnavVault.classList.add('active');
  tabVault  && tabVault.classList.remove('hidden');
  if (tabVault && fromTab !== 'vault') {
    tabVault.classList.remove('slide-in-left', 'slide-in-right');
    tabVault.classList.add('slide-in-right');
    tabVault.addEventListener('animationend', () => tabVault.classList.remove('slide-in-right'), { once: true });
  }

  if (artist && artist !== 'all') {
    // Clear any active search when switching to an artist filter
    const si = $('search-input');
    if (si && si.value) {
      si.value = '';
      const sc = $('search-clear');
      if (sc) sc.classList.add('hidden');
      const sbw = $('search-bar-wrap');
      if (sbw) sbw.classList.remove('open');
    }
    // Click the matching artist pill
    const pills = document.querySelectorAll('#pills-inner .pill');
    pills.forEach(p => {
      p.classList.remove('active');
      if (p.dataset.artist === artist) p.classList.add('active');
    });
  } else if (tag) {
    // Reset to "all" pill and set search to the tag keyword (matches by tag property in applyFilter)
    const allPill = document.querySelector('#pills-inner .pill[data-artist="all"]');
    if (allPill) {
      document.querySelectorAll('#pills-inner .pill').forEach(p => p.classList.remove('active'));
      allPill.classList.add('active');
    }
    const si = $('search-input');
    if (si) {
      si.value = tag;
      const sc = $('search-clear');
      if (sc) sc.classList.remove('hidden');
      // Open the search bar so the user can see the filter is active
      const sbw = $('search-bar-wrap');
      if (sbw) sbw.classList.add('open');
    }
  }
  applyFilter();
  const pc = $('player-content');
  if (pc) pc.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════
//  PARALLAX SCROLL EFFECT  (aurora + vibe hero)
// ══════════════════════════════════════════
function setupParallax() {
  const playerContent = $('player-content');
  const aurora1 = document.querySelector('.aurora-1');
  const aurora2 = document.querySelector('.aurora-2');
  const aurora3 = document.querySelector('.aurora-3');
  const aurora4 = document.querySelector('.aurora-4');
  const vibeHeroImg = document.querySelector('.vibe-hero-img');

  if (!playerContent) return;

  let ticking = false;
  playerContent.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const sy = playerContent.scrollTop;
        const factor = 0.18;
        if (aurora1) aurora1.style.transform = `translate(0, ${sy * factor * 0.5}px) scale(1)`;
        if (aurora2) aurora2.style.transform = `translate(${sy * factor * -0.3}px, ${sy * factor * 0.8}px) scale(1)`;
        if (aurora3) aurora3.style.transform = `translate(${sy * factor * 0.4}px, ${sy * factor * -0.6}px) scale(1)`;
        if (aurora4) aurora4.style.transform = `translate(${sy * factor * -0.5}px, ${sy * factor * 0.3}px) scale(1)`;
        if (vibeHeroImg) vibeHeroImg.style.transform = `scale(1.08) translateY(${sy * 0.08}px)`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// ══════════════════════════════════════════
//  AUDIO VISUALIZER (Web Audio API)
// ══════════════════════════════════════════
function initAudioVisualizer() {
  if (audioCtx) {
    // Resume suspended context (browser policy suspends after inactivity)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    const src  = audioCtx.createMediaElementSource(audio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.80;
    src.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    vizData = new Uint8Array(analyserNode.frequencyBinCount);
    startVisualizer();
  } catch (e) {
    console.warn('[Visualizer] Web Audio API unavailable:', e);
  }
}

function startVisualizer() {
  if (vizAF) cancelAnimationFrame(vizAF);
  drawVisualizer();
}

function drawVisualizer() {
  vizAF = requestAnimationFrame(drawVisualizer);
  const canvas = $('fpo-visualizer');
  if (!canvas || !analyserNode) return;

  // Only draw when FPO is open — skip for perf
  if (!fpoOpen) return;

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth;
  const H   = canvas.offsetHeight;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  analyserNode.getByteFrequencyData(vizData);

  const bins = analyserNode.frequencyBinCount;
  const step = Math.max(1, Math.floor(bins / VIZ_BARS));
  const barW = canvas.width / VIZ_BARS;
  const gap  = Math.max(1, barW * 0.18);

  for (let i = 0; i < VIZ_BARS; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += (vizData[i * step + j] || 0);
    const v    = sum / step / 255;
    const barH = Math.max(3, v * canvas.height * 0.9 + 3);
    const x    = i * barW + gap * 0.5;
    const w    = barW - gap;

    // Gradient: purple → pink based on frequency position
    const t  = i / (VIZ_BARS - 1);
    const r  = Math.round(191 + (255 - 191) * t) | 0;
    const g  = Math.round(90  * (1 - t))  | 0;
    const b  = Math.round(242 * (1 - t) + 95 * t) | 0;
    const a  = isPlaying ? (0.55 + v * 0.45) : 0.18;
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;

    const radius = Math.min(w / 2, 3);
    const y = canvas.height - barH;

    // Rounded top corners
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, canvas.height);
    ctx.lineTo(x, canvas.height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  // Toggle idle class
  canvas.classList.toggle('idle', !isPlaying);
}

// ══════════════════════════════════════════
//  LIKES / FAVORITES
// ══════════════════════════════════════════
function toggleLike(filename, btnEl) {
  if (likes.has(filename)) {
    likes.delete(filename);
  } else {
    likes.add(filename);
    if (navigator.vibrate) navigator.vibrate(10);
  }
  saveLikes();

  // Animate heart
  if (btnEl) {
    btnEl.classList.toggle('liked', likes.has(filename));
    btnEl.classList.add('pop');
    setTimeout(() => btnEl && btnEl.classList.remove('pop'), 380);
  }

  // Update all track cards for this filename
  songList.querySelectorAll('.track-card-heart').forEach(h => {
    if (h.dataset.filename === filename) h.classList.toggle('liked', likes.has(filename));
  });

  // Sync FPO like button if the current song is the one being toggled
  if (currentIndex >= 0 && filteredSongs[currentIndex]?.filename === filename) {
    syncFpoLikeBtn(filename);
  }

  // Refresh home liked section
  const homeTab = $('tab-home');
  if (homeTab && !homeTab.classList.contains('hidden')) renderLikedSection();

  // If we're on the liked filter pill, re-render
  const activePill = pillsInner.querySelector('.pill.active');
  if (activePill && activePill.dataset.artist === 'liked') renderSongs();
}

function syncFpoLikeBtn(filename) {
  const btn = $('fpo-like-btn');
  if (!btn) return;
  const isLiked = likes.has(filename);
  btn.classList.toggle('liked', isLiked);
  const span = btn.querySelector('span');
  if (span) span.textContent = isLiked ? 'Liked' : 'Like';
}

// ══════════════════════════════════════════
//  SLEEP TIMER
// ══════════════════════════════════════════
function setupSleepTimer() {
  const modal    = $('sleep-timer-modal');
  const backdrop = $('stm-backdrop');
  const sleepBtn = $('fpo-sleep-btn');
  const label    = $('fpo-sleep-label');
  if (!modal || !sleepBtn) return;

  // Open modal
  sleepBtn.addEventListener('click', () => { modal.classList.remove('hidden'); });
  if (backdrop) backdrop.addEventListener('click', () => modal.classList.add('hidden'));

  // Option buttons
  modal.querySelectorAll('.stm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.mins, 10);
      modal.classList.add('hidden');

      // Clear any existing timer
      if (sleepTimerIvl) { clearInterval(sleepTimerIvl); sleepTimerIvl = null; }

      if (!mins) {
        // Turn off
        sleepTimerEndMs = 0;
        sleepBtn.classList.remove('sleep-active');
        if (label) label.textContent = 'Sleep';
        modal.querySelectorAll('.stm-btn').forEach(b => b.classList.remove('stm-active'));
        return;
      }

      sleepTimerEndMs = Date.now() + mins * 60 * 1000;
      sleepBtn.classList.add('sleep-active');
      modal.querySelectorAll('.stm-btn').forEach(b => b.classList.remove('stm-active'));
      btn.classList.add('stm-active');

      function updateLabel() {
        const remaining = sleepTimerEndMs - Date.now();
        if (remaining <= 0) {
          clearInterval(sleepTimerIvl);
          sleepTimerIvl = null;
          sleepTimerEndMs = 0;
          sleepBtn.classList.remove('sleep-active');
          if (label) label.textContent = 'Sleep';
          // Fade out audio
          let vol = audio.volume;
          const fade = setInterval(() => {
            vol = Math.max(0, vol - 0.05);
            audio.volume = vol;
            if (vol <= 0) {
              clearInterval(fade);
              audio.pause();
              isPlaying = false;
              updatePlayButtons(false);
              heroArt.classList.remove('playing');
              heroEq.classList.remove('active');
              fpoArt.classList.remove('playing');
              nowPlayingBar.classList.remove('playing');
              setVinylSpin(false);
              // Restore volume for next play
              setTimeout(() => { audio.volume = 0.8; syncVolume(0.8); }, 400);
            }
          }, 100);
          return;
        }
        const remSec = Math.ceil(remaining / 1000);
        const m = Math.floor(remSec / 60);
        const s = remSec % 60;
        if (label) label.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      }
      updateLabel();
      sleepTimerIvl = setInterval(updateLabel, 1000);
    });
  });
}

// ══════════════════════════════════════════
//  QUEUE PANEL
// ══════════════════════════════════════════
let queueOpen = false;
let queueBackdrop = null;

function setupQueuePanel() {
  const panel    = $('queue-panel');
  const queueBtn = $('fpo-queue-btn');
  const closeBtn = $('qp-close');
  if (!panel || !queueBtn) return;

  // Create backdrop
  queueBackdrop = document.createElement('div');
  queueBackdrop.className = 'queue-backdrop';
  document.body.appendChild(queueBackdrop);
  queueBackdrop.addEventListener('click', closeQueuePanel);

  queueBtn.addEventListener('click', () => {
    if (queueOpen) closeQueuePanel(); else openQueuePanel();
  });
  if (closeBtn) closeBtn.addEventListener('click', closeQueuePanel);
}

function openQueuePanel() {
  const panel = $('queue-panel');
  if (!panel) return;
  renderQueueList();
  panel.classList.add('open');
  if (queueBackdrop) queueBackdrop.classList.add('active');
  queueOpen = true;
}

function closeQueuePanel() {
  const panel = $('queue-panel');
  if (panel) panel.classList.remove('open');
  if (queueBackdrop) queueBackdrop.classList.remove('active');
  queueOpen = false;
}

function renderQueueList() {
  const list = $('qp-list');
  if (!list) return;
  list.innerHTML = '';

  if (!filteredSongs.length) {
    list.innerHTML = '<div style="padding:20px;color:var(--text-3);text-align:center;font-size:13px">Queue is empty</div>';
    return;
  }

  const start = Math.max(0, currentIndex);
  const items = filteredSongs.slice(start, start + 20);

  items.forEach((song, i) => {
    const realIdx = start + i;
    const item = document.createElement('div');
    item.className = 'qp-item' + (realIdx === currentIndex ? ' qp-now' : '');
    item.innerHTML = `
      <span class="qp-item-num">${realIdx === currentIndex ? '♪' : realIdx + 1}</span>
      <div class="qp-item-info">
        <div class="qp-item-name">${escHtml(song.display)}</div>
        <div class="qp-item-sub">${escHtml(song.artist)}</div>
      </div>
      <span class="qp-item-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
    `;
    item.addEventListener('click', () => {
      playSong(realIdx);
      closeQueuePanel();
    });
    list.appendChild(item);
  });
}

// ══════════════════════════════════════════
//  FPO LIKE BUTTON SETUP
// ══════════════════════════════════════════
function setupFpoLike() {
  const btn = $('fpo-like-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (currentIndex < 0 || !filteredSongs[currentIndex]) return;
    const song = filteredSongs[currentIndex];
    toggleLike(song.filename, btn);
  });
}

// ══════════════════════════════════════════
//  TAB SWIPE GESTURE (mobile)
// ══════════════════════════════════════════
function setupTabSwipe() {
  const pc = $('player-content');
  if (!pc) return;

  const TABS  = ['home', 'vault', '999'];
  let sx = 0, sy = 0, swipeActive = false;

  pc.addEventListener('touchstart', e => {
    if (fpoOpen || queueOpen) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    swipeActive = true;
  }, { passive: true });

  pc.addEventListener('touchend', e => {
    if (!swipeActive) return;
    swipeActive = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    // Find current active tab
    const activeBtn = document.querySelector('.bnav-btn.active');
    const curTab = activeBtn ? activeBtn.dataset.tab || activeBtn.id.replace('bnav-','') : 'home';
    let idx = TABS.indexOf(curTab);
    if (idx < 0) idx = 0;

    let next;
    if (dx < 0) next = TABS[Math.min(idx + 1, TABS.length - 1)]; // swipe left = next
    else        next = TABS[Math.max(idx - 1, 0)];                // swipe right = prev

    if (next !== curTab) {
      const bBtn = $(`bnav-${next}`);
      if (bBtn) bBtn.click();
    }
  }, { passive: true });
}