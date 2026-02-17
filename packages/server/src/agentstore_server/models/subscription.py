"""Subscription and payout models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from agentstore_server.models.base import Base, TimestampMixin, UUIDMixin


class Subscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True
    )
    plan: Mapped[str] = mapped_column(String(20), default="free", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    current_period_start: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PayoutPeriod(Base, UUIDMixin):
    __tablename__ = "payout_periods"

    period: Mapped[str] = mapped_column(String(7), unique=True, nullable=False)
    total_revenue: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    platform_share: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    creator_pool: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    total_runs: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="calculating", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class CreatorPayout(Base, UUIDMixin):
    __tablename__ = "creator_payouts"

    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payout_periods.id"), nullable=False
    )
    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )

    run_count: Mapped[int] = mapped_column(BigInteger, nullable=False)
    share_percent: Mapped[float] = mapped_column(Numeric(8, 6), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    stripe_transfer_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_payouts_creator", "creator_id"),
        Index("idx_payouts_period", "period_id"),
    )
