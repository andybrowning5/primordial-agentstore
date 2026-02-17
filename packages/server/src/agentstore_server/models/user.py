"""User model."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agentstore_server.models.base import Base, TimestampMixin, UUIDMixin


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    github_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    google_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)

    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True
    )
    stripe_connect_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True
    )

    agents = relationship("Agent", back_populates="author", lazy="selectin")

    __table_args__ = (
        Index("idx_users_username", "username"),
        Index("idx_users_github_id", "github_id"),
    )
