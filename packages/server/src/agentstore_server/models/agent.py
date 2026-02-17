"""Agent and AgentVersion models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, ForeignKey, Index, Integer,
    Numeric, String, Text, DateTime,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agentstore_server.models.base import Base, TimestampMixin, UUIDMixin


class Agent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agents"

    name: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    long_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    total_runs: Mapped[int] = mapped_column(BigInteger, default=0)
    total_stars: Mapped[int] = mapped_column(Integer, default=0)
    avg_rating: Mapped[Optional[float]] = mapped_column(Numeric(3, 2), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)

    author = relationship("User", back_populates="agents", lazy="selectin")
    versions = relationship("AgentVersion", back_populates="agent", lazy="selectin")

    __table_args__ = (
        Index("idx_agents_name", "name"),
        Index("idx_agents_author", "author_id"),
        Index("idx_agents_category", "category"),
        Index("idx_agents_status", "status"),
    )


class AgentVersion(Base, UUIDMixin):
    __tablename__ = "agent_versions"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False)

    manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)

    archive_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    platform_signature: Mapped[str] = mapped_column(Text, nullable=False)
    archive_url: Mapped[str] = mapped_column(Text, nullable=False)
    archive_size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    permission_tier: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    declared_permissions: Mapped[dict] = mapped_column(JSONB, default=list)

    review_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scan_results: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    is_latest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    agent = relationship("Agent", back_populates="versions")

    __table_args__ = (
        Index("idx_versions_agent", "agent_id"),
        Index("idx_versions_review", "review_status"),
    )
