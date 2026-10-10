"""
Incredible-Magic Backend Service Entrypoint
FastAPI server with REST and SSE endpoints for Task, Tool, and Approval management.
"""

import asyncio
import json
import os
import shutil
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from server.app.config import config
from server.app import db
from server.app.agent import ReverseAgent
from engine.tool_registry import tool_registry

# In-memory agent registry for active tasks
active_agents: Dict[str, ReverseAgent] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    yield


app = FastAPI(
    title="Incredible-Magic API",
    description="Clean, Modern AI Reverse Engineering & Security Analysis Workbench Backend",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Models
class CreateTaskRequest(BaseModel):
    title: str
    target_binary: str
    prompt: Optional[str] = None


class DecisionRequest(BaseModel):
    decision: str  # "approved" or "rejected"


class ConfigUpdateRequest(BaseModel):
    llm_provider: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    ghidra_home: Optional[str] = None


# --- Health & Auth Endpoints (for ARTEX WebUI) ---
@app.get("/api/health")
async def health_check():
    return {"ok": True, "service": "Incredible-Magic Reverse Workbench", "version": "2.2.0"}


@app.get("/api/auth/status")
async def auth_status():
    return {"initialized": True}


@app.post("/api/auth/login")
async def auth_login():
    return {"token": "mock-demo"}


@app.post("/api/auth/init")
async def auth_init():
    return {"token": "mock-demo"}


@app.post("/api/auth/change-password")
async def auth_change_password():
    return {"ok": True}


# --- Task Endpoints ---
@app.post("/api/tasks")
async def create_new_task(
    background_tasks: BackgroundTasks,
    title: str = Form("Binary Analysis Task"),
    prompt: Optional[str] = Form("Reverse engineer target binary"),
    file: Optional[UploadFile] = File(None),
    binary_path: Optional[str] = Form(None)
):
    upload_dir = os.path.join(config.data_dir, "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    target_path = binary_path
    if file and file.filename:
        target_path = os.path.join(upload_dir, file.filename)
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    elif not target_path:
        # Default sample binary for quick demonstration if none provided
        target_path = os.path.join(upload_dir, "sample_target.exe")
        if not os.path.exists(target_path):
            with open(target_path, "wb") as f:
                # Write minimal PE header magic
                f.write(b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00")

    task_id = await db.create_task(title=title, target_binary=target_path)
    agent = ReverseAgent(task_id=task_id, target_binary=target_path, user_prompt=prompt)
    active_agents[task_id] = agent
    
    background_tasks.add_task(agent.run)
    return {"success": True, "task_id": task_id}


@app.get("/api/tasks")
async def list_tasks():
    tasks = await db.get_tasks()
    return {"tasks": tasks}


@app.get("/api/tasks/{task_id}")
async def get_task_detail(task_id: str):
    task = await db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    events = await db.get_task_events(task_id)
    return {"task": task, "events": events}


@app.get("/api/tasks/{task_id}/events")
async def get_events(task_id: str):
    events = await db.get_task_events(task_id)
    return {"events": events}


@app.get("/api/tasks/{task_id}/events/stream")
async def stream_events(task_id: str):
    """Server-Sent Events (SSE) endpoint for real-time task log streaming."""
    async def event_generator():
        last_id = 0
        while True:
            events = await db.get_task_events(task_id)
            new_events = [e for e in events if e.get("id", 0) > last_id]
            for ev in new_events:
                last_id = max(last_id, ev.get("id", 0))
                data = json.dumps(ev)
                yield f"data: {data}\n\n"
            
            task = await db.get_task(task_id)
            if task and task.get("status") in ("completed", "failed") and not new_events:
                yield "data: [DONE]\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/tasks/{task_id}/report")
async def generate_task_report(task_id: str):
    """Generate professional Markdown reverse engineering & audit report (ARTEX style)."""
    task = await db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    events = await db.get_task_events(task_id)

    # Extract recon data
    recon_event = next((e for e in events if e.get("event_type") == "tool_result" and e.get("content", {}).get("tool") == "static_recon"), None)
    recon = recon_event.get("content", {}).get("result", {}) if recon_event else {}

    # Extract pseudocode
    decomp_event = next((e for e in events if e.get("event_type") == "tool_result" and e.get("content", {}).get("tool") == "decompile_function"), None)
    pseudocode = decomp_event.get("content", {}).get("result", {}).get("pseudocode", "N/A") if decomp_event else "N/A"

    # Extract thoughts
    thoughts = [e.get("content", {}).get("message") for e in events if e.get("event_type") == "thought"]

    # Approvals
    approvals = await db.get_pending_approvals(task_id)

    report_md = f"""# 二进制逆向工程与安全分析审计报告

**报告生成时间**：{task.get('created_at')}  
**任务 ID**：`{task_id}`  
**目标文件**：`{task.get('target_binary')}`  
**任务状态**：`{task.get('status')}`  

---

## 1. 二进制基础元数据与指纹
* **文件格式**：{recon.get('format', '未知')}
* **文件大小**：{recon.get('file_size', '未知')} 字节
* **全文件香农熵**：{recon.get('overall_entropy', 0.0)} ({'疑似加壳/高混淆' if recon.get('is_probably_packed') else '无明显高熵壳特征'})
* **MD5 哈希**：`{recon.get('hashes', {}).get('md5', 'N/A')}`
* **SHA256 哈希**：`{recon.get('hashes', {}).get('sha256', 'N/A')}`

---

## 2. 异常特征与可疑 API 发现
"""
    anomalies = recon.get("details", {}).get("anomalies", [])
    if anomalies:
        for a in anomalies:
            report_md += f"- ⚠️ **{a}**\n"
    else:
        report_md += "- 未发现已知的明显恶意 API 导入特征。\n"

    report_md += f"""
---

## 3. 关键逻辑反编译与分析结论 (Ghidra AST)
```c
{pseudocode}
```

---

## 4. AI 逆向推理与探索轨迹 (Audit Trail)
"""
    for idx, t in enumerate(thoughts, 1):
        report_md += f"{idx}. {t}\n"

    report_md += """
---
*本报告由 Incredible-Magic (IM-Workbench) 自动化逆向工作台生成，供防御性安全研究与合规审计使用。*
"""
    return {"task_id": task_id, "markdown": report_md}



# --- Human-in-the-Loop Approvals ---
@app.get("/api/approvals")
async def list_approvals(task_id: Optional[str] = None):
    approvals = await db.get_pending_approvals(task_id)
    return {"approvals": approvals}


@app.post("/api/approvals/{approval_id}/decision")
async def handle_approval_decision(approval_id: str, req: DecisionRequest, background_tasks: BackgroundTasks):
    decision = req.decision.lower()
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")

    res = await db.resolve_approval(approval_id, decision)
    if not res:
        raise HTTPException(status_code=404, detail="Approval record not found")

    task_id = res["task_id"]
    agent = active_agents.get(task_id)
    if not agent:
        # Recreate agent instance if server restarted
        task = await db.get_task(task_id)
        if task:
            agent = ReverseAgent(task_id=task_id, target_binary=task["target_binary"])
            active_agents[task_id] = agent

    if agent:
        background_tasks.add_task(agent.resume_after_approval, approval_id, decision == "approved")

    return {"success": True, "approval": res}


# --- Tool Discovery ---
@app.get("/api/tools")
async def list_tools(core_only: bool = False):
    schemas = tool_registry.get_all_schemas(core_only=core_only)
    return {"tools": schemas, "total": len(schemas)}


# --- Configuration ---
@app.get("/api/config")
async def get_configuration():
    return {
        "llm_provider": config.llm_provider,
        "llm_base_url": config.llm_base_url,
        "llm_model": config.llm_model,
        "has_api_key": bool(config.llm_api_key),
        "ghidra_home": config.ghidra_home,
        "data_dir": config.data_dir
    }


@app.post("/api/config")
async def update_configuration(req: ConfigUpdateRequest):
    if req.llm_provider is not None:
        config.llm_provider = req.llm_provider
    if req.llm_api_key is not None:
        config.llm_api_key = req.llm_api_key
    if req.llm_base_url is not None:
        config.llm_base_url = req.llm_base_url
    if req.llm_model is not None:
        config.llm_model = req.llm_model
    if req.ghidra_home is not None:
        config.ghidra_home = req.ghidra_home
    return {"success": True, "message": "Configuration updated successfully."}


# Mount built frontend static files if available
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web", "dist"))
if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(dist_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)

