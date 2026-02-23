/* ═══════════════════════════════════════════════
   LEAKIFY — JuiceWrld Premium Music Player
   Full Client-Side Logic
═══════════════════════════════════════════════ */

'use strict';

// ── Credentials ──────────────────────────────
const CREDS = { user: 'z4bry87', pass: 'MkZ808999' };

// ── State ─────────────────────────────────────
let allSongs      = [];
let filteredSongs = [];
let currentIndex  = -1;
let isPlaying     = false;
let shuffle       = false;
let repeat        = false;
let fpoOpen       = false;
let isSeeking     = false;

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

// ── Volume slider gradient helper (module scope — used at boot + in events) ──
function syncVolumeSliderBg(slider) {
  const pct = slider ? slider.value : 80;
  if (slider) slider.style.background = `linear-gradient(to right, var(--purple) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`;
}

// ── DOM helpers ───────────────────────────────
const $  = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Element refs ──────────────────────────────
const audio          = $('audio-player');
const screenLogin    = $('screen-login');
const screenVideo    = $('screen-video');
const screenPlayer   = $('screen-player');

// Login
const loginForm      = $('login-form');
const loginUser      = $('login-user');
const loginPass      = $('login-pass');
const loginError     = $('login-error');
const loginBtn       = loginForm.querySelector('.login-btn');

// Video
const introVideo     = $('intro-video');
const videoSkipBtn   = $('video-skip-btn');
const videoLoadBar   = $('video-loading-bar');

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
const fpoPlayBtn     = $('fpo-play-btn');
const fpoPrevBtn     = $('fpo-prev-btn');
const fpoNextBtn     = $('fpo-next-btn');
const fpoShuffleBtn  = $('fpo-shuffle-btn');
const fpoRepeatBtn   = $('fpo-repeat-btn');
const volumeSlider   = $('volume-slider'); // inside FPO
const npbShuffleBtn  = $('npb-shuffle-btn');
const npbRepeatBtn   = $('npb-repeat-btn');
const npbVolume      = $('npb-volume');

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

    // ── Connection lines between close particles ──
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
//  BOOT — check session
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Always require login on every app open
  showScreen(screenLogin);
  setupAllEvents();
  const initVol = (volumeSlider.value || 80) / 100;
  audio.volume = initVol;
  npbVolume.value = volumeSlider.value || 80;
  syncVolumeSliderBg(npbVolume);
  syncVolumeSliderBg(volumeSlider);
});

function showScreen(el) {
  [screenLogin, screenVideo, screenPlayer].forEach(s => {
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
  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const u = loginUser.value.trim();
    const p = loginPass.value;
    if (u === CREDS.user && p === CREDS.pass) {
      loginError.classList.add('hidden');
      loginBtn.classList.add('loading');
      setTimeout(() => startVideoScreen(), 600);
    } else {
      loginError.classList.remove('hidden');
      loginError.textContent = 'Wrong credentials. Try again.';
      loginPass.value = '';
      loginPass.focus();
      loginBtn.classList.remove('loading');
    }
  });
}

// ══════════════════════════════════════════
//  VIDEO LOADING SCREEN
// ══════════════════════════════════════════
function startVideoScreen() {
  showScreen(screenVideo);

  // Pre-fetch songs while video plays
  loadLibrary();

  // Setup video
  introVideo.currentTime = 0;
  introVideo.volume    = 1;

  // Show skip after 3s
  let skipTimer = setTimeout(() => {
    videoSkipBtn.classList.remove('hidden');
  }, 3000);

  // Loading bar follows video progress
  introVideo.addEventListener('timeupdate', onVideoProgress);
  introVideo.addEventListener('ended', onVideoEnd);
  videoSkipBtn.addEventListener('click', skipVideo, { once: true });

  // Safari/iOS: start muted so autoplay is guaranteed, unmute immediately after
  introVideo.muted = false;
  introVideo.play()
    .then(() => {
      // Unmute succeeded — keep volume on
      introVideo.muted = false;
    })
    .catch(() => {
      // Unmuted autoplay blocked — try muted first then flip
      introVideo.muted = true;
      introVideo.play()
        .then(() => { introVideo.muted = false; })
        .catch(() => {
          // Fully blocked — show skip and fake bar
          clearTimeout(skipTimer);
          videoSkipBtn.classList.remove('hidden');
          simulateFakeLoadBar();
        });
    });

  function onVideoProgress() {
    if (introVideo.duration) {
      const pct = (introVideo.currentTime / introVideo.duration) * 100;
      videoLoadBar.style.width = pct + '%';
    }
  }

  function onVideoEnd() {
    cleanup();
    transitionToPlayer();
  }

  function skipVideo() {
    introVideo.pause();
    cleanup();
    transitionToPlayer();
  }

  function cleanup() {
    clearTimeout(skipTimer);
    introVideo.removeEventListener('timeupdate', onVideoProgress);
    introVideo.removeEventListener('ended', onVideoEnd);
    videoLoadBar.style.width = '100%';
  }

  function simulateFakeLoadBar() {
    let pct = 0;
    const ival = setInterval(() => {
      pct += 2;
      videoLoadBar.style.width = pct + '%';
      if (pct >= 100) {
        clearInterval(ival);
        setTimeout(transitionToPlayer, 400);
      }
    }, 60);
  }
}

function transitionToPlayer() {
  showPlayer();
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
  try {
    const res  = await fetch('/api/songs');
    const data = await res.json();
    allSongs   = data.songs || [];
    buildPills();
    applyFilter();
  } catch (err) {
    console.error('Library load error:', err);
    songList.innerHTML = `<div class="no-songs"><strong>Could not load library</strong>Make sure Flask is running and music files are placed in<br><em>Leakify-music-src/</em></div>`;
  }
}

function buildPills() {
  const artists = [...new Set(allSongs.map(s => s.artist))].sort();
  // Remove old dynamic pills
  pillsInner.querySelectorAll('.pill:not([data-artist="all"])').forEach(p => p.remove());
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
    const matchArtist = artistFilter === 'all' || s.artist === artistFilter;
    const matchSearch = !searchTerm || s.display.toLowerCase().includes(searchTerm) || s.artist.toLowerCase().includes(searchTerm);
    return matchArtist && matchSearch;
  });

  renderSongs();
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════
function renderSongs() {
  trackCount.textContent = `${filteredSongs.length} song${filteredSongs.length !== 1 ? 's' : ''}`;

  if (filteredSongs.length === 0) {
    songList.innerHTML = `<div class="no-songs"><strong>No songs found</strong>Add MP3 files to Leakify-music-src/ and refresh.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredSongs.forEach((song, idx) => {
    const card = document.createElement('div');
    card.className = 'track-card';
    if (idx === currentIndex) card.classList.add('active');

    const delay = Math.min(idx * 0.03, 0.5);
    card.style.animationDelay = `${delay}s`;

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
      <button class="track-card-action" title="Play">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
    `;

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
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════
//  PLAYBACK
// ══════════════════════════════════════════
function playSong(idx) {
  if (idx < 0 || idx >= filteredSongs.length) return;
  currentIndex = idx;
  const song = filteredSongs[idx];

  audio.src = song.url || `/play/${encodeURIComponent(song.filename)}`;
  audio.load();
  audio.play()
    .then(() => {
      isPlaying = true;
      onPlayStart(song);
    })
    .catch(err => {
      console.error('Playback error:', err);
    });
}

function onPlayStart(song) {
  // Hero
  heroTrackName.textContent  = song.display;
  heroArtistName.textContent = song.artist;
  heroArt.classList.add('playing');
  heroGlow.classList.add('active');
  heroEq.classList.add('active');

  // Mini bar
  npbTitle.textContent  = song.display;
  npbArtist.textContent = song.artist;
  nowPlayingBar.classList.add('visible', 'playing');

  // FPO
  fpoTitle.textContent  = song.display;
  fpoArtist.textContent = song.artist;
  fpoArt.classList.add('playing');
  fpoArtGlow.classList.add('active');

  // Dynamic tint
  setArtTint(song.artist);

  updatePlayButtons(true);
  renderSongs(); // refresh active state
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
  } else {
    audio.play().then(() => {
      isPlaying = true;
      heroArt.classList.add('playing');
      heroEq.classList.add('active');
      fpoArt.classList.add('playing');
      nowPlayingBar.classList.add('playing');
      updatePlayButtons(true);
    });
  }
}

function prevSong() {
  if (!filteredSongs.length) return;
  if (shuffle) {
    currentIndex = Math.floor(Math.random() * filteredSongs.length);
  } else {
    currentIndex = (currentIndex - 1 + filteredSongs.length) % filteredSongs.length;
  }
  playSong(currentIndex);
}

function nextSong() {
  if (!filteredSongs.length) return;
  if (shuffle) {
    currentIndex = Math.floor(Math.random() * filteredSongs.length);
  } else {
    currentIndex = (currentIndex + 1) % filteredSongs.length;
  }
  playSong(currentIndex);
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
  fpoFill.style.width  = pct + '%';
  fpoThumb.style.left  = pct + '%';
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
}
function closeFPO() {
  fpoOpen = false;
  fpo.classList.remove('open');
}

// Swipe-down-to-close gesture (iOS native feel)
(function setupFPOSwipe() {
  let startY = 0, startX = 0, dragging = false, startTime = 0;

  fpo.addEventListener('touchstart', e => {
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
    npbShuffleBtn.classList.toggle('active', shuffle);
  }
  function toggleRepeat() {
    repeat = !repeat;
    fpoRepeatBtn.classList.toggle('active', repeat);
    npbRepeatBtn.classList.toggle('active', repeat);
  }
  fpoShuffleBtn.addEventListener('click', toggleShuffle);
  fpoRepeatBtn.addEventListener('click',  toggleRepeat);
  npbShuffleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleShuffle(); });
  npbRepeatBtn.addEventListener('click',  (e) => { e.stopPropagation(); toggleRepeat(); });

  // Open FPO by tapping only the top row of the mini bar
  nowPlayingBar.querySelector('.npb-row-main').addEventListener('click', openFPO);
  fpoClose.addEventListener('click', closeFPO);

  // Volume — both sliders (FPO + mini bar) stay in sync
  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
    npbVolume.value = volumeSlider.value;
    syncVolumeSliderBg(volumeSlider);
    syncVolumeSliderBg(npbVolume);
  });
  npbVolume.addEventListener('input', () => {
    audio.volume = npbVolume.value / 100;
    volumeSlider.value = npbVolume.value;
    syncVolumeSliderBg(npbVolume);
    syncVolumeSliderBg(volumeSlider);
  });

  // Audio events
  audio.addEventListener('timeupdate', updateProgress);
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

  // Progress bar seek
  fpoProgressBar.addEventListener('mousedown', (e) => { isSeeking = true; seekAt(e); });
  fpoProgressBar.addEventListener('touchstart', (e) => { isSeeking = true; seekAt(e); }, { passive: true });
  window.addEventListener('mousemove', (e) => { if (isSeeking) seekAt(e); });
  window.addEventListener('touchmove', (e) => { if (isSeeking) seekAt(e); }, { passive: true });
  window.addEventListener('mouseup',  () => { isSeeking = false; });
  window.addEventListener('touchend', () => { isSeeking = false; });

  // Search toggle
  searchToggle.addEventListener('click', () => {
    searchBarWrap.classList.toggle('open');
    if (searchBarWrap.classList.contains('open')) {
      setTimeout(() => searchInput.focus(), 350);
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
    showUpdateToast('Aktualizuji…', false);
    try {
      if (swRegistration) await swRegistration.update();
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      showUpdateToast('Hotovo! Načítám novou verzi…', false);
      setTimeout(() => location.reload(true), 900);
    } catch {
      showUpdateToast('Chyba aktualizace', true);
      updateBtn.disabled = false;
    }
  });

  // Keyboard shortcuts (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space')       { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight')  { e.preventDefault(); nextSong(); }
    if (e.code === 'ArrowLeft')   { e.preventDefault(); prevSong(); }
    if (e.code === 'Escape' && fpoOpen) closeFPO();
  });

  // iOS: prevent bounce scroll on body
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.player-content') && !e.target.closest('.fpo-content') && !e.target.closest('.pills-inner')) {
      e.preventDefault();
    }
  }, { passive: false });
}
