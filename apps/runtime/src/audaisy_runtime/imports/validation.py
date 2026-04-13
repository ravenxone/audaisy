from __future__ import annotations

import codecs
from dataclasses import dataclass, field

from audaisy_runtime.contracts.models import ApiErrorCode
from audaisy_runtime.errors import DomainError


ALLOWED_IMPORT_TYPES = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
}

PDF_HEADER = b"%PDF-"
PDF_EOF_MARKER = b"%%EOF"
PDF_TRAILER_WINDOW_BYTES = 2048


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


@dataclass(slots=True)
class PdfImportValidationSession(ImportValidationSession):
    trailing_bytes: bytearray = field(default_factory=bytearray)

    def validate_chunk(self, chunk: bytes, *, is_first_chunk: bool) -> None:
        if is_first_chunk and not chunk.startswith(PDF_HEADER):
            raise DomainError(
                ApiErrorCode.MALFORMED_IMPORT,
                "The uploaded PDF file is malformed.",
                415,
            )
        self.trailing_bytes.extend(chunk)
        if len(self.trailing_bytes) > PDF_TRAILER_WINDOW_BYTES:
            del self.trailing_bytes[:-PDF_TRAILER_WINDOW_BYTES]

    def finalize(self) -> str:
        if PDF_EOF_MARKER not in self.trailing_bytes:
            raise DomainError(
                ApiErrorCode.MALFORMED_IMPORT,
                "The uploaded PDF file is malformed.",
                415,
            )
        return ALLOWED_IMPORT_TYPES[".pdf"]


class ImportValidator:
    def create_session(self, suffix: str) -> ImportValidationSession:
        if suffix == ".txt":
            return TextImportValidationSession(ALLOWED_IMPORT_TYPES[".txt"])
        if suffix == ".md":
            return TextImportValidationSession(ALLOWED_IMPORT_TYPES[".md"])
        if suffix == ".pdf":
            return PdfImportValidationSession()
        raise DomainError(
            ApiErrorCode.UNSUPPORTED_IMPORT_TYPE,
            "Only .pdf, .txt, and .md imports are supported in this step.",
            415,
        )
