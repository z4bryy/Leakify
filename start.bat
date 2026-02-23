@echo off
echo ========================================
echo   LEAKIFY — JuiceWrld Music Vault
echo ========================================
echo.
echo  1. Place juicewrld.mp4 in: static\videos\
echo  2. Place MP3 files in:     Leakify-music-src\<ArtistName>\
echo  3. Open http://localhost:5000 in browser
echo  4. On iPhone: Safari -> Share -> Add to Home Screen
echo.
echo Starting server on http://0.0.0.0:5000 ...
echo.
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe app.py
) else (
    python app.py
)
pause
