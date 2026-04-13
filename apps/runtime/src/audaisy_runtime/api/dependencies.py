from __future__ import annotations

from fastapi import Request

from audaisy_runtime.container import ApplicationContainer


def get_container(request: Request) -> ApplicationContainer:
    return request.app.state.container

