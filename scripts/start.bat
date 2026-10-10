@echo off
chcp 65001 >nul
title Incredible-Magic (IM-Workbench) 智能逆向工作台
echo ========================================================
echo        Incredible-Magic 智能逆向工作台启动中...
echo ========================================================

cd /d "%~dp0\.."

:: 启动统一后端与静态单体服务 (Port 8000)
echo [*] 正在启动 Incredible-Magic 核心调度中枢 (Port 8000)...
start "IM-Workbench" cmd /k ".\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload"

:: 等待服务就绪并打开浏览器
timeout /t 3 >nul
echo [*] 打开浏览器工作台界面...
start http://localhost:8000

echo ========================================================
echo  工作台已就绪！
echo  - 访问地址: http://localhost:8000
echo  - API 文档: http://localhost:8000/docs
echo ========================================================
pause
