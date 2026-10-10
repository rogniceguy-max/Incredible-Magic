"""
Incredible-Magic Backend
Module: config.py
Global configuration for LLM endpoints, database, and engine paths.
"""

import os
from pydantic import BaseModel


class AppConfig(BaseModel):
    # LLM Settings
    llm_provider: str = os.environ.get("IM_LLM_PROVIDER", "deepseek")  # deepseek, openai, claude, ollama
    llm_api_key: str = os.environ.get("IM_LLM_API_KEY", "")
    llm_base_url: str = os.environ.get("IM_LLM_BASE_URL", "https://api.deepseek.com/v1")
    llm_model: str = os.environ.get("IM_LLM_MODEL", "deepseek-chat")
    
    # Engine Settings
    ghidra_home: str = os.environ.get("GHIDRA_HOME", "")
    data_dir: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
    db_path: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "im_workbench.db"))


config = AppConfig()
os.makedirs(config.data_dir, exist_ok=True)
