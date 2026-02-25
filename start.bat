@echo off
echo ========================================
echo   LEAKIFY — JuiceWrld Music Vault
echo ========================================
echo.
echo  1. Place MP3 files in:     Leakify-music-src\<ArtistName>\
echo  2. Open http://localhost:5000 in browser
echo  3. On iPhone: Safari -> Share -> Add to Home Screen
echo.

REM ── Credentials (change these or set them as system env vars before running) ──
if "%LOGIN_USER%"=="" set LOGIN_USER=z4bry87
if "%LOGIN_PASS%"=="" set LOGIN_PASS=MkZ8089990

REM ── Optional: generate a stable secret key so sessions survive reloads ──
if "%SECRET_KEY%"=="" set SECRET_KEY=change-me-to-a-random-secret-in-production

echo Starting server on http://0.0.0.0:5000 ...
echo.
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe app.py
) else (
    python app.py
)
pause
