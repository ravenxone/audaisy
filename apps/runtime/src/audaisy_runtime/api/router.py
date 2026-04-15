from __future__ import annotations

from fastapi import APIRouter

from audaisy_runtime.api.routes import chapters, health, profile, projects, render_jobs, runtime, voice_presets


def create_api_router() -> APIRouter:
    router = APIRouter()
    router.include_router(health.router)
    router.include_router(runtime.router)
    router.include_router(profile.router)
    router.include_router(projects.router)
    router.include_router(chapters.router)
    router.include_router(render_jobs.router)
    router.include_router(voice_presets.router)
    return router
