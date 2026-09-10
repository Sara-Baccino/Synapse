"""
synapse_gui.routers.projects
--------------------------------

CRUD for Projects: the pre-workspace "All Projects" landing page groups a
user's datasets and matching runs under a named, resumable workspace.
This router only owns the Project record itself (list/create/rename/
delete). Tagging a dataset/job as belonging to a project (project_store.
add_dataset/add_job) is wired from datasets.py/matching.py in Block B,
not here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from synapse_gui.routers.auth import CurrentUserResponse, get_current_user
from synapse_gui.services.project_store import ProjectNotFoundError, ProjectRecord, project_store

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectDTO(BaseModel):
    project_id: str
    name: str
    created_by: str
    created_at: str
    n_datasets: int
    n_jobs: int


class CreateProjectRequest(BaseModel):
    name: str


class RenameProjectRequest(BaseModel):
    name: str


def _to_dto(record: ProjectRecord) -> ProjectDTO:
    return ProjectDTO(
        project_id=record.project_id,
        name=record.name,
        created_by=record.created_by,
        created_at=record.created_at.isoformat(),
        n_datasets=len(record.dataset_ids),
        n_jobs=len(record.job_ids),
    )


@router.get("", response_model=list[ProjectDTO])
def list_projects(current_user: CurrentUserResponse = Depends(get_current_user)) -> list[ProjectDTO]:
    return [_to_dto(record) for record in project_store.list()]


@router.post("", response_model=ProjectDTO)
def create_project(
    request: CreateProjectRequest, current_user: CurrentUserResponse = Depends(get_current_user)
) -> ProjectDTO:
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name cannot be empty.")
    record = project_store.create(name=name, created_by=current_user.full_name)
    return _to_dto(record)


@router.patch("/{project_id}", response_model=ProjectDTO)
def rename_project(
    project_id: str, request: RenameProjectRequest, current_user: CurrentUserResponse = Depends(get_current_user)
) -> ProjectDTO:
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name cannot be empty.")
    try:
        record = project_store.rename(project_id, name)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_dto(record)


@router.delete("/{project_id}")
def delete_project(
    project_id: str, current_user: CurrentUserResponse = Depends(get_current_user)
) -> dict[str, str]:
    try:
        project_store.delete(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}