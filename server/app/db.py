"""
Incredible-Magic Backend
Module: db.py
Async SQLite database schema and helper functions.
"""

import aiosqlite
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from server.app.config import config


_initialized = False

async def init_db():
    """Initialize database tables idempotently."""
    global _initialized
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                target_binary TEXT NOT NULL,
                status TEXT NOT NULL, -- 'idle', 'running', 'pending_approval', 'completed', 'failed'
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS task_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                event_type TEXT NOT NULL, -- 'thought', 'tool_call', 'tool_result', 'approval_needed', 'message'
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            );
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                parameters TEXT NOT NULL,
                risk_level TEXT NOT NULL, -- 'low', 'medium', 'high'
                status TEXT NOT NULL, -- 'pending', 'approved', 'rejected'
                created_at TEXT NOT NULL,
                resolved_at TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            );
        """)
        await db.commit()
    _initialized = True


async def ensure_db():
    if not _initialized:
        await init_db()


async def create_task(title: str, target_binary: str) -> str:
    await ensure_db()
    task_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute(
            "INSERT INTO tasks (id, title, target_binary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (task_id, title, target_binary, "running", now, now)
        )
        await db.commit()
    return task_id


async def get_tasks() -> List[Dict[str, Any]]:
    await ensure_db()
    async with aiosqlite.connect(config.db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM tasks ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    await ensure_db()
    async with aiosqlite.connect(config.db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def update_task_status(task_id: str, status: str):
    await ensure_db()
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?", (status, now, task_id))
        await db.commit()


async def add_task_event(task_id: str, event_type: str, content: Any):
    await ensure_db()
    now = datetime.utcnow().isoformat()
    content_str = json.dumps(content) if not isinstance(content, str) else content
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute(
            "INSERT INTO task_events (task_id, event_type, content, created_at) VALUES (?, ?, ?, ?)",
            (task_id, event_type, content_str, now)
        )
        await db.commit()


async def get_task_events(task_id: str) -> List[Dict[str, Any]]:
    await ensure_db()
    async with aiosqlite.connect(config.db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM task_events WHERE task_id = ? ORDER BY id ASC", (task_id,)) as cursor:
            rows = await cursor.fetchall()
            events = []
            for r in rows:
                item = dict(r)
                try:
                    item["content"] = json.loads(item["content"])
                except Exception:
                    pass
                events.append(item)
            return events


async def create_approval(task_id: str, tool_name: str, parameters: Dict[str, Any], risk_level: str = "high") -> str:
    await ensure_db()
    approval_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute(
            "INSERT INTO approvals (id, task_id, tool_name, parameters, risk_level, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (approval_id, task_id, tool_name, json.dumps(parameters), risk_level, "pending", now)
        )
        await db.commit()
    return approval_id


async def get_pending_approvals(task_id: Optional[str] = None) -> List[Dict[str, Any]]:
    await ensure_db()
    async with aiosqlite.connect(config.db_path) as db:
        db.row_factory = aiosqlite.Row
        sql = "SELECT * FROM approvals WHERE status = 'pending'"
        params = ()
        if task_id:
            sql += " AND task_id = ?"
            params = (task_id,)
        sql += " ORDER BY created_at DESC"
        async with db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
            approvals = []
            for r in rows:
                item = dict(r)
                try:
                    item["parameters"] = json.loads(item["parameters"])
                except Exception:
                    pass
                approvals.append(item)
            return approvals


async def resolve_approval(approval_id: str, decision: str) -> Optional[Dict[str, Any]]:
    """decision: 'approved' or 'rejected'"""
    await ensure_db()
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(config.db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?", (decision, now, approval_id))
        await db.commit()
        async with db.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                res = dict(row)
                res["parameters"] = json.loads(res["parameters"])
                return res
            return None


async def delete_task(task_id: str) -> bool:
    await ensure_db()
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute("DELETE FROM task_events WHERE task_id = ?", (task_id,))
        await db.execute("DELETE FROM approvals WHERE task_id = ?", (task_id,))
        res = await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await db.commit()
        return res.rowcount > 0


async def delete_all_tasks() -> int:
    await ensure_db()
    async with aiosqlite.connect(config.db_path) as db:
        await db.execute("DELETE FROM task_events")
        await db.execute("DELETE FROM approvals")
        res = await db.execute("DELETE FROM tasks")
        await db.commit()
        return res.rowcount

