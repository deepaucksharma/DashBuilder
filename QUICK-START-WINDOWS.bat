@echo off
echo =====================================
echo NRDOT v2 Quick Start for Windows
echo =====================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires Administrator privileges.
    echo Please right-click and select "Run as Administrator"
    pause
    exit /b 1
)

echo [1/2] Downloading setup script...
cd %USERPROFILE%
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/deepaucksharma/DashBuilder/main/setup-nrdot-windows.ps1' -OutFile 'setup-nrdot.ps1'"

echo [2/2] Running setup...
powershell -ExecutionPolicy Bypass -File setup-nrdot.ps1

pause