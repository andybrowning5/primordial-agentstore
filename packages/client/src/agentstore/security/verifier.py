"""Agent archive checksum and signature verification."""

from __future__ import annotations

import hashlib
from pathlib import Path


def compute_checksum(file_path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def verify_checksum(file_path: Path, expected: str) -> bool:
    actual = compute_checksum(file_path)
    return actual == expected
