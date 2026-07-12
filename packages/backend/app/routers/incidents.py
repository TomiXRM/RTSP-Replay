"""事故映像保存ルータ（SPEC 22.8, 19章）。"""

from __future__ import annotations

from fastapi import APIRouter

from ..models.incidents import (
    IncidentCreateRequest,
    IncidentCreateResponse,
    IncidentExportResult,
)
from ..services.incident import save_incident

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.post("", response_model=IncidentCreateResponse, status_code=201)
async def create_incident(req: IncidentCreateRequest) -> IncidentCreateResponse:
    """事故映像保存（SPEC 22.8, FR-031〜033）。"""
    data = await save_incident(
        title=req.title,
        reason=req.reason.value,
        note=req.note,
        start=req.start,
        end=req.end,
        source_ids=req.sourceIds,
    )
    return IncidentCreateResponse(
        id=data["id"],
        title=data["title"],
        reason=req.reason,
        start=req.start,
        end=req.end,
        sourceIds=data["sourceIds"],
        dir=data["dir"],
        results=[IncidentExportResult(**r) for r in data["results"]],
    )
