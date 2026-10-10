@echo off
chcp 65001 >nul
title Incredible-Magic (IM-Workbench) 智能逆向工作台
echo ========================================================
echo        Incredible-Magic 智能逆向工作台启动中...
echo ========================================================

cd /d "%~dp0\.."

:: 1. 启动 Python 核心逆向调度中枢 (Port 8000)
echo [*] 正在启动 Python 核心逆向调度中枢 (Port 8000)...
start "IM-Reverse-Backend" cmd /k ".\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload"

:: 2. 启动 ARTEX 纯正 Next.js 前端 (Port 3000)
echo [*] 正在启动 ARTEX 交互界面 (Port 3000)...
start "IM-ARTEX-Frontend" cmd /k "cd web && npx next dev --webpack -p 3000"

:: 等待服务就绪并打开浏览器
timeout /t 5 >nul
echo [*] 打开浏览器工作台界面...
start http://localhost:3000

echo ========================================================
echo  Incredible-Magic 工作台已就绪！
echo  - 前端界面: http://localhost:3000
echo  - 调度后端: http://localhost:8000
echo ========================================================
pause
