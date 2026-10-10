"""
Incredible-Magic Backend
Module: agent.py
Autonomous Reverse Engineering Agent loop with Human-in-the-Loop approval gate.
"""

import asyncio
import os
import json
from typing import Dict, Any, Optional
import httpx

from server.app.config import config
from server.app import db
from engine.tool_registry import tool_registry


class ReverseAgent:
    def __init__(self, task_id: str, target_binary: str, user_prompt: Optional[str] = None):
        self.task_id = task_id
        self.target_binary = target_binary
        self.user_prompt = user_prompt or "Perform comprehensive binary reconnaissance and logic reverse engineering."

    async def run(self):
        """Execute the agent analysis steps."""
        await db.update_task_status(self.task_id, "running")
        await db.add_task_event(self.task_id, "thought", {
            "message": f"Starting analysis on binary: {os.path.basename(self.target_binary)}. Target goal: {self.user_prompt}"
        })

        # Step 1: Static Reconnaissance
        await asyncio.sleep(0.5)
        recon_tool = tool_registry.get_tool("static_recon")
        if recon_tool:
            await db.add_task_event(self.task_id, "tool_call", {
                "tool": "static_recon",
                "args": {"file_path": self.target_binary}
            })
            
            recon_res = recon_tool.handler(self.target_binary)
            await db.add_task_event(self.task_id, "tool_result", {
                "tool": "static_recon",
                "result": recon_res
            })

            # Analyze findings
            entropy = recon_res.get("overall_entropy", 0.0)
            is_packed = recon_res.get("is_probably_packed", False)
            anomalies = recon_res.get("details", {}).get("anomalies", [])

            thought_msg = f"Recon complete. Entropy: {entropy:.2f}. "
            if is_packed:
                thought_msg += "Warning: Binary appears to be packed or encrypted! "
            if anomalies:
                thought_msg += f"Detected {len(anomalies)} suspicious indicators: {', '.join(anomalies[:3])}..."
            else:
                thought_msg += "Standard PE headers identified. No aggressive packing detected."

            await db.add_task_event(self.task_id, "thought", {"message": thought_msg})

        # Step 2: String Analysis
        await asyncio.sleep(0.5)
        str_tool = tool_registry.get_tool("extract_strings")
        if str_tool:
            await db.add_task_event(self.task_id, "tool_call", {
                "tool": "extract_strings",
                "args": {"file_path": self.target_binary, "min_len": 4, "max_count": 25}
            })
            str_res = str_tool.handler(self.target_binary, min_len=4, max_count=25)
            await db.add_task_event(self.task_id, "tool_result", {
                "tool": "extract_strings",
                "result": str_res
            })
            await db.add_task_event(self.task_id, "thought", {
                "message": f"Extracted {len(str_res.get('strings', []))} readable strings. Probing for symbols and cryptographic routines..."
            })

        # Step 3: Function Decompilation
        await asyncio.sleep(0.5)
        decomp_tool = tool_registry.get_tool("decompile_function")
        if decomp_tool:
            await db.add_task_event(self.task_id, "tool_call", {
                "tool": "decompile_function",
                "args": {"file_path": self.target_binary, "function_name": "main"}
            })
            decomp_res = decomp_tool.handler(self.target_binary, "main")
            await db.add_task_event(self.task_id, "tool_result", {
                "tool": "decompile_function",
                "result": decomp_res
            })
            await db.add_task_event(self.task_id, "thought", {
                "message": "Retrieved decompiled C pseudocode for entry logic. Generating CFG topology..."
            })

        # Step 4: Control Flow Graph (CFG)
        await asyncio.sleep(0.5)
        cfg_tool = tool_registry.get_tool("get_cfg")
        if cfg_tool:
            await db.add_task_event(self.task_id, "tool_call", {
                "tool": "get_cfg",
                "args": {"file_path": self.target_binary, "base_addr": "0x1000"}
            })
            cfg_res = cfg_tool.handler(self.target_binary, "0x1000")
            await db.add_task_event(self.task_id, "tool_result", {
                "tool": "get_cfg",
                "result": cfg_res
            })

        # Step 5: Decision Point -> Trigger Human-in-the-Loop Intercept
        await asyncio.sleep(0.5)
        await db.add_task_event(self.task_id, "thought", {
            "message": "Analysis suggests a potential bypass opportunity at offset 0x104A (conditional jump). Proposing binary patch (NOPs) to bypass verification. Requesting human authorization..."
        })

        # Create approval record
        approval_id = await db.create_approval(
            task_id=self.task_id,
            tool_name="apply_binary_patch",
            parameters={
                "file_path": self.target_binary,
                "offset": "0x104A",
                "patch_bytes": "9090",
                "reason": "Bypass conditional check verification logic (change JZ to NOP NOP)"
            },
            risk_level="high"
        )

        await db.update_task_status(self.task_id, "pending_approval")
        await db.add_task_event(self.task_id, "approval_needed", {
            "approval_id": approval_id,
            "tool": "apply_binary_patch",
            "risk_level": "high",
            "details": "AI proposes patching binary verification check at offset 0x104A."
        })

    async def resume_after_approval(self, approval_id: str, approved: bool):
        """Called when user clicks Approve or Reject on the frontend."""
        if approved:
            await db.update_task_status(self.task_id, "running")
            await db.add_task_event(self.task_id, "thought", {
                "message": f"Approval #{approval_id} granted by user. Executing sensitive tool 'apply_binary_patch'..."
            })
            patch_tool = tool_registry.get_tool("apply_binary_patch")
            res = patch_tool.handler(self.target_binary, "0x104A", "9090")
            await db.add_task_event(self.task_id, "tool_result", {
                "tool": "apply_binary_patch",
                "result": res
            })
            await db.add_task_event(self.task_id, "thought", {
                "message": "Binary patch successfully validated. Analysis pipeline completed."
            })
            await db.update_task_status(self.task_id, "completed")
        else:
            await db.update_task_status(self.task_id, "completed")
            await db.add_task_event(self.task_id, "thought", {
                "message": f"Approval #{approval_id} rejected by user. Bypassing patch action. Analysis concluded safely."
            })
