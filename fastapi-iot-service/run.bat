@echo off
echo ========================================================
echo  Starting DeepGreen FastAPI IoT Ingestion Service 🌲📡
echo ========================================================
cd /d "%~dp0"
call venv\Scripts\activate.bat
python main.py
pause
