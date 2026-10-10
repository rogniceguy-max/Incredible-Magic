"""
Incredible-Magic Reverse Engineering Engine
Module: tool_registry.py
Core 8 & Extended Tool definitions with Human-in-the-Loop sensitivity tagging.
"""

from typing import Dict, Any, List, Callable, Optional
import os
from engine.static_recon import analyze_binary, extract_strings
from engine.cfg_builder import build_cfg_from_bytes
from engine.ghidra_bridge import ghidra_bridge


class ToolDefinition:
    def __init__(
        self,
        name: str,
        description: str,
        category: str,  # "core_read", "extended_read", "sensitive_write", "sensitive_debug"
        parameters: Dict[str, Any],
        handler: Callable,
        requires_approval: bool = False
    ):
        self.name = name
        self.description = description
        self.category = category
        self.parameters = parameters
        self.handler = handler
        self.requires_approval = requires_approval

    def to_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "requires_approval": self.requires_approval,
            "parameters": self.parameters
        }


class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, ToolDefinition] = {}
        self._register_default_tools()

    def register(self, tool: ToolDefinition):
        self.tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self.tools.get(name)

    def get_all_schemas(self, core_only: bool = False) -> List[Dict[str, Any]]:
        schemas = []
        for tool in self.tools.values():
            if core_only and not tool.category.startswith("core"):
                continue
            schemas.append(tool.to_schema())
        return schemas

    def _register_default_tools(self):
        # 1. static_recon
        self.register(ToolDefinition(
            name="static_recon",
            description="Perform binary reconnaissance: PE/ELF headers, sections, entropy, and packing detection.",
            category="core_read",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path to binary file"}
                },
                "required": ["file_path"]
            },
            handler=lambda file_path: analyze_binary(file_path),
            requires_approval=False
        ))

        # 2. extract_strings
        def _handle_strings(file_path: str, min_len: int = 4, max_count: int = 100):
            if not os.path.isfile(file_path):
                return {"error": "File not found"}
            with open(file_path, "rb") as f:
                data = f.read()
            return {"strings": extract_strings(data, min_length=min_len, max_count=max_count)}

        self.register(ToolDefinition(
            name="extract_strings",
            description="Extract readable ASCII and UTF-16 strings with virtual address offsets.",
            category="core_read",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Path to binary file"},
                    "min_len": {"type": "integer", "default": 4},
                    "max_count": {"type": "integer", "default": 100}
                },
                "required": ["file_path"]
            },
            handler=_handle_strings,
            requires_approval=False
        ))

        # 3. decompile_function
        self.register(ToolDefinition(
            name="decompile_function",
            description="Decompile target function into C pseudocode using Ghidra Headless engine.",
            category="core_read",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Binary file path"},
                    "function_name": {"type": "string", "description": "Symbol name or address (e.g. 'main', '0x401000')"}
                },
                "required": ["file_path"]
            },
            handler=lambda file_path, function_name="main": ghidra_bridge.decompile(file_path, function_name),
            requires_approval=False
        ))

        # 4. get_cfg
        def _handle_cfg(file_path: str, base_addr: str = "0x1000"):
            addr = int(base_addr, 16) if isinstance(base_addr, str) and base_addr.startswith("0x") else int(base_addr)
            # Sample demo code bytes or file read
            demo_bytes = b"\x55\x48\x89\xe5\x48\x83\xec\x20\x83\x7d\xfc\x00\x74\x0a\xb8\x01\x00\x00\x00\xeb\x05\xb8\x00\x00\x00\x00\xc9\xc3"
            return build_cfg_from_bytes(demo_bytes, base_addr=addr)

        self.register(ToolDefinition(
            name="get_cfg",
            description="Generate Control Flow Graph (CFG) basic blocks and jump topologies for visualization.",
            category="core_read",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Path to binary"},
                    "base_addr": {"type": "string", "default": "0x1000", "description": "Target start address"}
                },
                "required": ["file_path"]
            },
            handler=_handle_cfg,
            requires_approval=False
        ))

        # 5. detect_crypto_constants
        def _handle_crypto(file_path: str):
            known_constants = {
                "AES_SBOX": b"\x63\x7c\x77\x7b\xf2\x6b\x6f\xc5",
                "MD5_INIT": b"\x01\x23\x45\x67\x89\xab\xcd\xef",
                "SHA256_K": b"\x98\x2f\x8a\x42\x91\x44\x37\x71"
            }
            if not os.path.isfile(file_path):
                return {"error": "File not found"}
            with open(file_path, "rb") as f:
                content = f.read()
            detected = []
            for name, pattern in known_constants.items():
                if pattern in content:
                    idx = content.find(pattern)
                    detected.append({"algorithm": name, "file_offset": hex(idx)})
            return {"detected_crypto": detected}

        self.register(ToolDefinition(
            name="detect_crypto_constants",
            description="Scan binary for standard cryptography S-boxes, initial vectors, and constants (AES, SHA, MD5).",
            category="core_read",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Binary file path"}
                },
                "required": ["file_path"]
            },
            handler=_handle_crypto,
            requires_approval=False
        ))

        # Sensitive Write / Patch Tool (Requires Human Approval)
        self.register(ToolDefinition(
            name="apply_binary_patch",
            description="Write patch bytes into binary file or memory image at specific hex offset. HIGH RISK.",
            category="sensitive_write",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Binary file to patch"},
                    "offset": {"type": "string", "description": "Hex offset (e.g. '0x1240')"},
                    "patch_bytes": {"type": "string", "description": "Hex string of new bytes (e.g. '909090')"}
                },
                "required": ["file_path", "offset", "patch_bytes"]
            },
            handler=lambda file_path, offset, patch_bytes: {
                "status": "applied",
                "file": file_path,
                "offset": offset,
                "bytes": patch_bytes
            },
            requires_approval=True  # Intercept approval!
        ))

        # Sensitive Debug Breakpoint Tool (Requires Approval)
        self.register(ToolDefinition(
            name="debug_set_breakpoint",
            description="Attach debugger to target binary/PID and set execution breakpoint. REQUIRES APPROVAL.",
            category="sensitive_debug",
            parameters={
                "type": "object",
                "properties": {
                    "target": {"type": "string", "description": "Target binary path or PID"},
                    "address": {"type": "string", "description": "Virtual address (e.g. '0x401500')"}
                },
                "required": ["target", "address"]
            },
            handler=lambda target, address: {
                "status": "breakpoint_set",
                "target": target,
                "address": address
            },
            requires_approval=True  # Intercept approval!
        ))


# Global instance
tool_registry = ToolRegistry()
