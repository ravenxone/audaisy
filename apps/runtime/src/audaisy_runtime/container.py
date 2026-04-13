from __future__ import annotations

from dataclasses import dataclass

from audaisy_runtime.imports.import_service import ImportService
from audaisy_runtime.imports.validation import ImportValidator
from audaisy_runtime.model_manager.manager import ModelManager
from audaisy_runtime.persistence.database import Database
from audaisy_runtime.persistence.document_record_repository import DocumentRecordRepository
from audaisy_runtime.persistence.profile_repository import ProfileRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.persistence.voice_preset_repository import VoicePresetRepository
from audaisy_runtime.segmentation.chunking_service import ChunkingService
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.profile_service import ProfileService
from audaisy_runtime.services.project_service import ProjectService
from audaisy_runtime.services.runtime_status_service import RuntimeStatusService
from audaisy_runtime.settings import Settings


@dataclass(frozen=True, slots=True)
class ApplicationContainer:
    settings: Settings
    app_paths: AppPaths
    database: Database
    profile_service: ProfileService
    project_service: ProjectService
    runtime_status_service: RuntimeStatusService
    model_manager: ModelManager
    import_service: ImportService
    chunking_service: ChunkingService
    voice_preset_repository: VoicePresetRepository


def build_container(settings: Settings) -> ApplicationContainer:
    app_paths = AppPaths(root=settings.app_data_root)
    database = Database(settings.database_path)
    profile_repository = ProfileRepository(database)
    project_repository = ProjectRepository(database)
    document_record_repository = DocumentRecordRepository(database)
    voice_preset_repository = VoicePresetRepository(database)

    model_manager = ModelManager(settings, app_paths.cache_models_dir)
    project_service = ProjectService(project_repository, document_record_repository, app_paths)
    profile_service = ProfileService(profile_repository)
    runtime_status_service = RuntimeStatusService(settings, app_paths, model_manager)
    import_service = ImportService(document_record_repository, project_service, app_paths, ImportValidator())
    chunking_service = ChunkingService()

    return ApplicationContainer(
        settings=settings,
        app_paths=app_paths,
        database=database,
        profile_service=profile_service,
        project_service=project_service,
        runtime_status_service=runtime_status_service,
        model_manager=model_manager,
        import_service=import_service,
        chunking_service=chunking_service,
        voice_preset_repository=voice_preset_repository,
    )
