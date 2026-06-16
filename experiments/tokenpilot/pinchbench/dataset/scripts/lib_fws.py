"""
fws lifecycle helpers for GWS/GitHub benchmark tasks.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, Optional


logger = logging.getLogger(__name__)

MOCK_SERVICE_ENV_KEYS = [
    "GOOGLE_WORKSPACE_CLI_CONFIG_DIR",
    "GOOGLE_WORKSPACE_CLI_TOKEN",
    "HTTPS_PROXY",
    "SSL_CERT_FILE",
    "GH_TOKEN",
    "GH_REPO",
]


def is_fws_task(frontmatter: dict) -> bool:
    category = str(frontmatter.get("category") or "").strip().lower()
    if category in {"gws", "github"}:
        return True
    prerequisites = frontmatter.get("prerequisites") or []
    return any("fws" in str(item).lower() for item in prerequisites)


def _candidate_binaries(name: str) -> list[str]:
    candidates = [name]
    home = Path.home()
    candidates.append(str(home / ".local" / "bin" / name))
    return candidates


def resolve_binary(name: str) -> Optional[str]:
    for candidate in _candidate_binaries(name):
        resolved = shutil.which(candidate) if os.path.sep not in candidate else candidate
        if resolved and os.path.exists(resolved):
            return resolved
    return None


def fws_available() -> bool:
    return resolve_binary("fws") is not None


def start_fws() -> Dict[str, Optional[str]]:
    fws_bin = resolve_binary("fws")
    if not fws_bin:
        raise RuntimeError("fws binary not found in PATH or ~/.local/bin")

    os.environ.setdefault("FWS_DATA_DIR", str(Path.home() / ".fws-data"))

    logger.info("Starting fws server via %s", fws_bin)
    subprocess.run([fws_bin, "server", "stop"], capture_output=True, text=True, check=False)
    time.sleep(0.3)
    result = subprocess.run(
        [fws_bin, "server", "start"],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    original_env: Dict[str, Optional[str]] = {}
    injected = 0
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("export "):
            line = line[7:]
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key not in MOCK_SERVICE_ENV_KEYS:
            continue
        value = value.strip().strip('"').strip("'")
        original_env[key] = os.environ.get(key)
        os.environ[key] = value
        injected += 1

    if result.returncode != 0 and injected == 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or f"exit_code={result.returncode}"
        raise RuntimeError(f"fws server start failed: {detail}")
    if result.returncode != 0:
        logger.warning(
            "fws server start returned %s but emitted usable environment; continuing",
            result.returncode,
        )
    if injected == 0:
        logger.warning("fws started but no environment variables were parsed from stdout")
    return original_env


def stop_fws(original_env: Dict[str, Optional[str]] | None) -> None:
    fws_bin = resolve_binary("fws")
    if fws_bin:
        subprocess.run([fws_bin, "server", "stop"], capture_output=True, text=True, check=False)
    if not original_env:
        return
    for key, value in original_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
