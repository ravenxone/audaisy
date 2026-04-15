from __future__ import annotations

from dataclasses import dataclass

from audaisy_runtime.imports.import_service import ImportService
from audaisy_runtime.imports.validation import ImportValidator
from audaisy_runtime.manuscript.normalization import ImportNormalizationService
from audaisy_runtime.model_manager.manager import ModelManager
from audaisy_runtime.persistence.chapter_repository import ChapterRepository
from audaisy_runtime.persistence.database import Database
from audaisy_runtime.persistence.document_record_repository import DocumentRecordRepository
from audaisy_runtime.persistence.import_warning_repository import ImportWarningRepository
from audaisy_runtime.persistence.profile_repository import ProfileRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.persistence.render_job_repository import RenderJobRepository
from audaisy_runtime.persistence.runtime_settings_repository import RuntimeSettingsRepository
from audaisy_runtime.persistence.segment_repository import SegmentRepository
from audaisy_runtime.persistence.voice_preset_repository import VoicePresetRepository
from audaisy_runtime.segmentation.chunking_service import ChunkingService
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.chapter_render_input_service import ChapterRenderInputService
from audaisy_runtime.services.chapter_service import ChapterService
from audaisy_runtime.services.mlx_tada_model_service import MlxTadaModelService
from audaisy_runtime.services.profile_service import ProfileService
from audaisy_runtime.services.project_service import ProjectService
from audaisy_runtime.services.render_service import RenderService
from audaisy_runtime.services.runtime_status_service import RuntimeStatusService
from audaisy_runtime.services.runtime_voice_service import RuntimeVoiceService
from audaisy_runtime.settings import Settings


@dataclass(frozen=True, slots=True)
class ApplicationContainer:
    settings: Settings
    app_paths: AppPaths
    database: Database
    profile_service: ProfileService
    project_service: ProjectService
    chapter_service: ChapterService
    runtime_status_service: RuntimeStatusService
    model_manager: ModelManager
    model_service: MlxTadaModelService
    import_service: ImportService
    chunking_service: ChunkingService
    voice_preset_repository: VoicePresetRepository
    voice_service: RuntimeVoiceService
    render_service: RenderService


def build_container(settings: Settings) -> ApplicationContainer:
    app_paths = AppPaths(root=settings.app_data_root)
    database = Database(settings.database_path)
    profile_repository = ProfileRepository(database)
    project_repository = ProjectRepository(database)
    chapter_repository = ChapterRepository(database)
    document_record_repository = DocumentRecordRepository(database)
    import_warning_repository = ImportWarningRepository(database)
    runtime_settings_repository = RuntimeSettingsRepository(database)
    voice_preset_repository = VoicePresetRepository(database)
    render_job_repository = RenderJobRepository(database)
    segment_repository = SegmentRepository(database)
    model_manager = ModelManager(settings, app_paths.cache_models_dir, runtime_settings_repository)
    project_service = ProjectService(project_repository, chapter_repository, document_record_repository, app_paths)
    chapter_service = ChapterService(project_repository, chapter_repository, import_warning_repository, app_paths)
    profile_service = ProfileService(profile_repository)
    runtime_status_service = RuntimeStatusService(settings, app_paths, model_manager)
    voice_service = RuntimeVoiceService(voice_preset_repository, app_paths, settings)
    model_service = MlxTadaModelService(model_manager)
    import_service = ImportService(
        project_repository=project_repository,
        chapter_repository=chapter_repository,
        document_record_repository=document_record_repository,
        import_warning_repository=import_warning_repository,
        project_service=project_service,
        app_paths=app_paths,
        import_validator=ImportValidator(),
        normalization_service=ImportNormalizationService(),
    )
    chunking_service = ChunkingService()
    chapter_render_input_service = ChapterRenderInputService(project_repository, chapter_repository, app_paths)
    render_service = RenderService(
        project_repository=project_repository,
        chapter_repository=chapter_repository,
        render_job_repository=render_job_repository,
        segment_repository=segment_repository,
        chapter_render_input_service=chapter_render_input_service,
        chunking_service=chunking_service,
        voice_service=voice_service,
        model_service=model_service,
        app_paths=app_paths,
    )

    return ApplicationContainer(
        settings=settings,
        app_paths=app_paths,
        database=database,
        profile_service=profile_service,
        project_service=project_service,
        chapter_service=chapter_service,
        runtime_status_service=runtime_status_service,
        model_manager=model_manager,
        model_service=model_service,
        import_service=import_service,
        chunking_service=chunking_service,
        voice_preset_repository=voice_preset_repository,
        voice_service=voice_service,
        render_service=render_service,
    )
