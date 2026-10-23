@echo off
REM Aalaapi Sky - Windows Firewall RTMP Port Setup Launcher
title Aalaapi Sky - RTMP Firewall Setup

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-rtmp-firewall.ps1"
pause
