@echo off
REM ============================================================
REM  LeadFlow CRM + GTM Engine — One-Click Launcher (Windows)
REM ============================================================
REM
REM  Double-click this file to:
REM    1. Start Docker Desktop if not running
REM    2. Bring up all 4 containers (postgres, redis, backend, frontend)
REM    3. Wait until everything is healthy
REM    4. Open http://localhost:5173 in your default browser
REM
REM  Place a shortcut on your Desktop for easy access.
REM ============================================================

setlocal
cd /d "%~dp0"
echo.
echo ===========================================
echo  LeadFlow CRM Launcher
echo ===========================================
echo.

REM Step 1: Check if Docker Desktop is running
echo [1/4] Checking Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker Desktop is not running. Starting it now...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker to be ready (this can take 30-60 seconds)...

    :wait_docker
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 goto wait_docker

    echo Docker is ready.
) else (
    echo Docker Desktop is already running.
)
echo.

REM Step 2: Bring up containers
echo [2/4] Starting containers...
docker-compose up -d
echo.

REM Step 3: Wait for backend health check
echo [3/4] Waiting for backend to be ready...
:wait_backend
timeout /t 3 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo Backend is ready.
echo.

REM Step 4: Wait for frontend
echo [4/4] Waiting for frontend...
:wait_frontend
timeout /t 3 /nobreak >nul
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo Frontend is ready.
echo.

echo ===========================================
echo  LeadFlow CRM is RUNNING
echo ===========================================
echo.
echo   Frontend:  http://localhost:5173
echo   API:       http://localhost:3001/api/v1
echo.
echo   Login:     admin@demo.com / password123
echo.
echo ===========================================
echo.

REM Open the CRM in default browser
start "" http://localhost:5173

endlocal
exit /b 0
