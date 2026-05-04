@echo off
REM ============================================================
REM  LeadFlow CRM — Stop all containers
REM ============================================================
REM
REM  Stops all 4 containers but keeps data volumes intact.
REM  Re-run start-leadflow.bat to bring them back up.
REM ============================================================

setlocal
cd /d "%~dp0"
echo.
echo Stopping LeadFlow CRM containers...
docker-compose stop
echo.
echo All containers stopped. Data volumes preserved.
echo Run start-leadflow.bat to restart.
echo.
endlocal
pause
