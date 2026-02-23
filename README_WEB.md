# LEAKIFY — JuiceWrld Private Music Vault

A premium PWA music player with login, video intro, and full Apple Music-level UI.  
Runs on iPhone via Safari "Add to Home Screen" as a standalone app.

---

## SETUP

### 1. Install dependencies
```bash
pip install flask pillow
```

### 2. Add the intro video
Place your video file at:
```
static/videos/juicewrld.mp4
```

### 3. Add music
Drop MP3 files into artist folders:
```
Leakify-music-src/
  JuiceWrld/
  Destroy Lonely/
  EsdeeKid/
  Ken Carson/
  D4vd/
```
Sub-folders are supported (e.g. `JuiceWrld/Session Edits/`).

### 4. Start the server
```bat
start.bat
```
or:
```bash
python app.py
```
Server runs on `http://0.0.0.0:5000`

---

## INSTALL ON iPHONE

1. Open Safari on your iPhone
2. Navigate to `http://<your-computer-ip>:5000`
3. Tap the **Share** button (rectangle with arrow)
4. Tap **Add to Home Screen**
5. Tap **Add** — the app icon appears on your home screen

> Find your PC's IP: run `ipconfig` in Command Prompt, look for IPv4 address (e.g. `192.168.1.5`)

---

## LOGIN

| Field    | Value       |
|----------|-------------|
| Username | `z4bry87`   |
| Password | `MkZ808999` |

---

## FLOW

```
Login Screen  →  Video Intro (juicewrld.mp4)  →  Music Player
```

- Video plays with sound, skip button appears after 3 seconds
- Tap mini-player bar to open full player with progress + controls
- Shuffle, repeat, volume all in full player view
- Artist filter pills to browse by artist
- Search bar (tap magnifier icon in header)

---

## KEYBOARD SHORTCUTS (desktop)

| Key   | Action     |
|-------|-----------|
| Space | Play/Pause |
| →     | Next track |
| ←     | Prev track |
| Esc   | Close full player |

---


A modern, animated music player web application built with HTML, CSS, JavaScript, and Flask.

## ✨ Features

- **Modern Design**: Sleek dark theme with smooth animations
- **Animated Background**: Dynamic particle effects
- **Music Library**: Organize songs by artist folders
- **Search & Filter**: Quick search and filter by artist
- **Full Controls**: Play, pause, stop, previous, next
- **Shuffle & Repeat**: Randomize playback or loop tracks
- **Volume Control**: Adjustable volume slider
- **Progress Bar**: Visual playback progress with seeking
- **Responsive**: Works on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites

- Python 3.7+
- Flask

### Installation

1. Install dependencies:
```bash
pip install flask
```

2. Run the application:
```bash
python app.py
```

3. Open your browser and navigate to:
```
http://localhost:5000
```

## 📁 Adding Music

Add your `.mp3` files to the artist folders in `Leakify-music-src/`:
- `Leakify-music-src/JuiceWrld/`
- `Leakify-music-src/Destroy Lonely/`
- `Leakify-music-src/EsdeeKid/`
- `Leakify-music-src/Ken Carson/`
- `Leakify-music-src/D4vd/`

Then click the "Refresh Library" button in the app to reload your music library.

## 🎨 Features Breakdown

### Animated Background
- Particle system with connection lines
- Smooth animations using Canvas API

### Music Player Controls
- **Play/Pause**: Toggle playback
- **Previous/Next**: Navigate through tracks
- **Stop**: Stop playback and reset
- **Shuffle**: Random track order
- **Repeat**: Loop current track
- **Volume**: 0-100% volume control
- **Progress Bar**: Click to seek

### Library Management
- **Search**: Find songs by name
- **Filter**: Filter by artist
- **Track Count**: Shows total loaded tracks
- **Artist List**: Quick filter by artist

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Python Flask
- **Audio**: HTML5 Audio API
- **Animations**: CSS Animations + Canvas

## 🎭 Design Features

- Glassmorphism effects
- Smooth transitions and hover effects
- Pulsing glow effects
- Gradient buttons
- Custom scrollbars
- Responsive layout

## 📱 Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## 🔧 Customization

Edit the CSS variables in `static/style.css` to customize colors:

```css
:root {
    --bg-primary: #050608;
    --bg-card: #08090c;
    --bg-sidebar: #060709;
    --accent: #5ef0ff;
    --accent-dark: #2bbdd3;
    --text-primary: #e6f0ff;
    --text-muted: #9fb2c3;
}
```

## 📄 License

Free to use and modify for personal projects.

## 🎵 Enjoy Your Music!

Made with ❤️ for music lovers
