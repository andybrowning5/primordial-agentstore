"""
Manifest trust assessment for MCP host agent security protocol.

Two trust tiers:
  AUTO              — all providers in KNOWN_PROVIDERS → sandbox starts immediately
  REQUIRES_APPROVAL — any unknown provider → host LLM asks user before spawning

URL origin validation rejects non-HTTPS URLs and manifest URLs that resolve
to private/loopback IP ranges (SSRF protection).
"""

import ipaddress
import socket
from enum import Enum
from typing import Optional


class TrustTier(Enum):
    AUTO = "auto"
    REQUIRES_APPROVAL = "requires_approval"


def assess_manifest_trust(
    manifest,
    known_providers: dict,
) -> tuple[TrustTier, list[dict]]:
    """
    Returns (TrustTier, findings).

    findings: list of dicts per flagged provider:
      {"provider": str, "domain": str, "spoofing_warning": bool, "spoofed_provider": str|None}

    Empty findings → AUTO tier.
    """
    findings = []
    for key_req in manifest.keys:
        if key_req.provider not in known_providers:
            domain = getattr(key_req, 'resolved_domain', None) or getattr(key_req, 'domain', None) or ""
            spoofed = _is_lookalike_domain(domain, known_providers)
            findings.append({
                "provider": key_req.provider,
                "domain": domain,
                "spoofing_warning": spoofed is not None,
                "spoofed_provider": spoofed,
            })
    tier = TrustTier.AUTO if not findings else TrustTier.REQUIRES_APPROVAL
    return tier, findings


def check_url_origin(url: str) -> None:
    """
    Raises ValueError if the URL is unsafe to fetch as a manifest source.

    Rules:
    - GitHub shorthand (github:, github.com/) and local paths are always allowed
    - All other URLs must be HTTPS
    - The resolved hostname must not be a private/loopback/reserved IP (SSRF protection)
    """
    if _is_github_shorthand(url) or _is_local_path(url):
        return
    if not url.startswith("https://"):
        raise ValueError(
            f"Unsafe manifest URL: {url!r} — must use HTTPS "
            f"(or github: / github.com/ shorthand)"
        )
    hostname = _extract_hostname(url)
    if not hostname:
        return
    try:
        results = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError(f"Could not resolve manifest host: {hostname!r}")
    for result in results:
        addr_str = result[4][0]
        try:
            addr = ipaddress.ip_address(addr_str)
        except ValueError:
            continue
        if (addr.is_private or addr.is_loopback or
                addr.is_link_local or addr.is_reserved or addr.is_multicast):
            raise ValueError(
                f"Unsafe manifest URL: {hostname!r} resolves to a private/reserved "
                f"IP address ({addr_str}). This URL is not allowed."
            )


def _is_lookalike_domain(domain: str, known_providers: dict) -> Optional[str]:
    """
    Returns the spoofed provider name if the domain looks like a lookalike
    of a known provider's canonical domain. Returns None otherwise.

    Detection rules:
    1. Canonical domain is a substring of the tested domain
       e.g. "api.anthropic.com.evil.com" contains "api.anthropic.com" → "anthropic"
    2. Provider name appears as a substring in the tested domain
       e.g. "anthropic.co" contains "anthropic" → "anthropic"
    """
    if not domain:
        return None
    domain_lower = domain.lower()
    for provider_name, info in known_providers.items():
        canonical = info["domain"]
        if canonical in domain_lower and domain_lower != canonical:
            return provider_name
        if provider_name in domain_lower:
            return provider_name
    return None


def _is_github_shorthand(url: str) -> bool:
    return url.startswith(("github:", "github.com/", "https://github.com/"))


def _is_local_path(url: str) -> bool:
    return "://" not in url


def _extract_hostname(url: str) -> Optional[str]:
    """Extract hostname from an HTTPS URL for DNS resolution."""
    if url.startswith("https://"):
        rest = url[8:]
        return rest.split("/")[0].split(":")[0] or None
    return None
