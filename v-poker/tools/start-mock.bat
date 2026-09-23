@echo off
chcp 65001 >nul
title V-POKER mock server
echo.
echo   V-POKER 本地 mock 服务
echo   HTTP  http://localhost:4000
echo   WS    ws://localhost:8003/ws
echo   关闭本窗口即停止服务
echo.

set NODE=C:\Users\88903\HBuilderX\HBuilderX\plugins\node\node.exe
if not exist "%NODE%" set NODE=node

"%NODE%" "%~dp0mock-server.mjs"
pause
