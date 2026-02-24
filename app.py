from flask import Flask, jsonify, send_from_directory, render_template, request, redirect, session
from urllib.parse import quote as urlquote
from urllib.request import urlopen, Request
from urllib.error import URLError
from collections import defaultdict
from functools import wraps
import json
import os
import hmac
import secrets

# Load .env in local dev (no python-dotenv needed)
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

# Supabase Storage — direct REST API (no SDK, works with all key formats)
SUPABASE_URL    = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY    = os.environ.get('SUPABASE_SERVICE_KEY', '')
SUPABASE_BUCKET = os.environ.get('SUPABASE_BUCKET', 'JuiceWrld')
SUPABASE_SIGNED_URL_TTL = 3600  # 1 hour

USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

def _sb_headers():
    return {
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
    }

def _sb_list(prefix=''):
    """List files/folders in bucket at given prefix via REST."""
    url = f'{SUPABASE_URL}/storage/v1/object/list/{SUPABASE_BUCKET}'
    body = json.dumps({
        'prefix': prefix,
        'limit': 1000,
        'offset': 0,
        'sortBy': {'column': 'name', 'order': 'asc'},
    }).encode()
    req = Request(url, data=body, headers=_sb_headers(), method='POST')
    with urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def _sb_list_recursive(prefix=''):
    """Recursively list all audio files; returns list of bucket-relative paths."""
    AUDIO_EXTS = {'.mp3', '.m4a', '.wav', '.flac', '.ogg'}
    items = _sb_list(prefix)
    results = []
    for item in items:
        name = item.get('name', '')
        if name == '.emptyFolderPlaceholder':
            continue
        full = f"{prefix}/{name}" if prefix else name
        if item.get('id') is None:
            # folder — recurse
            results.extend(_sb_list_recursive(full))
        else:
            ext = os.path.splitext(name)[1].lower()
            if ext in AUDIO_EXTS:
                results.append(full)
    return results

def _sb_signed_urls(paths):
    """Batch-generate signed URLs; returns dict {path: signedURL}."""
    url = f'{SUPABASE_URL}/storage/v1/object/sign/{SUPABASE_BUCKET}'
    body = json.dumps({'paths': paths, 'expiresIn': SUPABASE_SIGNED_URL_TTL}).encode()
    req = Request(url, data=body, headers=_sb_headers(), method='POST')
    with urlopen(req, timeout=20) as r:
        items = json.loads(r.read())
    result = {}
    for item in items:
        p = item.get('path', '')
        # signedURL may be relative: /storage/v1/object/sign/...?token=...
        signed = item.get('signedURL', '') or item.get('signedUrl', '')
        if signed and not signed.startswith('http'):
            signed = SUPABASE_URL + signed
        if p:
            result[p] = signed
    return result

_supabase_error = None  # populated if init-time test fails

# Vercel fallback (GitHub LFS CDN) — used only if Supabase is not configured.
IS_VERCEL = bool(os.environ.get('VERCEL'))
GITHUB_LFS_BASE = os.environ.get(
    'AUDIO_BASE_URL',
    'https://media.githubusercontent.com/media/z4bryy/Leakify/main/Leakify-music-src'
)

app = Flask(__name__)

# Secret key for session cookies. Override with a stable SECRET_KEY env var in production;
# falling back to a random key means sessions reset on every server restart (fine for dev).
app.secret_key = os.environ.get('SECRET_KEY') or secrets.token_hex(32)

# ── Auth helpers ──────────────────────────────────────────
def require_auth(f):
    """Decorator: return 401 JSON if the user is not logged in."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('authed'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapper

MUSIC_FOLDER = 'Leakify-music-src'
VIDEO_FOLDER = os.path.join('static', 'videos')

ARTIST_FOLDERS = [
    "JuiceWrld",
    "Destroy Lonely",
    "EsdeeKid",
    "Ken Carson",
    "D4vd",
]

# Create folders if they don't exist (skipped on read-only serverless filesystems)
try:
    for folder in [MUSIC_FOLDER, VIDEO_FOLDER]:
        if not os.path.exists(folder):
            os.makedirs(folder)

    for artist in ARTIST_FOLDERS:
        artist_dir = os.path.join(MUSIC_FOLDER, artist)
        if not os.path.exists(artist_dir):
            os.makedirs(artist_dir)
except OSError:
    pass

# Generate placeholder PNG icons if Pillow is available (skipped on read-only serverless)
def generate_icons():
    try:
        from PIL import Image, ImageDraw
        for size in [192, 512, 1024]:
            path = os.path.join('static', f'icon-{size}.png')
            if not os.path.exists(path):
                img = Image.new('RGB', (size, size), color=(6, 0, 8))
                draw = ImageDraw.Draw(img)
                # Full-bleed purple circle — fills entire canvas (maskable safe zone = center 80%)
                margin = size // 32  # ~3% — effectively edge-to-edge
                draw.ellipse([margin, margin, size - margin, size - margin], fill=(191, 90, 242))
                # Dark inner circle to create a ring; then draw play triangle
                ring_w = max(size // 10, 8)   # ring thickness ~10% of icon
                inner_m = margin + ring_w
                draw.ellipse([inner_m, inner_m, size - inner_m, size - inner_m], fill=(6, 0, 8))
                # Play button triangle (centered)
                cx, cy = size // 2, size // 2
                tri_r = size // 5
                pts = [
                    (cx - tri_r // 2, cy - tri_r),
                    (cx - tri_r // 2, cy + tri_r),
                    (cx + tri_r, cy),
                ]
                draw.polygon(pts, fill=(191, 90, 242))
                img.save(path)
    except (ImportError, OSError):
        pass

generate_icons()

@app.route('/api/login', methods=['POST'])
def login():
    """Server-side credential check — credentials live in env vars, never in client JS."""
    expected_user = os.environ.get('LOGIN_USER', '')
    expected_pass = os.environ.get('LOGIN_PASS', '')
    if not expected_user or not expected_pass:
        # Env vars not set — reject all logins rather than letting a blank password through
        return jsonify({'ok': False, 'error': 'Server not configured'}), 503
    data = request.get_json(silent=True) or {}
    user_ok = hmac.compare_digest(data.get('user', ''), expected_user)
    pass_ok = hmac.compare_digest(data.get('pass', ''), expected_pass)
    if user_ok and pass_ok:
        session['authed'] = True
        return jsonify({'ok': True})
    return jsonify({'ok': False}), 401


@app.route('/api/debug')
def debug_info():
    """Shows server config state for debugging — no auth needed for diagnostics."""
    import sys
    sb_ok = False
    sb_err = None
    if USE_SUPABASE:
        try:
            items = _sb_list('')
            sb_ok = True
            sb_err = f'listed {len(items)} root items'
        except Exception as e:
            sb_err = str(e)
    return jsonify({
        'use_supabase':    USE_SUPABASE,
        'supabase_ok':     sb_ok,
        'supabase_error':  sb_err,
        'supabase_url':    SUPABASE_URL[:40] + '...' if SUPABASE_URL else 'NOT SET',
        'supabase_key':    SUPABASE_KEY[:12] + '...' if SUPABASE_KEY else 'NOT SET',
        'supabase_bucket': SUPABASE_BUCKET,
        'login_user_set':  bool(os.environ.get('LOGIN_USER')),
        'login_pass_set':  bool(os.environ.get('LOGIN_PASS')),
        'secret_key_set':  bool(os.environ.get('SECRET_KEY')),
        'is_vercel':       IS_VERCEL,
        'python':          sys.version,
    })

@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static', 'icon-192.png'), 200

@app.route('/apple-touch-icon.png')
@app.route('/apple-touch-icon-precomposed.png')
def apple_touch_icon():
    return send_from_directory('static', 'icon-192.png'), 200

@app.route('/')
def index():
    return render_template('index.html')

# Serve service worker at root scope
@app.route('/sw.js')
def service_worker():
    response = send_from_directory('static', 'sw.js')
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Content-Type'] = 'application/javascript'
    return response

@app.route('/api/songs')
@require_auth
def get_songs():
    """Get all songs from the music library with smart deduplication.

    In Supabase mode: list files recursively from the bucket and generate
    1-hour signed URLs.  Artist is derived from the top-level folder in the
    bucket path; root-level files (no folder) are assigned to 'JuiceWrld'.

    In local/fallback mode: scan Leakify-music-src/ on disk (original logic).
    Priority: Remasters(4) > LEAKED(3) > Session Edits(2) > Extras(1) > root(0)
    """

    SUBFOLDER_PRIORITY = {
        'remasters':     (4, 'REMASTER'),
        'leaked':        (3, 'LEAKED'),
        'session edits': (2, 'SESSION'),
        'extras':        (1, 'EXTRA'),
    }
    AUDIO_EXTS = {'.mp3', '.m4a', '.wav', '.flac', '.ogg'}

    # ── Supabase mode ────────────────────────────────────────────────────
    if USE_SUPABASE:
        try:
            all_paths = _sb_list_recursive('')
        except Exception as e:
            all_paths = []

        raw = []
        for path in all_paths:
            parts = path.split('/')
            if len(parts) == 1:
                artist    = SUPABASE_BUCKET
                sub_parts = []
            else:
                artist    = parts[0]
                sub_parts = parts[1:-1]

            filename     = parts[-1]
            display_name = os.path.splitext(filename)[0]
            subfolder    = "/".join(sub_parts)
            sub_key      = sub_parts[0].strip().lower() if sub_parts else ""
            pri, tag     = SUBFOLDER_PRIORITY.get(sub_key, (0, "LEAKED"))

            raw.append({
                "display":   display_name,
                "filename":  path,
                "artist":    artist,
                "subfolder": subfolder,
                "tag":       tag,
                "_priority": pri,
                "_norm":     display_name.strip().lower(),
            })

        by_artist = defaultdict(list)
        for s in raw:
            by_artist[s["artist"]].append(s)

        songs = []
        for artist, tracks in by_artist.items():
            best = {}
            for t in tracks:
                key = t["_norm"]
                if key not in best or t["_priority"] > best[key]["_priority"]:
                    best[key] = t
            for t in sorted(best.values(), key=lambda x: x["display"].lower()):
                songs.append({
                    "display":   t["display"],
                    "filename":  t["filename"],
                    "artist":    t["artist"],
                    "subfolder": t["subfolder"],
                    "tag":       t["tag"],
                    "url":       "",
                })

        songs.sort(key=lambda s: (s["artist"].lower(), s["display"].lower()))

        try:
            url_map = _sb_signed_urls([s["filename"] for s in songs])
            for s in songs:
                s["url"] = url_map.get(s["filename"], "")
        except Exception:
            pass

        return jsonify({"songs": songs, "count": len(songs)})

    # ── Local / GitHub-LFS fallback ──────────────────────────────────────
    raw = []
    for root_dir, dirs, files in os.walk(MUSIC_FOLDER):
        dirs.sort()
        for file in sorted(files):
            if not file.lower().endswith('.mp3'):
                continue
            full_path = os.path.join(root_dir, file)
            rel_path  = os.path.relpath(full_path, MUSIC_FOLDER).replace("\\", "/")
            parts     = rel_path.split("/")
            artist    = parts[0] if len(parts) >= 1 else "Unsorted"
            sub_parts = parts[1:-1]
            subfolder = "/".join(sub_parts)
            display_name = os.path.splitext(file)[0]
            sub_key  = sub_parts[0].strip().lower() if sub_parts else ""
            pri, tag = SUBFOLDER_PRIORITY.get(sub_key, (0, "LEAKED"))
            raw.append({
                "display":   display_name,
                "filename":  rel_path,
                "artist":    artist,
                "subfolder": subfolder,
                "tag":       tag,
                "_priority": pri,
                "_norm":     display_name.strip().lower(),
            })

    by_artist = defaultdict(list)
    for s in raw:
        by_artist[s["artist"]].append(s)

    songs = []
    for artist, tracks in by_artist.items():
        best = {}
        for t in tracks:
            key = t["_norm"]
            if key not in best or t["_priority"] > best[key]["_priority"]:
                best[key] = t
        for t in sorted(best.values(), key=lambda x: x["display"].lower()):
            if IS_VERCEL:
                audio_url = f"{GITHUB_LFS_BASE}/{urlquote(t['filename'], safe='/')}"
            else:
                audio_url = f"/play/{urlquote(t['filename'], safe='/')}"
            songs.append({
                "display":   t["display"],
                "filename":  t["filename"],
                "artist":    t["artist"],
                "subfolder": t["subfolder"],
                "tag":       t["tag"],
                "url":       audio_url,
            })

    songs.sort(key=lambda s: (s["artist"].lower(), s["display"].lower()))
    return jsonify({"songs": songs, "count": len(songs)})

@app.route('/play/<path:filename>')
@require_auth
def play(filename):
    """Stream audio file"""
    return send_from_directory(MUSIC_FOLDER, filename)

@app.route('/video/<path:filename>')
def serve_video(filename):
    """Stream video file — redirect to GitHub raw CDN on Vercel (supports range requests),
    serve locally otherwise."""
    if IS_VERCEL:
        github_url = f"https://raw.githubusercontent.com/z4bryy/Leakify/main/static/videos/{filename}"
        return redirect(github_url, code=302)
    return send_from_directory(VIDEO_FOLDER, filename, conditional=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)