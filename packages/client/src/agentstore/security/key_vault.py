"""Encrypted API key vault using Fernet (AES-128-CBC + HMAC-SHA256)."""

from __future__ import annotations

import base64
import os
import platform
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from pydantic import BaseModel


class KeyEntry(BaseModel):
    provider: str
    key_id: str
    encrypted_value: str
    created_at: str
    last_used: Optional[str] = None


class KeyVaultData(BaseModel):
    version: int = 1
    salt: str
    entries: list[KeyEntry] = []


class KeyVault:
    """Encrypted local storage for API keys.

    Keys are encrypted at rest using Fernet (AES-128-CBC + HMAC-SHA256).
    The master encryption key is derived from a machine-specific identifier
    combined with an optional user password using PBKDF2.
    """

    def __init__(self, vault_path: Path, password: Optional[str] = None):
        self._path = vault_path
        self._password = password or ""
        self._data: Optional[KeyVaultData] = None
        self._fernet: Optional[Fernet] = None

    def _get_machine_id(self) -> str:
        system = platform.system()
        if system == "Darwin":
            try:
                result = subprocess.run(
                    ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                for line in result.stdout.splitlines():
                    if "IOPlatformUUID" in line:
                        return line.split('"')[-2]
            except Exception:
                pass
        elif system == "Linux":
            for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"]:
                try:
                    return Path(path).read_text().strip()
                except FileNotFoundError:
                    continue
        return f"{platform.node()}-{uuid.getnode()}"

    def _derive_key(self, salt: bytes) -> bytes:
        machine_id = self._get_machine_id()
        key_material = f"{machine_id}:{self._password}".encode()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=600_000,
        )
        derived = kdf.derive(key_material)
        return base64.urlsafe_b64encode(derived)

    def _get_fernet(self) -> Fernet:
        if self._fernet is None:
            data = self._load()
            salt = base64.b64decode(data.salt)
            key = self._derive_key(salt)
            self._fernet = Fernet(key)
        return self._fernet

    def _load(self) -> KeyVaultData:
        if self._data is not None:
            return self._data
        if self._path.exists():
            raw = self._path.read_text()
            self._data = KeyVaultData.model_validate_json(raw)
        else:
            salt = os.urandom(16)
            self._data = KeyVaultData(salt=base64.b64encode(salt).decode())
            self._save()
        return self._data

    def _save(self) -> None:
        if self._data is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(self._data.model_dump_json(indent=2))
        self._path.chmod(0o600)

    def add_key(self, provider: str, api_key: str, key_id: Optional[str] = None) -> str:
        key_id = key_id or provider
        fernet = self._get_fernet()
        encrypted = fernet.encrypt(api_key.encode())

        data = self._load()
        data.entries = [
            e for e in data.entries if not (e.provider == provider and e.key_id == key_id)
        ]
        data.entries.append(
            KeyEntry(
                provider=provider,
                key_id=key_id,
                encrypted_value=base64.b64encode(encrypted).decode(),
                created_at=datetime.now(timezone.utc).isoformat(),
            )
        )
        self._save()
        return key_id

    def get_key(self, provider: str, key_id: Optional[str] = None) -> Optional[str]:
        key_id = key_id or provider
        data = self._load()
        for entry in data.entries:
            if entry.provider == provider and entry.key_id == key_id:
                try:
                    fernet = self._get_fernet()
                    encrypted = base64.b64decode(entry.encrypted_value)
                    decrypted = fernet.decrypt(encrypted)
                    entry.last_used = datetime.now(timezone.utc).isoformat()
                    self._save()
                    return decrypted.decode()
                except InvalidToken:
                    raise ValueError(
                        "Failed to decrypt key. The vault may have been created "
                        "on a different machine or with a different password."
                    )
        return None

    def remove_key(self, provider: str, key_id: Optional[str] = None) -> bool:
        key_id = key_id or provider
        data = self._load()
        original_count = len(data.entries)
        data.entries = [
            e for e in data.entries if not (e.provider == provider and e.key_id == key_id)
        ]
        if len(data.entries) < original_count:
            self._save()
            return True
        return False

    def list_keys(self) -> list[dict]:
        data = self._load()
        return [
            {
                "provider": e.provider,
                "key_id": e.key_id,
                "created_at": e.created_at,
                "last_used": e.last_used,
            }
            for e in data.entries
        ]

    def get_env_vars(self, providers: Optional[list[str]] = None) -> dict[str, str]:
        """Get API keys as environment variables for sandbox injection."""
        env_map = {
            "anthropic": "ANTHROPIC_API_KEY",
            "openai": "OPENAI_API_KEY",
            "groq": "GROQ_API_KEY",
            "google": "GOOGLE_API_KEY",
            "mistral": "MISTRAL_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
        }
        result = {}
        data = self._load()
        for entry in data.entries:
            if providers and entry.provider not in providers:
                continue
            env_var = env_map.get(entry.provider, f"{entry.provider.upper()}_API_KEY")
            key = self.get_key(entry.provider, entry.key_id)
            if key:
                result[env_var] = key
        return result
