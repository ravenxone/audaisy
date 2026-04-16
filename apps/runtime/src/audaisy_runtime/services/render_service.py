from __future__ import annotations

import json
import threading
import wave
from pathlib import Path
from uuid import uuid4

from audaisy_runtime.contracts.models import (
    ApiErrorCode,
    CreateRenderJobRequest,
    ListRenderJobsResponse,
    ModelTier,
    RenderFailureCode,
    RenderJobResponse,
    RenderJobStatus,
    RenderSegmentSummary,
)
from audaisy_runtime.errors import DomainError, RenderPipelineError
from audaisy_runtime.persistence.chapter_repository import ChapterRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.persistence.render_job_repository import RenderJobRepository
from audaisy_runtime.persistence.segment_repository import SegmentRepository
from audaisy_runtime.segmentation.chunking_service import ChunkingService
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.chapter_render_input_service import ChapterRenderInputService
from audaisy_runtime.services.mlx_tada_model_service import MlxTadaModelService
from audaisy_runtime.services.profile_service import utc_now
from audaisy_runtime.services.runtime_voice_service import RuntimeVoiceService


class RenderService:
    def __init__(
        self,
        *,
        project_repository: ProjectRepository,
        chapter_repository: ChapterRepository,
        render_job_repository: RenderJobRepository,
        segment_repository: SegmentRepository,
        chapter_render_input_service: ChapterRenderInputService,
        chunking_service: ChunkingService,
        voice_service: RuntimeVoiceService,
        model_service: MlxTadaModelService,
        app_paths: AppPaths,
    ) -> None:
        self._project_repository = project_repository
        self._chapter_repository = chapter_repository
        self._render_job_repository = render_job_repository
        self._segment_repository = segment_repository
        self._chapter_render_input_service = chapter_render_input_service
        self._chunking_service = chunking_service
        self._voice_service = voice_service
        self._model_service = model_service
        self._app_paths = app_paths
        self._worker_lock = threading.Lock()

    def list_jobs(self, project_id: str) -> ListRenderJobsResponse:
        self._require_project(project_id)
        return ListRenderJobsResponse(jobs=[self._build_job_response(row) for row in self._render_job_repository.list_by_project(project_id)])

    def get_job(self, project_id: str, job_id: str) -> RenderJobResponse:
        self._require_project(project_id)
        job = self._render_job_repository.get(job_id)
        if job is None or job["project_id"] != project_id:
            raise DomainError(ApiErrorCode.RENDER_JOB_NOT_FOUND, "Render job was not found.", 404)
        return self._build_job_response(job)

    def get_job_audio(self, project_id: str, job_id: str) -> Path:
        self._require_project(project_id)
        job = self._render_job_repository.get(job_id)
        if job is None or job["project_id"] != project_id:
            raise DomainError(ApiErrorCode.RENDER_JOB_NOT_FOUND, "Render job was not found.", 404)
        if job["status"] != RenderJobStatus.COMPLETED.value or not job["output_audio_path"]:
            raise DomainError(ApiErrorCode.RENDER_JOB_NOT_READY, "Render job audio is not ready yet.", 409)

        audio_path = self._app_paths.root / job["output_audio_path"]
        if not audio_path.is_file():
            raise DomainError(ApiErrorCode.RENDER_JOB_NOT_READY, "Render job audio is not ready yet.", 409)
        return audio_path

    def create_job(self, project_id: str, payload: CreateRenderJobRequest) -> RenderJobResponse:
        project = self._require_project(project_id)
        try:
            self._model_service.require_ready_weights_dir()
            voice_reference = self._voice_service.resolve_reference(
                payload.voice_preset_id,
                project_default_voice_preset_id=project["default_voice_preset_id"],
            )
        except RenderPipelineError as error:
            raise self._to_domain_error(error) from error

        chapter_input = self._chapter_render_input_service.load(project_id, payload.chapter_id)
        units = self._chunking_service.chunk_blocks(chapter_input.blocks)
        if not units:
            raise DomainError(ApiErrorCode.RENDER_GENERATION_FAILED, "Chapter has no renderable text.", 422)

        timestamp = utc_now()
        job_id = str(uuid4())
        job = self._render_job_repository.create(
            job_id=job_id,
            project_id=project_id,
            chapter_id=payload.chapter_id,
            voice_preset_id=voice_reference.preset["id"],
            model_tier=ModelTier.TADA_3B_Q4.value,
            source_chapter_revision=chapter_input.revision,
            created_at=timestamp,
            updated_at=timestamp,
        )
        self._segment_repository.create_many(
            [
                (
                    str(uuid4()),
                    job_id,
                    payload.chapter_id,
                    unit.text,
                    json.dumps(list(unit.block_ids)),
                    unit.order,
                    None,
                    "queued",
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                for unit in units
            ]
        )
        return self._build_job_response(job)

    def run_queued_jobs(self) -> None:
        if not self._worker_lock.acquire(blocking=False):
            return

        try:
            while True:
                job = self._render_job_repository.next_queued()
                if job is None:
                    return
                self._run_job(job)
        finally:
            self._worker_lock.release()

    def recover_incomplete_jobs(self) -> None:
        for job in self._render_job_repository.list_by_statuses((RenderJobStatus.RUNNING.value,)):
            now = utc_now()
            self._render_job_repository.mark_failed(
                job["id"],
                updated_at=now,
                completed_at=now,
                error_code=RenderFailureCode.INTERRUPTED.value,
                error_message="Render job was interrupted before completion.",
            )

        for job in self._render_job_repository.list_by_statuses((RenderJobStatus.ASSEMBLING.value,)):
            self._recover_assembling_job(job)

        self.run_queued_jobs()

    def _run_job(self, job) -> None:
        try:
            voice_reference = self._voice_service.resolve_reference(job["voice_preset_id"])
            reference = self._model_service.load_reference(
                voice_reference.path,
                audio_text=voice_reference.transcript,
            )
            now = utc_now()
            self._render_job_repository.mark_running(job["id"], updated_at=now, started_at=now)
            project_paths = self._app_paths.project_paths(job["project_id"])
            project_paths.ensure()
            segment_rows = self._segment_repository.list_by_job(job["id"])

            for segment in segment_rows:
                self._segment_repository.mark_running(segment["id"], started_at=utc_now())
                artifact_id = str(uuid4())
                output_path = project_paths.audio_segments_dir / job["id"] / f"{segment['segment_order']:04d}-{artifact_id}.wav"
                try:
                    output = self._model_service.generate(segment["text"], reference)
                    self._model_service.save_wav(output.audio, output_path)
                except RenderPipelineError as error:
                    finished_at = utc_now()
                    self._segment_repository.mark_failed(
                        segment["id"],
                        completed_at=finished_at,
                        error_code=error.failure_code,
                        error_message=error.message,
                    )
                    self._render_job_repository.mark_failed(
                        job["id"],
                        updated_at=finished_at,
                        completed_at=finished_at,
                        error_code=error.failure_code,
                        error_message=error.message,
                    )
                    return

                self._segment_repository.mark_completed(
                    segment["id"],
                    completed_at=utc_now(),
                    audio_artifact_id=artifact_id,
                    audio_path=self._relative_path(output_path),
                )

            self._render_job_repository.mark_assembling(job["id"], updated_at=utc_now())
            final_artifact_id = str(uuid4())
            final_path = project_paths.audio_books_dir / f"{job['id']}-{final_artifact_id}.wav"
            self._assemble_final_wav(self._segment_repository.list_by_job(job["id"]), final_path)
            completed_at = utc_now()
            self._render_job_repository.mark_completed(
                job["id"],
                updated_at=completed_at,
                completed_at=completed_at,
                output_audio_artifact_id=final_artifact_id,
                output_audio_path=self._relative_path(final_path),
            )
        except RenderPipelineError as error:
            finished_at = utc_now()
            self._render_job_repository.mark_failed(
                job["id"],
                updated_at=finished_at,
                completed_at=finished_at,
                error_code=error.failure_code,
                error_message=error.message,
            )

    def _recover_assembling_job(self, job) -> None:
        segment_rows = self._segment_repository.list_by_job(job["id"])
        audio_paths: list[Path] = []
        for segment in segment_rows:
            if segment["status"] != "completed" or not segment["audio_path"]:
                self._render_job_repository.mark_failed(
                    job["id"],
                    updated_at=utc_now(),
                    completed_at=utc_now(),
                    error_code=RenderFailureCode.INTERRUPTED.value,
                    error_message="Render job was interrupted during assembly and segment outputs are incomplete.",
                )
                return
            audio_path = self._app_paths.root / segment["audio_path"]
            if not audio_path.is_file():
                self._render_job_repository.mark_failed(
                    job["id"],
                    updated_at=utc_now(),
                    completed_at=utc_now(),
                    error_code=RenderFailureCode.INTERRUPTED.value,
                    error_message="Render job was interrupted during assembly and segment outputs are missing.",
                )
                return
            audio_paths.append(audio_path)

        if not audio_paths:
            self._render_job_repository.mark_failed(
                job["id"],
                updated_at=utc_now(),
                completed_at=utc_now(),
                error_code=RenderFailureCode.INTERRUPTED.value,
                error_message="Render job was interrupted before any segment outputs were saved.",
            )
            return

        project_paths = self._app_paths.project_paths(job["project_id"])
        project_paths.ensure()
        artifact_id = str(uuid4())
        final_path = project_paths.audio_books_dir / f"{job['id']}-{artifact_id}.wav"
        self._assemble_final_wav(segment_rows, final_path)
        completed_at = utc_now()
        self._render_job_repository.mark_completed(
            job["id"],
            updated_at=completed_at,
            completed_at=completed_at,
            output_audio_artifact_id=artifact_id,
            output_audio_path=self._relative_path(final_path),
        )

    def _assemble_final_wav(self, segment_rows, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        params = None
        try:
            with wave.open(str(output_path), "wb") as destination:
                for segment in segment_rows:
                    if not segment["audio_path"]:
                        raise RenderPipelineError(
                            api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
                            failure_code=RenderFailureCode.OUTPUT_ASSEMBLY_FAILED.value,
                            message="Segment audio is missing during chapter assembly.",
                        )
                    source_path = self._app_paths.root / segment["audio_path"]
                    with wave.open(str(source_path), "rb") as source:
                        current_params = (
                            source.getnchannels(),
                            source.getsampwidth(),
                            source.getframerate(),
                            source.getcomptype(),
                            source.getcompname(),
                        )
                        if params is None:
                            params = current_params
                            destination.setnchannels(current_params[0])
                            destination.setsampwidth(current_params[1])
                            destination.setframerate(current_params[2])
                        elif params != current_params:
                            raise RenderPipelineError(
                                api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
                                failure_code=RenderFailureCode.OUTPUT_ASSEMBLY_FAILED.value,
                                message="Segment WAV formats do not match for chapter assembly.",
                            )
                        while True:
                            frames = source.readframes(8192)
                            if not frames:
                                break
                            destination.writeframes(frames)
        except RenderPipelineError:
            output_path.unlink(missing_ok=True)
            raise
        except Exception as error:
            output_path.unlink(missing_ok=True)
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
                failure_code=RenderFailureCode.OUTPUT_ASSEMBLY_FAILED.value,
                message=f"Could not assemble chapter WAV at {output_path}.",
            ) from error

    def _build_job_response(self, row) -> RenderJobResponse:
        segments = self._segment_repository.list_by_job(row["id"])
        return RenderJobResponse(
            id=row["id"],
            project_id=row["project_id"],
            chapter_id=row["chapter_id"],
            voice_preset_id=row["voice_preset_id"],
            model_tier=row["model_tier"],
            source_chapter_revision=row["source_chapter_revision"],
            status=row["status"],
            segment_summaries=[
                RenderSegmentSummary(
                    id=segment["id"],
                    chapter_id=segment["chapter_id"],
                    order=segment["segment_order"],
                    status=segment["status"],
                    block_ids=json.loads(segment["block_ids_json"]),
                    has_audio=bool(segment["audio_artifact_id"]),
                    audio_artifact_id=segment["audio_artifact_id"],
                    started_at=segment["started_at"],
                    completed_at=segment["completed_at"],
                    error_code=segment["error_code"],
                    error_message=segment["error_message"],
                )
                for segment in segments
            ],
            has_audio=bool(row["output_audio_artifact_id"]),
            audio_artifact_id=row["output_audio_artifact_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            error_code=row["error_code"],
            error_message=row["error_message"],
        )

    def _require_project(self, project_id: str):
        project = self._project_repository.get(project_id)
        if project is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)
        return project

    def _relative_path(self, path: Path) -> str:
        return str(path.relative_to(self._app_paths.root))

    @staticmethod
    def _to_domain_error(error: RenderPipelineError) -> DomainError:
        status_code = 404 if error.api_error_code == ApiErrorCode.VOICE_PRESET_NOT_FOUND else 409
        return DomainError(error.api_error_code, error.message, status_code)
