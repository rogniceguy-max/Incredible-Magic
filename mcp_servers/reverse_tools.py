"""
Incredible-Magic Model Context Protocol (MCP) Server
Module: reverse_tools.py
Exposes the Core 8 and Extended Reverse Engineering tools via standard MCP JSON-RPC protocol.
"""

import sys
import json
from engine.tool_registry import tool_registry


def handle_list_tools():
    schemas = tool_registry.get_all_schemas(core_only=False)
    mcp_tools = []
    for s in schemas:
        mcp_tools.append({
            "name": s["name"],
            "description": s["description"],
            "inputSchema": s["parameters"]
        })
    return {"tools": mcp_tools}


def handle_call_tool(name: str, arguments: dict):
    tool = tool_registry.get_tool(name)
    if not tool:
        return {"isError": True, "content": [{"type": "text", "text": f"Tool '{name}' not found"}]}
    
    try:
        res = tool.handler(**arguments)
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(res, ensure_ascii=False, indent=2)
                }
            ]
        }
    except Exception as e:
        return {"isError": True, "content": [{"type": "text", "text": f"Error executing tool: {str(e)}"}]}


def main():
    """Stdio-based MCP protocol server."""
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            req = json.loads(line)
            method = req.get("method")
            req_id = req.get("id")

            if method == "tools/list":
                result = handle_list_tools()
                resp = {"jsonrpc": "2.0", "id": req_id, "result": result}
            elif method == "tools/call":
                params = req.get("params", {})
                result = handle_call_tool(params.get("name"), params.get("arguments", {}))
                resp = {"jsonrpc": "2.0", "id": req_id, "result": result}
            else:
                resp = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": "Method not found"}}

            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stderr.write(f"MCP RPC Error: {e}\n")


if __name__ == "__main__":
    main()
