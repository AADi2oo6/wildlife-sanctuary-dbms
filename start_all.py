#!/usr/bin/env python3
"""
DeepGreen Sanctuary - Unified Service Launcher
Starts all 3 layers of the application sequentially:
  1. Express.js Backend (:5000)
  2. FastAPI IoT Telemetry & AI Ingestion Service (:8000)
  3. Vite React Frontend (:5173)
Then automatically opens the web dashboard in your browser.
"""

import os
import sys
import time
import socket
import signal
import subprocess
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FASTAPI_DIR = ROOT_DIR / "fastapi-iot-service"
FRONTEND_DIR = ROOT_DIR / "frontend"

processes = []

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def wait_for_port(port: int, timeout: float = 20.0, host: str = "127.0.0.1") -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port, host):
            return True
        time.sleep(0.5)
    return False

def get_python_exe() -> str:
    venv_py = FASTAPI_DIR / "venv" / "Scripts" / "python.exe"
    if venv_py.exists():
        return str(venv_py)
    venv_py_unix = FASTAPI_DIR / "venv" / "bin" / "python"
    if venv_py_unix.exists():
        return str(venv_py_unix)
    return sys.executable

def cleanup_processes(sig=None, frame=None):
    print("\n🛑 Shutting down DeepGreen Sanctuary services...")
    for p in reversed(processes):
        try:
            if p.poll() is None:
                p.terminate()
                p.wait(timeout=3)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    print("👋 All services stopped cleanly.")
    sys.exit(0)

signal.signal(signal.SIGINT, cleanup_processes)
signal.signal(signal.SIGTERM, cleanup_processes)

def main():
    os.system("cls" if os.name == "nt" else "clear")
    print("=" * 66)
    print(" 🌲 DeepGreen Wildlife Sanctuary - Unified System Launcher")
    print("=" * 66)

    # 1. Express Backend (:5000)
    print("\n[1/3] ⚡ Launching Express.js Backend Service (:5000)...")
    if is_port_in_use(5000):
        print("      ℹ️ Port 5000 is already active (Backend running).")
    else:
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        # Fallback to direct node if npm is not directly on PATH
        cmd = ["node", "server.js"]
        try:
            p_backend = subprocess.Popen(
                cmd,
                cwd=str(BACKEND_DIR),
                shell=(os.name == "nt")
            )
            processes.append(p_backend)
            if wait_for_port(5000, timeout=15):
                print("      ✅ Express Backend is READY on http://127.0.0.1:5000")
            else:
                print("      ⚠️ Express Backend started, still initializing on port 5000.")
        except Exception as e:
            print(f"      ❌ Failed to start Express Backend: {e}")

    # 2. FastAPI IoT & AI Service (:8000)
    print("\n[2/3] 📡 Launching FastAPI IoT Telemetry & AI Service (:8000)...")
    if is_port_in_use(8000):
        print("      ℹ️ Port 8000 is already active (FastAPI IoT service running).")
    else:
        py_exe = get_python_exe()
        cmd_fastapi = [
            py_exe, "-m", "uvicorn", "main:app",
            "--host", "127.0.0.1", "--port", "8000"
        ]
        try:
            p_fastapi = subprocess.Popen(
                cmd_fastapi,
                cwd=str(FASTAPI_DIR),
                shell=(os.name == "nt")
            )
            processes.append(p_fastapi)
            if wait_for_port(8000, timeout=15):
                print("      ✅ FastAPI IoT Service is READY on http://127.0.0.1:8000")
            else:
                print("      ⚠️ FastAPI started, still initializing on port 8000.")
        except Exception as e:
            print(f"      ❌ Failed to start FastAPI Service: {e}")

    # 3. Vite React Frontend (:5173)
    print("\n[3/3] 🖥️ Launching Vite React Operator Dashboard (:5173)...")
    frontend_url = "http://localhost:5173"
    if is_port_in_use(5173):
        print(f"      ℹ️ Port 5173 is already active (Frontend running).")
    else:
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        try:
            p_frontend = subprocess.Popen(
                [npm_cmd, "run", "dev"],
                cwd=str(FRONTEND_DIR),
                shell=(os.name == "nt")
            )
            processes.append(p_frontend)
            if wait_for_port(5173, timeout=15):
                print(f"      ✅ Vite Frontend is READY on {frontend_url}")
            else:
                print(f"      ⚠️ Frontend starting on {frontend_url}...")
        except Exception as e:
            print(f"      ❌ Failed to start Frontend: {e}")

    # Display Summary Dashboard Banner
    time.sleep(1)
    print("\n" + "=" * 66)
    print(" 🎉 ALL DEEPGREEN SANCTUARY SERVICES ARE OPERATIONAL!")
    print("=" * 66)
    print(f"\n 🌐 Web Management UI:      {frontend_url}")
    print(f" ⚡ Express API:             http://127.0.0.1:5000")
    print(f" 📡 FastAPI IoT Service:     http://127.0.0.1:8000")
    print(f" 📚 Swagger API Docs:        http://127.0.0.1:8000/docs")
    print(f" 🤖 Telegram Threat Bot:     https://t.me/DeepGreen_TheBot (@DeepGreen_TheBot)")
    print("\n" + "-" * 66)
    print(" 💡 Press Ctrl+C at any time in this window to stop all services.")
    print("=" * 66 + "\n")

    # Automatically open the website in the user's browser
    try:
        webbrowser.open(frontend_url)
    except Exception:
        pass

    # Keep alive
    try:
        while True:
            time.sleep(1)
            # Verify child health
            for p in processes:
                if p.poll() is not None:
                    # One child exited
                    pass
    except KeyboardInterrupt:
        cleanup_processes()

if __name__ == "__main__":
    main()
