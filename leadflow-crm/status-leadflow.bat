@echo off
REM ============================================================
REM  LeadFlow CRM — Status Check
REM ============================================================
REM
REM  Shows which services are running and tests connectivity.
REM ============================================================

setlocal
cd /d "%~dp0"
echo.
echo ===========================================
echo  LeadFlow CRM Status Check
echo ===========================================
echo.

REM Docker Desktop check
echo [Docker Desktop]
docker info >nul 2>&1
if errorlevel 1 (
    echo   STATUS: NOT RUNNING - run start-leadflow.bat to start
    goto end
)
echo   STATUS: Running
echo.

REM Container status
echo [Containers]
docker-compose ps
echo.

REM Health checks
echo [Health Checks]
echo.

curl -s -o nul -w "  Backend  (3001): HTTP %%{http_code}\n" http://localhost:3001/health 2>&1
if errorlevel 1 echo   Backend  (3001): UNREACHABLE

curl -s -o nul -w "  Frontend (5173): HTTP %%{http_code}\n" http://localhost:5173 2>&1
if errorlevel 1 echo   Frontend (5173): UNREACHABLE

echo.
echo ===========================================
echo   Open http://localhost:5173 in your browser
echo ===========================================

:end
echo.
endlocal
pause
