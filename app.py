from flask import Flask, jsonify, send_from_directory, render_template, request, redirect, session
from urllib.parse import quote as urlquote
from collections import defaultdict
from functools import wraps
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

# Supabase Storage (primary audio source when env vars are set)
SUPABASE_URL    = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY    = os.environ.get('SUPABASE_SERVICE_KEY', '')
SUPABASE_BUCKET = os.environ.get('SUPABASE_BUCKET', 'JuiceWrld')
SUPABASE_SIGNED_URL_TTL = 3600  # 1 hour

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        pass  # supabase package not installed — fall back to GitHub LFS

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
    if supabase_client:

        def list_recursive(prefix=""):
            """Return flat list of (bucket_path, name) for every audio file."""
            items = supabase_client.storage.from_(SUPABASE_BUCKET).list(prefix) if prefix \
                    else supabase_client.storage.from_(SUPABASE_BUCKET).list()
            results = []
            for item in items:
                item_name = item['name']
                if item_name == '.emptyFolderPlaceholder':
                    continue
                full_path = f"{prefix}/{item_name}" if prefix else item_name
                if item.get('metadata') is None:
                    # It's a folder — recurse
                    results.extend(list_recursive(full_path))
                else:
                    ext = os.path.splitext(item_name)[1].lower()
                    if ext in AUDIO_EXTS:
                        results.append(full_path)
            return results

        all_paths = list_recursive()

        raw = []
        for path in all_paths:
            parts = path.split('/')
            if len(parts) == 1:
                # Root-level file → default artist is bucket name (all JuiceWrld)
                artist    = SUPABASE_BUCKET
                sub_parts = []
            else:
                artist    = parts[0]
                sub_parts = parts[1:-1]   # subfolders between artist and filename

            filename     = parts[-1]
            display_name = os.path.splitext(filename)[0]
            subfolder    = "/".join(sub_parts)
            sub_key      = sub_parts[0].strip().lower() if sub_parts else ""
            pri, tag     = SUBFOLDER_PRIORITY.get(sub_key, (0, "LEAKED"))

            raw.append({
                "display":   display_name,
                "filename":  path,          # bucket-relative path for signed URL
                "artist":    artist,
                "subfolder": subfolder,
                "tag":       tag,
                "_priority": pri,
                "_norm":     display_name.strip().lower(),
            })

        # Dedup per artist (keep highest-priority version of same track name)
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

        # Batch signed URLs
        paths = [s["filename"] for s in songs]
        try:
            signed = supabase_client.storage.from_(SUPABASE_BUCKET).create_signed_urls(
                paths, SUPABASE_SIGNED_URL_TTL
            )
            url_map = {}
            for item in signed:
                p = item.get("path") or item.get("path_token", "")
                u = item.get("signedURL") or item.get("signedUrl", "")
                if p:
                    url_map[p] = u
            for s in songs:
                s["url"] = url_map.get(s["filename"], "")
        except Exception:
            for s in songs:
                try:
                    res = supabase_client.storage.from_(SUPABASE_BUCKET).create_signed_url(
                        s["filename"], SUPABASE_SIGNED_URL_TTL
                    )
                    s["url"] = res.get("signedURL") or res.get("signed_url", "")
                except Exception:
                    s["url"] = ""

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