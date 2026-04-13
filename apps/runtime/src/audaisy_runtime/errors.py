from __future__ import annotations

from audaisy_runtime.contracts.models import ApiErrorCode


class DomainError(Exception):
    def __init__(self, code: ApiErrorCode, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
