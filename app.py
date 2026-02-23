from flask import Flask, jsonify, send_from_directory, render_template
from urllib.parse import quote as urlquote
import os

# Vercel does NOT pull Git LFS objects — serve audio from GitHub's LFS CDN instead.
# Set AUDIO_BASE_URL env var to override (e.g. for a different CDN).
IS_VERCEL = bool(os.environ.get('VERCEL'))
GITHUB_LFS_BASE = os.environ.get(
    'AUDIO_BASE_URL',
    'https://media.githubusercontent.com/media/z4bryy/Leakify/main/Leakify-music-src'
)

app = Flask(__name__)

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
        for size in [192, 512]:
            path = os.path.join('static', f'icon-{size}.png')
            if not os.path.exists(path):
                img = Image.new('RGB', (size, size), color=(6, 0, 8))
                draw = ImageDraw.Draw(img)
                margin = size // 8
                draw.ellipse([margin, margin, size - margin, size - margin], fill=(191, 90, 242))
                inner = size // 3
                draw.ellipse([inner, inner, size - inner, size - inner], fill=(6, 0, 8))
                img.save(path)
    except (ImportError, OSError):
        pass

generate_icons()

@app.route('/favicon.ico')
def favicon():
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
def get_songs():
    """Get all songs from the music library with smart deduplication.
    
    For JuiceWrld (which has subfolders with overlapping content), we keep
    only the highest-priority version of each track.
    Priority: Remasters(4) > LEAKED(3) > Session Edits(2) > Extras(1) > root(0)
    """

    # Subfolder priority & tag mapping (case-insensitive key match)
    SUBFOLDER_PRIORITY = {
        'remasters':     (4, 'REMASTER'),
        'leaked':        (3, 'LEAKED'),
        'session edits': (2, 'SESSION'),
        'extras':        (1, 'EXTRA'),
    }

    raw = []
    for root_dir, dirs, files in os.walk(MUSIC_FOLDER):
        dirs.sort()  # deterministic traversal
        for file in sorted(files):
            if not file.lower().endswith('.mp3'):
                continue
            full_path = os.path.join(root_dir, file)
            rel_path  = os.path.relpath(full_path, MUSIC_FOLDER).replace("\\", "/")
            parts     = rel_path.split("/")
            artist    = parts[0] if len(parts) >= 1 else "Unsorted"

            # Subfolders are everything between artist and filename
            sub_parts = parts[1:-1]          # e.g. ["LEAKED"] or ["JuiceWrld extras"] or []
            subfolder = "/".join(sub_parts)  # "LEAKED" or ""

            display_name = os.path.splitext(file)[0]

            # Determine priority & tag
            sub_key  = sub_parts[0].strip().lower() if sub_parts else ""
            pri, tag = SUBFOLDER_PRIORITY.get(sub_key, (0, ""))

            raw.append({
                "display":   display_name,
                "filename":  rel_path,
                "artist":    artist,
                "subfolder": subfolder,
                "tag":       tag,
                "_priority": pri,
                "_norm":     display_name.strip().lower(),
            })

    # ── Deduplication (per artist) ──────────────────────────────────────
    # For each artist, keep the highest-priority version of each track.
    # Two tracks are "the same" if their normalised display name matches.
    from collections import defaultdict
    by_artist = defaultdict(list)
    for s in raw:
        by_artist[s["artist"]].append(s)

    songs = []
    for artist, tracks in by_artist.items():
        # Build a dict: norm_name → best_track
        best = {}
        for t in tracks:
            key = t["_norm"]
            if key not in best or t["_priority"] > best[key]["_priority"]:
                best[key] = t

        # Sort by display name, then strip internal fields
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

    # Final sort: artist first, then display name
    songs.sort(key=lambda s: (s["artist"].lower(), s["display"].lower()))

    return jsonify({"songs": songs, "count": len(songs)})

@app.route('/play/<path:filename>')
def play(filename):
    """Stream audio file"""
    return send_from_directory(MUSIC_FOLDER, filename)

@app.route('/video/<path:filename>')
def serve_video(filename):
    """Stream video file"""
    return send_from_directory(VIDEO_FOLDER, filename)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)