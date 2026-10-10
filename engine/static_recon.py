"""
Incredible-Magic Reverse Engineering Engine
Module: static_recon.py
Static binary reconnaissance, PE/ELF parsing, entropy calculation, and string extraction.
"""

import math
import os
import re
import hashlib
from typing import Dict, Any, List, Optional

try:
    import pefile
except ImportError:
    pefile = None


def calculate_entropy(data: bytes) -> float:
    """Calculate Shannon entropy for a block of bytes (0.0 to 8.0)."""
    if not data:
        return 0.0
    entropy = 0.0
    length = len(data)
    frequencies = {}
    for b in data:
        frequencies[b] = frequencies.get(b, 0) + 1
    for count in frequencies.values():
        p = count / length
        entropy -= p * math.log2(p)
    return round(entropy, 4)


def extract_strings(data: bytes, min_length: int = 4, max_count: int = 100) -> List[Dict[str, Any]]:
    """Extract ASCII and UTF-16LE strings from binary data."""
    extracted = []
    
    # ASCII regex
    ascii_re = re.compile(rb'[\x20-\x7e]{' + str(min_length).encode() + rb',}')
    for match in ascii_re.finditer(data):
        s = match.group().decode('ascii', errors='ignore')
        extracted.append({"type": "ascii", "offset": hex(match.start()), "value": s})
        if len(extracted) >= max_count:
            return extracted

    # UTF-16LE regex
    utf16_re = re.compile(rb'(?:[\x20-\x7e]\x00){' + str(min_length).encode() + rb',}')
    for match in utf16_re.finditer(data):
        try:
            s = match.group().decode('utf-16le', errors='ignore')
            extracted.append({"type": "utf16", "offset": hex(match.start()), "value": s})
            if len(extracted) >= max_count:
                return extracted
        except Exception:
            continue

    return extracted


def analyze_pe(file_path: str, data: bytes) -> Dict[str, Any]:
    """Parse PE binary headers, sections, imports, exports, and anomalies."""
    if pefile is None:
        return {"error": "pefile library not installed"}

    try:
        pe = pefile.PE(data=data, fast_load=True)
        pe.parse_data_directories()
    except Exception as e:
        return {"error": f"Failed to parse PE: {str(e)}"}

    info = {
        "format": "PE",
        "is_64bit": pe.FILE_HEADER.Machine == 0x8664,
        "machine": hex(pe.FILE_HEADER.Machine),
        "entry_point": hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint),
        "image_base": hex(pe.OPTIONAL_HEADER.ImageBase),
        "subsystem": pe.OPTIONAL_HEADER.Subsystem,
        "sections": [],
        "imports": {},
        "exports": [],
        "anomalies": []
    }

    # Section Analysis & Entropy
    for section in pe.sections:
        sec_name = section.Name.decode('utf-8', errors='ignore').strip('\x00')
        sec_data = section.get_data()
        entropy = calculate_entropy(sec_data)
        is_packed = entropy > 7.0
        
        info["sections"].append({
            "name": sec_name,
            "virtual_address": hex(section.VirtualAddress),
            "virtual_size": hex(section.Misc_VirtualSize),
            "raw_size": section.SizeOfRawData,
            "entropy": entropy,
            "is_packed": is_packed
        })

        if is_packed:
            info["anomalies"].append(f"High entropy section '{sec_name}' ({entropy:.2f}), likely packed or encrypted.")

    # Imports
    suspicious_apis = {
        "VirtualAlloc", "VirtualProtect", "WriteProcessMemory", "CreateRemoteThread",
        "IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess",
        "OpenProcess", "SetWindowsHookEx", "InternetOpen", "HttpSendRequest"
    }

    if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            dll_name = entry.dll.decode('utf-8', errors='ignore')
            funcs = []
            for imp in entry.imports:
                if imp.name:
                    func_name = imp.name.decode('utf-8', errors='ignore')
                    funcs.append(func_name)
                    if func_name in suspicious_apis:
                        info["anomalies"].append(f"Suspicious API imported: {dll_name}!{func_name}")
                else:
                    funcs.append(f"Ordinal_{imp.ordinal}")
            info["imports"][dll_name] = funcs

    # Exports
    if hasattr(pe, 'DIRECTORY_ENTRY_EXPORT'):
        for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
            if exp.name:
                info["exports"].append(exp.name.decode('utf-8', errors='ignore'))

    return info


def analyze_binary(file_path: str) -> Dict[str, Any]:
    """Top-level binary analysis function."""
    if not os.path.isfile(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}

    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        data = f.read()

    md5 = hashlib.md5(data).hexdigest()
    sha1 = hashlib.sha1(data).hexdigest()
    sha256 = hashlib.sha256(data).hexdigest()
    overall_entropy = calculate_entropy(data)

    result = {
        "success": True,
        "file_name": os.path.basename(file_path),
        "file_size": file_size,
        "hashes": {
            "md5": md5,
            "sha1": sha1,
            "sha256": sha256
        },
        "overall_entropy": overall_entropy,
        "is_probably_packed": overall_entropy > 7.1,
        "format": "Unknown",
        "details": {}
    }

    # Format detection
    if data.startswith(b"MZ"):
        result["format"] = "PE (Windows Executable/DLL)"
        result["details"] = analyze_pe(file_path, data)
    elif data.startswith(b"\x7fELF"):
        result["format"] = "ELF (Linux Executable/Shared Object)"
        result["details"] = {"magic": "ELF", "note": "Linux ELF binary"}
    else:
        result["format"] = "Raw Binary / Data"

    # Sample strings
    result["strings_sample"] = extract_strings(data, min_length=5, max_count=50)

    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        import json
        res = analyze_binary(sys.argv[1])
        print(json.dumps(res, indent=2))
    else:
        print("Usage: python static_recon.py <binary_file>")
