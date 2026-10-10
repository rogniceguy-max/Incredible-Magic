"""
Incredible-Magic Reverse Engineering Engine
Module: cfg_builder.py
Control Flow Graph (CFG) generator for basic blocks and branch topology.
Outputs React Flow / Cytoscape compatible graph data.
"""

from typing import Dict, Any, List, Optional
try:
    import capstone
except ImportError:
    capstone = None


class BasicBlock:
    def __init__(self, start_addr: int):
        self.start_addr = start_addr
        self.end_addr = start_addr
        self.instructions: List[Dict[str, Any]] = []
        self.successors: List[int] = []
        self.branch_type: str = "fallthrough"  # fallthrough, unconditional, conditional, return, call


def build_cfg_from_bytes(code_bytes: bytes, base_addr: int = 0x1000, arch: str = "x86_64") -> Dict[str, Any]:
    """
    Disassemble machine code and partition into basic blocks to build CFG.
    Compatible with React Flow graph specification.
    """
    if capstone is None:
        # Fallback dummy representation if capstone is not yet ready
        return {
            "nodes": [
                {
                    "id": "node_entry",
                    "data": {
                        "label": "sub_entry",
                        "address": hex(base_addr),
                        "instructions": ["push rbp", "mov rbp, rsp", "sub rsp, 0x20"]
                    },
                    "position": {"x": 250, "y": 50}
                }
            ],
            "edges": []
        }

    # Setup Capstone Disassembler
    if arch == "x86_64":
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
    elif arch == "x86":
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    elif arch == "arm":
        md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_ARM)
    else:
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)

    md.detail = True

    # Disassemble all instructions
    instructions = list(md.disasm(code_bytes, base_addr))
    if not instructions:
        return {"nodes": [], "edges": []}

    # Identify leaders (block starting addresses)
    leaders = {base_addr}
    branch_groups = {capstone.x86.X86_GRP_JUMP}

    for i, insn in enumerate(instructions):
        is_jump = False
        is_call = False
        is_ret = (insn.mnemonic in ("ret", "retn"))

        if hasattr(insn, 'groups'):
            for g in insn.groups:
                if g == capstone.x86.X86_GRP_JUMP:
                    is_jump = True
                elif g == capstone.x86.X86_GRP_CALL:
                    is_call = True

        if is_jump or is_ret:
            # Target of jump is a leader
            if insn.operands and insn.operands[0].type == capstone.x86.X86_OP_IMM:
                target = insn.operands[0].imm
                leaders.add(target)
            # Next instruction after jump/ret is also a leader
            if i + 1 < len(instructions):
                leaders.add(instructions[i + 1].address)

    # Partition instructions into BasicBlocks
    sorted_leaders = sorted(list(leaders))
    blocks: Dict[int, BasicBlock] = {}
    current_block: Optional[BasicBlock] = None

    for insn in instructions:
        if insn.address in leaders:
            current_block = BasicBlock(insn.address)
            blocks[insn.address] = current_block

        if current_block:
            current_block.instructions.append({
                "address": hex(insn.address),
                "mnemonic": insn.mnemonic,
                "op_str": insn.op_str
            })
            current_block.end_addr = insn.address

    # Connect edges between blocks
    edges = []
    nodes = []

    level_y = 50
    for idx, (b_addr, block) in enumerate(blocks.items()):
        last_insn = block.instructions[-1] if block.instructions else None
        
        # Format block node for React Flow
        nodes.append({
            "id": f"bb_{hex(b_addr)}",
            "type": "basicBlockNode",
            "data": {
                "label": f"loc_{hex(b_addr)[2:].upper()}",
                "address": hex(b_addr),
                "instructions": [f"{ins['mnemonic']} {ins['op_str']}".strip() for ins in block.instructions]
            },
            "position": {"x": 250 + (idx % 2) * 220, "y": level_y + (idx // 2) * 160}
        })

        if last_insn:
            mnemonic = last_insn["mnemonic"]
            # Handle conditional jumps
            if mnemonic.startswith("j") and mnemonic not in ("jmp",):
                # Target of conditional
                # And fallthrough to next
                next_addr = block.end_addr + 1
                for cand in sorted_leaders:
                    if cand > block.end_addr:
                        edges.append({
                            "id": f"e_{hex(b_addr)}_fallthrough",
                            "source": f"bb_{hex(b_addr)}",
                            "target": f"bb_{hex(cand)}",
                            "label": "false",
                            "type": "smoothstep",
                            "style": {"stroke": "#ef4444"}
                        })
                        break

    return {
        "nodes": nodes,
        "edges": edges,
        "total_blocks": len(nodes)
    }
