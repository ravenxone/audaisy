from __future__ import annotations

import shutil
from dataclasses import dataclass

from audaisy_runtime.contracts.models import (
    ModelInstallErrorCode,
    ModelInstallState,
    RuntimeBlockingIssue,
    RuntimeBlockingIssueCode,
    RuntimeStatusResponse,
)
from audaisy_runtime.model_manager.manager import ModelManager
from audaisy_runtime.settings import Settings
from audaisy_runtime.services.app_paths import AppPaths


@dataclass(frozen=True, slots=True)
class DiskStatus:
    free_bytes: int
    ready: bool


class RuntimeStatusService:
    def __init__(self, settings: Settings, app_paths: AppPaths, model_manager: ModelManager) -> None:
        self._settings = settings
        self._app_paths = app_paths
        self._model_manager = model_manager

    def get_status(self) -> RuntimeStatusResponse:
        disk_status = self._disk_status()
        install_status = self._model_manager.get_install_status()
        capability = self._model_manager.get_machine_capability()
        active_model_tier = install_status.resolved_tier if install_status.state == ModelInstallState.INSTALLED else None
        models_ready = (
            install_status.state == ModelInstallState.INSTALLED
            and install_status.checksum_verified
            and install_status.resolved_tier is not None
            and disk_status.ready
        )

        blocking_issues: list[RuntimeBlockingIssue] = []
        seen_issue_codes: set[RuntimeBlockingIssueCode] = set()

        def add_issue(code: RuntimeBlockingIssueCode, message: str) -> None:
            if code in seen_issue_codes:
                return
            seen_issue_codes.add(code)
            blocking_issues.append(RuntimeBlockingIssue(code=code, message=message))

        if install_status.last_error_code == ModelInstallErrorCode.MODEL_MANIFEST_INVALID:
            add_issue(
                RuntimeBlockingIssueCode.MODEL_MANIFEST_INVALID,
                install_status.last_error_message or "Installed model assets failed verification.",
            )
        elif install_status.state == ModelInstallState.ERROR:
            add_issue(
                RuntimeBlockingIssueCode.MODEL_DOWNLOAD_ERROR,
                install_status.last_error_message or "The last model install attempt failed.",
            )
        elif install_status.state != ModelInstallState.INSTALLED:
            add_issue(
                RuntimeBlockingIssueCode.MODELS_MISSING,
                "Required model assets are not installed yet.",
            )
        elif not install_status.checksum_verified:
            add_issue(
                RuntimeBlockingIssueCode.MODEL_MANIFEST_INVALID,
                "Installed model assets failed verification.",
            )

        if install_status.last_error_code == ModelInstallErrorCode.MODEL_DOWNLOAD_UNAVAILABLE:
            add_issue(
                RuntimeBlockingIssueCode.MODEL_DOWNLOAD_UNAVAILABLE,
                install_status.last_error_message or "Model download is not currently available.",
            )
        if not disk_status.ready:
            add_issue(
                RuntimeBlockingIssueCode.DISK_SPACE_LOW,
                "Not enough disk space is available for runtime operations.",
            )

        if not capability.can_run_3b_quantized and active_model_tier is None:
            add_issue(
                RuntimeBlockingIssueCode.UNSUPPORTED_HARDWARE,
                f"This machine cannot run the default {self._settings.default_model_tier.value} model tier.",
            )

        return RuntimeStatusResponse(
            healthy=True,
            contract_version=self._settings.contract_version,
            models_ready=models_ready,
            active_model_tier=active_model_tier,
            default_model_tier=self._settings.default_model_tier,
            can_run_3b_quantized=capability.can_run_3b_quantized,
            disk_ready=disk_status.ready,
            available_disk_bytes=disk_status.free_bytes,
            minimum_disk_free_bytes=self._settings.minimum_disk_free_bytes,
            blocking_issues=blocking_issues,
            model_install=install_status,
            supported_import_formats=list(self._settings.supported_import_formats),
        )

    def _disk_status(self) -> DiskStatus:
        usage = shutil.disk_usage(self._app_paths.root)
        return DiskStatus(
            free_bytes=usage.free,
            ready=usage.free >= self._settings.minimum_disk_free_bytes,
        )
