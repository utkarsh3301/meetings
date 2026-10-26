"""LLM output schemas (tech requirements section 8)."""
import re
from typing import Literal

from pydantic import BaseModel, field_validator


def _date_or_none(v):
    return v if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) else None


class Cited(BaseModel):
    text: str
    segment_ids: list[str] = []


class ActionItem(Cited):
    owner: str | None = None
    side: Literal["CLIENT", "QRYX", "UNKNOWN"] = "UNKNOWN"
    due: str | None = None

    @field_validator("side", mode="before")
    @classmethod
    def norm_side(cls, v):
        v = str(v or "").upper()
        return v if v in ("CLIENT", "QRYX") else "UNKNOWN"

    @field_validator("due", mode="before")
    @classmethod
    def norm_due(cls, v):
        return _date_or_none(v)


class Commitment(Cited):
    by: str | None = None
    due: str | None = None

    @field_validator("due", mode="before")
    @classmethod
    def norm_due(cls, v):
        return _date_or_none(v)


class MeetingAnalysis(BaseModel):
    summary: str
    decisions: list[Cited] = []
    action_items: list[ActionItem] = []
    open_questions: list[Cited] = []
    commitments: list[Commitment] = []


class ScopeChange(BaseModel):
    request: str
    why_outside_scope: str
    segment_ids: list[str] = []


class ScopeChanges(BaseModel):
    scope_changes: list[ScopeChange] = []


ANALYSIS_SCHEMA = """{
  "summary": "string, 150-300 words",
  "decisions": [{"text": "string", "segment_ids": ["string"]}],
  "action_items": [{"text": "string", "owner": "string|null", "side": "CLIENT|QRYX|UNKNOWN", "due": "YYYY-MM-DD|null", "segment_ids": ["string"]}],
  "open_questions": [{"text": "string", "segment_ids": ["string"]}],
  "commitments": [{"text": "string", "by": "string|null", "due": "YYYY-MM-DD|null", "segment_ids": ["string"]}]
}"""

SCOPE_SCHEMA = """{
  "scope_changes": [{"request": "string", "why_outside_scope": "string", "segment_ids": ["string"]}]
}"""
