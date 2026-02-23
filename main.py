import os
import random
import threading
import time
import math

import customtkinter as ctk
import pygame
from mutagen.mp3 import MP3

# Set appearance
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")

# Palette - Very dark colors to show background through
BG_PRIMARY = "#050608"
BG_CARD = "#08090c"
BG_SIDEBAR = "#060709"
ACCENT = "#5ef0ff"
ACCENT_DARK = "#2bbdd3"
TEXT_PRIMARY = "#e6f0ff"
TEXT_MUTED = "#9fb2c3"
RADIUS = 14
CARD_PAD = 25

ARTIST_FOLDERS = [
    "JuiceWrld",
    "Destroy Lonely",
    "EsdeeKid",
    "Ken Carson",
    "D4vd",
]

class Leakify(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Leakify")
        self.geometry("980x660")
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        
        # Set window transparency to show more background
        self.attributes('-alpha', 0.97)

        # Initialize pygame mixer
        pygame.mixer.init()

        # Setup animated background
        self.animation_frame = 0
        self.bg_canvas = ctk.CTkCanvas(
            self,
            bg=BG_PRIMARY,
            highlightthickness=0,
            width=980,
            height=660,
        )
        self.bg_canvas.place(x=0, y=0, relwidth=1, relheight=1)
        self.animate_background()

        self.music_folder = os.path.join(os.getcwd(), "Leakify-music-src")
        if not os.path.exists(self.music_folder):
            os.makedirs(self.music_folder)
        for artist in ARTIST_FOLDERS:
            artist_dir = os.path.join(self.music_folder, artist)
            if not os.path.exists(artist_dir):
                os.makedirs(artist_dir)

        self.songs = []  # list of dicts: {"display": str, "path": str}
        self.all_songs = []
        self.current_index = -1
        self.current_path = None
        self.is_playing = False
        self.is_paused = False
        self.shuffle = False
        self.repeat = False
        self.end_reached = False
        self.song_buttons = []

        # Left Sidebar
        sidebar = ctk.CTkFrame(self, width=260, fg_color=BG_SIDEBAR, border_color="#1f2530", border_width=2, corner_radius=RADIUS)
        sidebar.pack(side="left", fill="y", padx=8, pady=8)

        # Logo section with icon
        logo_frame = ctk.CTkFrame(sidebar, fg_color="#0d1219", corner_radius=RADIUS)
        logo_frame.pack(pady=(20, 10), padx=12, fill="x")
        logo = ctk.CTkLabel(logo_frame, text="🎵 Leakify", font=("Segoe UI", 32, "bold"), text_color=ACCENT)
        logo.pack(pady=12)
        subtitle = ctk.CTkLabel(sidebar, text="Your Offline Music Vault", font=("Segoe UI", 11, "italic"), text_color=TEXT_MUTED)
        subtitle.pack(pady=(0, 18))

        self.count_label = ctk.CTkLabel(sidebar, text="0 tracks loaded", font=("Segoe UI", 13, "bold"), text_color=ACCENT)
        self.count_label.pack(pady=(0, 10))

        refresh_btn = self.make_button(sidebar, "↻ Refresh Library", self.refresh_library, fill=True, accent=True)
        refresh_btn.pack(pady=(0, 18), padx=14, fill="x")

        # Artists section with better styling
        artist_box = ctk.CTkFrame(sidebar, fg_color="#0d1219", corner_radius=RADIUS)
        artist_box.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        ctk.CTkLabel(artist_box, text="ARTISTS", font=("Segoe UI", 12, "bold"), text_color=ACCENT).pack(anchor="w", padx=12, pady=(12, 8))
        
        artist_scroll = ctk.CTkScrollableFrame(artist_box, fg_color="#0d1219", corner_radius=8)
        artist_scroll.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        
        for artist in ARTIST_FOLDERS:
            btn = self.make_button(artist_scroll, f"🎧 {artist}", lambda name=artist: self.set_artist_filter(name), fill=True)
            btn.pack(fill="x", pady=4)

        # Main Area
        main_frame = ctk.CTkFrame(self, fg_color=BG_PRIMARY, corner_radius=RADIUS)
        main_frame.pack(side="right", fill="both", expand=True, padx=8, pady=8)

        # Header / now playing
        header = ctk.CTkFrame(main_frame, fg_color=BG_CARD, corner_radius=RADIUS, border_width=2, border_color="#2bbdd3")
        header.pack(fill="x", padx=CARD_PAD, pady=(CARD_PAD, 12))

        header_content = ctk.CTkFrame(header, fg_color=BG_CARD)
        header_content.pack(fill="x", padx=18, pady=14)

        self.now_playing = ctk.CTkLabel(header_content, text="♪ No Track Playing", font=("Segoe UI", 18, "bold"), text_color=ACCENT)
        self.now_playing.pack(anchor="w", pady=(0, 4))
        self.header_hint = ctk.CTkLabel(header_content, text="Add .mp3 files to artist folders and refresh your library", font=("Segoe UI", 11), text_color=TEXT_MUTED)
        self.header_hint.pack(anchor="w")

        # Song list card - takes most space
        list_card = ctk.CTkFrame(main_frame, fg_color=BG_CARD, corner_radius=RADIUS, border_width=2, border_color="#1a4a5e")
        list_card.pack(fill="both", expand=True, padx=CARD_PAD, pady=(0, 12))

        # Filters at top of list
        filter_header = ctk.CTkFrame(list_card, fg_color="#0d1219", corner_radius=RADIUS)
        filter_header.pack(fill="x", padx=14, pady=(14, 10))

        list_title = ctk.CTkLabel(filter_header, text="LIBRARY", font=("Segoe UI", 13, "bold"), text_color=ACCENT)
        list_title.pack(side="left", padx=12, pady=10)

        self.artist_var = ctk.StringVar(value="All")
        self.artist_dropdown = ctk.CTkOptionMenu(
            filter_header, 
            variable=self.artist_var, 
            values=["All"], 
            command=lambda _val: self.apply_filters(), 
            fg_color="#1a2a3a", 
            button_color="#2bbdd3", 
            button_hover_color="#5ef0ff", 
            text_color=TEXT_PRIMARY,
            dropdown_fg_color="#1a2a3a"
        )
        self.artist_dropdown.pack(side="right", padx=12)

        self.search_var = ctk.StringVar()
        search_entry = ctk.CTkEntry(
            filter_header, 
            textvariable=self.search_var, 
            placeholder_text="🔍 Search songs...", 
            fg_color="#1f2530", 
            text_color=TEXT_PRIMARY, 
            placeholder_text_color=TEXT_MUTED, 
            border_color="#2bbdd3",
            border_width=2,
            corner_radius=10,
            height=35
        )
        search_entry.pack(side="right", padx=(0, 10), fill="x", expand=True)
        search_entry.bind("<KeyRelease>", lambda _event: self.apply_filters())

        self.song_list = ctk.CTkScrollableFrame(list_card, fg_color=BG_CARD, corner_radius=10)
        self.song_list.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        # Controls at bottom - music player style
        controls_card = ctk.CTkFrame(main_frame, fg_color=BG_CARD, corner_radius=RADIUS, border_width=2, border_color="#2bbdd3")
        controls_card.pack(fill="x", padx=CARD_PAD, pady=(0, CARD_PAD))

        # Progress bar section
        progress_section = ctk.CTkFrame(controls_card, fg_color=BG_CARD)
        progress_section.pack(fill="x", padx=16, pady=(12, 8))

        self.elapsed_label = ctk.CTkLabel(progress_section, text="0:00", text_color=TEXT_PRIMARY, font=("Segoe UI", 11, "bold"))
        self.elapsed_label.pack(side="left", padx=(0, 10))

        self.progress_bar = ctk.CTkProgressBar(progress_section, height=8, fg_color="#1f2530", progress_color=ACCENT, corner_radius=4)
        self.progress_bar.set(0)
        self.progress_bar.pack(side="left", fill="x", expand=True, padx=6)

        self.duration_label = ctk.CTkLabel(progress_section, text="0:00", text_color=TEXT_PRIMARY, font=("Segoe UI", 11, "bold"))
        self.duration_label.pack(side="left", padx=(10, 0))

        # Main controls
        controls_frame = ctk.CTkFrame(controls_card, fg_color=BG_CARD)
        controls_frame.pack(pady=(8, 12))

        control_buttons = ctk.CTkFrame(controls_frame, fg_color=BG_CARD)
        control_buttons.pack()

        prev_btn = self.make_button(control_buttons, "⏮", self.previous_song)
        prev_btn.grid(row=0, column=0, padx=4, pady=4)

        play_btn = self.make_button(control_buttons, "▶ PLAY", self.play_song, accent=True)
        play_btn.configure(width=150)
        play_btn.grid(row=0, column=1, padx=8, pady=4)

        next_btn = self.make_button(control_buttons, "⏭", self.next_song)
        next_btn.grid(row=0, column=2, padx=4, pady=4)

        # Secondary controls row
        secondary_controls = ctk.CTkFrame(controls_frame, fg_color=BG_CARD)
        secondary_controls.pack(pady=(8, 0))

        pause_btn = self.make_button(secondary_controls, "⏸ Pause", self.pause_song)
        pause_btn.grid(row=0, column=0, padx=4, pady=4)

        resume_btn = self.make_button(secondary_controls, "⏯ Resume", self.resume_song)
        resume_btn.grid(row=0, column=1, padx=4, pady=4)

        stop_btn = self.make_button(secondary_controls, "⏹ Stop", self.stop_song)
        stop_btn.grid(row=0, column=2, padx=4, pady=4)

        # Options
        options_frame = ctk.CTkFrame(controls_card, fg_color="#0d1219", corner_radius=RADIUS)
        options_frame.pack(fill="x", padx=16, pady=(8, 12))

        self.shuffle_switch = ctk.CTkSwitch(options_frame, text="🔀 Shuffle", command=self.toggle_shuffle, fg_color="#1f2530", progress_color=ACCENT, text_color=TEXT_PRIMARY, font=("Segoe UI", 11, "bold"))
        self.shuffle_switch.pack(side="left", padx=12, pady=8)

        self.repeat_switch = ctk.CTkSwitch(options_frame, text="🔁 Repeat", command=self.toggle_repeat, fg_color="#1f2530", progress_color=ACCENT, text_color=TEXT_PRIMARY, font=("Segoe UI", 11, "bold"))
        self.repeat_switch.pack(side="left", padx=12, pady=8)

        # Volume control
        vol_frame = ctk.CTkFrame(options_frame, fg_color="#0d1219")
        vol_frame.pack(side="right", padx=12, pady=8)
        ctk.CTkLabel(vol_frame, text="🔊 Volume:", text_color=TEXT_PRIMARY, font=("Segoe UI", 11, "bold")).pack(side="left", padx=(0, 8))
        self.volume_slider = ctk.CTkSlider(vol_frame, from_=0, to=100, command=self.set_volume, width=150, fg_color="#1f2530", button_color=ACCENT, button_hover_color=ACCENT_DARK, progress_color=ACCENT)
        self.volume_slider.set(60)
        self.volume_slider.pack(side="left")

        self.song_length = 0
        self.update_progress = False
        self.progress_thread = None

        self.refresh_library()

    def refresh_library(self):
        self.all_songs = []
        artists_found = set()
        for root, _dirs, files in os.walk(self.music_folder):
            for f in files:
                if f.lower().endswith('.mp3'):
                    full_path = os.path.join(root, f)
                    rel = os.path.relpath(full_path, self.music_folder).replace("\\", "/")
                    artist = rel.split("/", 1)[0] if "/" in rel else "Unsorted"
                    artists_found.add(artist)
                    # Clean display name: just filename without extension
                    display_name = os.path.splitext(f)[0]
                    self.all_songs.append({"display": display_name, "path": full_path, "artist": artist})

        artists_sorted = sorted(artists_found) if artists_found else ["Unsorted"]
        dropdown_values = ["All"] + artists_sorted
        self.artist_dropdown.configure(values=dropdown_values)
        if self.artist_var.get() not in dropdown_values:
            self.artist_var.set("All")

        self.apply_filters()

    def select_and_play(self, idx):
        self.current_index = idx
        self.play_song()

    def play_song(self):
        if self.current_index < 0 or not self.songs:
            self.now_playing.configure(text="Now Playing: Add .mp3 files to Leakify-music-src")
            return

        song_path = self.songs[self.current_index]["path"]
        self.current_path = song_path
        try:
            audio = MP3(song_path)
            self.song_length = audio.info.length
        except Exception:
            self.song_length = 0

        try:
            pygame.mixer.music.load(song_path)
            pygame.mixer.music.play()
            pygame.mixer.music.set_volume(self.volume_slider.get() / 100)
            self.is_playing = True
            self.is_paused = False
            self.end_reached = False
            self.now_playing.configure(text=f"Now Playing: {self.songs[self.current_index]['display']}")
            self.duration_label.configure(text=self.format_time(self.song_length))

            for i, btn in enumerate(self.song_buttons):
                btn.configure(fg_color=ACCENT if i == self.current_index else BG_CARD, text_color="#000000" if i == self.current_index else TEXT_PRIMARY)

            self.restart_progress_thread()
        except pygame.error as e:
            self.now_playing.configure(text=f"Error: {self.songs[self.current_index]['display']} - Corrupt file")
            print(f"Error loading {song_path}: {e}")

    def pause_song(self):
        if self.is_playing:
            pygame.mixer.music.pause()
            self.is_paused = True

    def resume_song(self):
        if self.is_paused:
            pygame.mixer.music.unpause()
            self.is_paused = False

    def set_volume(self, val):
        pygame.mixer.music.set_volume(val / 100)

    def stop_song(self):
        pygame.mixer.music.stop()
        self.is_playing = False
        self.is_paused = False
        self.update_progress = False
        self.progress_bar.set(0)
        self.elapsed_label.configure(text="0:00")
        self.now_playing.configure(text="Now Playing: None")

    def next_song(self):
        if not self.songs:
            return
        if self.shuffle and len(self.songs) > 1:
            choices = [i for i in range(len(self.songs)) if i != self.current_index]
            self.current_index = random.choice(choices)
        else:
            self.current_index = (self.current_index + 1) % len(self.songs)
        self.play_song()

    def previous_song(self):
        if not self.songs:
            return
        if self.shuffle and len(self.songs) > 1:
            choices = [i for i in range(len(self.songs)) if i != self.current_index]
            self.current_index = random.choice(choices)
        else:
            self.current_index = (self.current_index - 1) % len(self.songs)
        self.play_song()

    def toggle_shuffle(self):
        self.shuffle = bool(self.shuffle_switch.get())

    def toggle_repeat(self):
        self.repeat = bool(self.repeat_switch.get())

    def restart_progress_thread(self):
        self.update_progress = False
        if self.progress_thread and self.progress_thread.is_alive():
            self.progress_thread.join(timeout=0.2)
        self.update_progress = True
        self.progress_thread = threading.Thread(target=self.update_progress_bar, daemon=True)
        self.progress_thread.start()

    def format_time(self, seconds):
        seconds = int(seconds)
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes}:{secs:02d}"

    def update_progress_bar(self):
        while self.update_progress:
            if self.is_playing and not self.is_paused and self.song_length > 0:
                pos = pygame.mixer.music.get_pos() / 1000  # seconds
                progress = min(pos / self.song_length, 1.0)
                self.progress_bar.set(progress)
                self.elapsed_label.configure(text=self.format_time(pos))
                if progress >= 0.995 and not self.end_reached:
                    self.end_reached = True
                    if self.repeat:
                        pygame.mixer.music.play()
                        self.end_reached = False
                    else:
                        self.next_song()
            time.sleep(0.1)

    def on_close(self):
        self.update_progress = False
        pygame.mixer.music.stop()
        self.destroy()

    def apply_filters(self):
        query = self.search_var.get().lower().strip()
        artist_filter = self.artist_var.get()
        self.songs = []
        for song in self.all_songs:
            if artist_filter != "All" and song["artist"] != artist_filter:
                continue
            if query and query not in song["display"].lower():
                continue
            self.songs.append(song)

        for widget in self.song_list.winfo_children():
            widget.destroy()
        self.song_buttons = []
        for i, song in enumerate(self.songs):
            btn = self.make_button(self.song_list, song["display"], lambda idx=i: self.select_and_play(idx), fill=True)
            btn.pack(fill="x", pady=4, padx=6)
            self.song_buttons.append(btn)

        self.count_label.configure(text=f"♪ {len(self.songs)} tracks loaded")

        if self.songs:
            if self.current_path:
                for i, song in enumerate(self.songs):
                    if song["path"] == self.current_path:
                        self.current_index = i
                        break
            if self.current_index == -1:
                self.current_index = 0
        else:
            self.current_index = -1

    def set_artist_filter(self, artist_name):
        self.artist_var.set(artist_name)
        self.apply_filters()

    def make_button(self, parent, text, command, accent=False, fill=False):
        color = ACCENT if accent else "#1a2a3a"
        hover = ACCENT_DARK if accent else "#2a3a4a"
        border_color = ACCENT if accent else "#2bbdd3"
        return ctk.CTkButton(
            parent,
            text=text,
            command=command,
            fg_color=color,
            hover_color=hover,
            text_color="#000000" if accent else TEXT_PRIMARY,
            corner_radius=RADIUS,
            width=130 if not fill else 200,
            height=40,
            border_width=2,
            border_color=border_color,
            font=("Segoe UI", 12, "bold"),
        )

    def animate_background(self):
        """Animate the background with flowing waves, aurora effects, and particles"""
        self.bg_canvas.delete("all")
        
        # Draw animated gradient waves
        width = 980
        height = 660
        wave_height = 50
        
        # Draw aurora-like effect with multiple flowing lines - MORE VISIBLE
        for layer in range(7):
            for x in range(0, width + 60, 40):
                # Create sine wave animation with multiple frequencies
                offset = math.sin((x + self.animation_frame * 2.5) * 0.04 + layer * 0.5) * wave_height
                y_pos = (height // 5) + (layer * 50) + offset
                
                # Brighter color gradient for aurora effect
                colors = ["#5ef0ff", "#2bbdd3", "#3dd9ff", "#1a8fae", "#0d6a83", "#1a4a5e", "#0a3544"]
                line_color = colors[layer % len(colors)]
                
                # Draw flowing lines - thicker and more visible
                self.bg_canvas.create_line(
                    x - 35, y_pos,
                    x + 35, y_pos - wave_height,
                    fill=line_color,
                    width=3 if layer < 3 else 2
                )
        
        # Draw animated grid pattern - brighter
        grid_spacing = 100
        for x in range(0, width + 100, grid_spacing):
            offset_x = (x + self.animation_frame * 1.5) % width
            self.bg_canvas.create_line(
                offset_x, 0,
                offset_x, height,
                fill="#1a5a6a",
                width=1
            )
        
        for y in range(0, height + 100, grid_spacing):
            offset_y = (y + self.animation_frame * 0.8) % height
            self.bg_canvas.create_line(
                0, offset_y,
                width, offset_y,
                fill="#0a4555",
                width=1
            )
        
        # Draw rotating/orbiting particles - MORE AND BRIGHTER
        for i in range(20):
            angle = (self.animation_frame * 0.02 + i * (2 * 3.14159 / 20))
            radius_orbit = 180 + 60 * math.sin(self.animation_frame * 0.01 + i)
            x = width // 2 + radius_orbit * math.cos(angle)
            y = height // 2 + radius_orbit * math.sin(angle)
            
            if -20 <= x <= width + 20 and -20 <= y <= height + 20:
                particle_radius = 4 + (i % 4) * 2
                # Glowing particles
                self.bg_canvas.create_oval(
                    x - particle_radius - 2, y - particle_radius - 2,
                    x + particle_radius + 2, y + particle_radius + 2,
                    fill="#2bbdd3",
                    outline=""
                )
                self.bg_canvas.create_oval(
                    x - particle_radius, y - particle_radius,
                    x + particle_radius, y + particle_radius,
                    fill="#5ef0ff",
                    outline="#ffffff"
                )
        
        # Draw pulsing concentric circles - BRIGHTER
        for i in range(5):
            pulse = abs(math.sin(self.animation_frame * 0.05 + i * 0.5))
            size = 60 + i * 50 + pulse * 40
            
            self.bg_canvas.create_oval(
                width // 2 - size, height // 2 - size,
                width // 2 + size, height // 2 + size,
                fill="",
                outline="#5ef0ff" if i % 2 == 0 else "#2bbdd3",
                width=2 if i < 2 else 1
            )
        
        # Draw floating trails (comet effect) - MORE VISIBLE
        for i in range(12):
            trail_x = (i * 80 + self.animation_frame * 4) % (width + 100) - 50
            trail_y = height * 0.25 + math.sin(trail_x * 0.01 + self.animation_frame * 0.02) * 70
            
            if -10 <= trail_x <= width + 10:
                # Trail glow
                for j in range(3):
                    self.bg_canvas.create_oval(
                        trail_x - (6 - j * 2), trail_y - (6 - j * 2),
                        trail_x + (6 - j * 2), trail_y + (6 - j * 2),
                        fill="#5ef0ff" if j == 0 else "#2bbdd3",
                        outline=""
                    )
        
        # Add glowing stars
        for i in range(30):
            star_x = (i * 70 + self.animation_frame * 0.5) % width
            star_y = (i * 43 + self.animation_frame * 0.3) % height
            twinkle = abs(math.sin(self.animation_frame * 0.1 + i)) * 3
            
            self.bg_canvas.create_oval(
                star_x - twinkle, star_y - twinkle,
                star_x + twinkle, star_y + twinkle,
                fill="#5ef0ff",
                outline=""
            )
        
        # Continue animation
        self.animation_frame += 1
        if self.animation_frame > 360:
            self.animation_frame = 0
        
        self.after(30, self.animate_background)

    def on_close(self):
        self.update_progress = False
        pygame.mixer.music.stop()
        self.destroy()
        self.after(30, self.animate_background)

    def on_close(self):
        self.update_progress = False
        pygame.mixer.music.stop()
        self.destroy()

if __name__ == "__main__":
    app = Leakify()
    app.mainloop()