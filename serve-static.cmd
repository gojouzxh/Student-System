@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js 24 is required to run the authenticated application.
    echo Install Node.js, then run npm start from this folder.
    exit /b 1
)

echo Starting the Coursework API and application on http://localhost:8080/
npm start
exit /b %errorlevel%