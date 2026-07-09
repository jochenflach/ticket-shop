@echo off
title Ticketshop Manager - Das Wilde Weib
setlocal enabledelayedexpansion
chcp 65001 > nul
cls

echo ==========================================================
echo           Ticketshop "Das Wilde Weib" - Manager
echo ==========================================================
echo.
echo  Bitte wählen Sie eine Aktion aus:
echo.
echo  [1] Live-Daten herunterladen (Internet erforderlich)
echo      - Holt alle Ticket-Buchungen aus der Supabase-Cloud.
echo.
echo  [2] Offline-Modus starten (KEIN Internet erforderlich)
echo      - Schaltet auf lokale Datenbank um und startet den Server.
echo.
echo ==========================================================
set /p choice="Ihre Auswahl (1 oder 2, dann Enter): "

if "%choice%"=="1" goto sync
if "%choice%"=="2" goto start_offline
goto invalid

:sync
cls
echo ==========================================================
echo          Lade Live-Daten aus der Cloud herunter...
echo ==========================================================
echo.
:: Set database url to Supabase postgres temporarily
powershell -Command "(GC .env) -replace 'DATABASE_URL=.*', 'DATABASE_URL=\"postgresql://postgres.acvwiwtchhptjcbgfygw:T101000685284FlAcH@aws-0-eu-west-1.pooler.supabase.com:5432/postgres\"' | Out-File -encoding utf8 .env"
node scripts/sync-from-cloud.js
echo.
echo ==========================================================
echo  Synchronisation abgeschlossen!
echo ==========================================================
echo.
pause
exit

:start_offline
cls
:: Set database url to local SQLite file
powershell -Command "(GC .env) -replace 'DATABASE_URL=.*', 'DATABASE_URL=\"file:./dev.db\"' | Out-File -encoding utf8 .env"

:: Find local WiFi/Ethernet IP address
set localip=127.0.0.1
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set tempip=%%a
    :: Remove leading space
    set localip=!tempip:~1!
)
:: Trim any trailing spaces
set localip=%localip: =%

echo ==========================================================
echo            TICKETSHOP OFFLINE SERVER GEÖFFNET
echo ==========================================================
echo.
echo  1. Stellen Sie sicher, dass Ihr Laptop im WLAN ist.
echo  2. Verbinden Sie alle Einlass-Smartphones mit dem SELBEN WLAN.
echo  3. Rufen Sie auf den Handys folgende Adresse im Browser auf:
echo.
echo     http://!localip!:3000/scan
echo.
echo  4. Das Kassen-Terminal (Seller) öffnet sich gleich...
echo.
echo  WICHTIG: Schließen Sie dieses schwarze Fenster erst nach dem Einlass!
echo ==========================================================
echo.
echo Server wird gestartet... (Das kann 5-10 Sekunden dauern)
echo.

:: Open the browser for the Seller page
start http://localhost:3000/seller

:: Run next server
npm run dev
exit

:invalid
echo.
echo Ungültige Auswahl. Bitte wählen Sie 1 oder 2.
echo.
pause
exit
