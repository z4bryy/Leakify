# Leakify - Web-Based Music Player

Leakify is a sleek, modern web-based music player built with Flask (Python) for the backend and HTML/CSS/JavaScript for the frontend. It allows you to play your local .mp3 files directly in your browser with a dark, Juice WRLD-inspired gothic interface featuring red and black themes.

## Features

- **Juice WRLD Theme**: Dark gothic UI with red and black gradients, inspired by Juice WRLD's aesthetic.
- **Song Library**: Automatically scans and displays .mp3 files from the `Leakify-music-src` folder.
- **Audio Playback**: Uses HTML5 audio for high-quality playback.
- **Progress Bar**: Real-time animated progress bar with glowing red effects.
- **Responsive Design**: Works on desktop and mobile devices.
- **Visualizer Placeholder**: Ready for future audio visualization features.

## How It Works

### Backend (Flask)
- **Scanning Songs**: The Flask app scans the `Leakify-music-src` folder for .mp3 files on startup.
- **API Endpoints**:
  - `/`: Serves the main HTML page.
  - `/songs`: Returns a JSON list of available songs.
  - `/play/<filename>`: Streams the audio file for playback.
- **Folder Management**: Creates the `Leakify-music-src` folder if it doesn't exist.

### Frontend (HTML/CSS/JS)
- **Song List**: Fetches the song list from the backend and displays it in a sidebar.
- **Playback**: Clicking a song updates the audio source and starts playback.
- **Styling**: Uses CSS for a modern look with gradients, shadows, and animations.
- **Icons**: Font Awesome icons for visual appeal.

## Installation & Setup

1. **Clone or Download**: Place the project files in a folder.

2. **Install Dependencies**:
   ```bash
   pip install flask
   ```

3. **Add Music**:
   - Create a folder named `Leakify-music-src` in the project directory.
   - Add your .mp3 files to this folder.

4. **Run the App**:
   ```bash
   python app.py
   ```

5. **Access**: Open your browser and go to `http://127.0.0.1:5000/`.

## Project Structure

```
Leakify/
├── app.py                 # Flask backend
├── templates/
│   └── index.html         # Frontend interface
├── Leakify-music-src/     # Folder for .mp3 files (create this)
└── README.md              # This file
```

## Usage

- **Play Songs**: Click on any song in the sidebar to start playing.
- **Controls**: Use the built-in audio controls (play, pause, volume, etc.).
- **Progress**: Watch the red progress bar fill as the song plays.

## Technologies Used

- **Backend**: Python, Flask
- **Frontend**: HTML5, CSS3, JavaScript (ES6)
- **Icons**: Font Awesome
- **Styling**: Custom CSS with gradients and animations

## Future Enhancements

- Add audio visualization (waveforms, frequency bars).
- Implement playlists and queue management.
- Add search and filtering options.
- Support for more audio formats.

## License

This project is open-source. Feel free to modify and distribute.

Enjoy your music with Leakify! 🎵