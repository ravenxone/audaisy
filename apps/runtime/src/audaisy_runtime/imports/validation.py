from __future__ import annotations

import codecs

from audaisy_runtime.contracts.models import ApiErrorCode, ImportFormat
from audaisy_runtime.errors import DomainError


ALLOWED_IMPORT_TYPES = {
    ImportFormat.TXT.value: "text/plain",
    ImportFormat.MD.value: "text/markdown",
}


class ImportValidationSession:
    def validate_chunk(self, chunk: bytes, *, is_first_chunk: bool) -> None:
        raise NotImplementedError

    def finalize(self) -> str:
        raise NotImplementedError


class TextImportValidationSession(ImportValidationSession):
    def __init__(self, mime_type: str) -> None:
        self._mime_type = mime_type
        self._decoder = codecs.getincrementaldecoder("utf-8")("strict")

    def validate_chunk(self, chunk: bytes, *, is_first_chunk: bool) -> None:
        del is_first_chunk
        if b"\x00" in chunk:
            raise DomainError(
                ApiErrorCode.MALFORMED_IMPORT,
                "The uploaded text file contains unsupported binary data.",
                415,
            )
        try:
            self._decoder.decode(chunk, final=False)
        except UnicodeDecodeError as error:
            raise DomainError(
                ApiErrorCode.MALFORMED_IMPORT,
                "The uploaded text file could not be decoded as UTF-8.",
                415,
            ) from error

    def finalize(self) -> str:
        try:
            self._decoder.decode(b"", final=True)
        except UnicodeDecodeError as error:
            raise DomainError(
                ApiErrorCode.MALFORMED_IMPORT,
                "The uploaded text file could not be decoded as UTF-8.",
                415,
            ) from error
        return self._mime_type


class ImportValidator:
    def create_session(self, suffix: str) -> ImportValidationSession:
        if suffix == ImportFormat.TXT.value:
            return TextImportValidationSession(ALLOWED_IMPORT_TYPES[ImportFormat.TXT.value])
        if suffix == ImportFormat.MD.value:
            return TextImportValidationSession(ALLOWED_IMPORT_TYPES[ImportFormat.MD.value])
        raise DomainError(
            ApiErrorCode.UNSUPPORTED_IMPORT_TYPE,
            "Only .txt and .md imports are supported in this step.",
            415,
        )
