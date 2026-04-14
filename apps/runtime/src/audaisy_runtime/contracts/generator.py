from __future__ import annotations

import argparse
import json
from textwrap import dedent
from pathlib import Path

from audaisy_runtime.app import create_app
from audaisy_runtime.contracts.models import (
    ApiErrorCode,
    ImportFormat,
    ImportState,
    ModelInstallErrorCode,
    ModelInstallState,
    ModelTier,
    RuntimeBlockingIssueCode,
)
from audaisy_runtime.settings import Settings


def _render_union(enum_type: type) -> str:
    return " | ".join(f'"{member.value}"' for member in enum_type)


def _render_typescript_contracts(settings: Settings) -> str:
    return dedent(
        f"""
        export declare const CONTRACT_VERSION: "{settings.contract_version}";

        export type ApiErrorCode = {_render_union(ApiErrorCode)};
        export type ImportFormat = {_render_union(ImportFormat)};
        export type RuntimeBlockingIssueCode = {_render_union(RuntimeBlockingIssueCode)};
        export type ModelInstallErrorCode = {_render_union(ModelInstallErrorCode)};
        export type ModelTier = {_render_union(ModelTier)};
        export type ModelInstallState = {_render_union(ModelInstallState)};
        export type ImportState = {_render_union(ImportState)};

        export type ApiError = {{
          code: ApiErrorCode;
          message: string;
        }};

        export type ErrorEnvelope = {{
          error: ApiError;
        }};

        export type HealthResponse = {{
          healthy: boolean;
          contractVersion: string;
          runtimeVersion: string;
        }};

        export type ProfileResponse = {{
          id: string;
          name: string;
          avatarId: string | null;
          hasCompletedProfileSetup: boolean;
          createdAt: string;
          updatedAt: string;
        }};

        export type PatchProfileRequest = {{
          name?: string;
          avatarId?: string | null;
        }};

        export type RuntimeBlockingIssue = {{
          code: RuntimeBlockingIssueCode;
          message: string;
        }};

        export type ModelInstallStatus = {{
          state: ModelInstallState;
          requestedTier: ModelTier | null;
          resolvedTier: ModelTier | null;
          manifestVersion: string | null;
          checksumVerified: boolean;
          bytesDownloaded: number | null;
          totalBytes: number | null;
          updatedAt: string | null;
          lastErrorCode: ModelInstallErrorCode | null;
          lastErrorMessage: string | null;
        }};

        export type RuntimeStatusResponse = {{
          healthy: boolean;
          contractVersion: string;
          modelsReady: boolean;
          activeModelTier: ModelTier | null;
          defaultModelTier: ModelTier;
          canRun3BQuantized: boolean;
          diskReady: boolean;
          availableDiskBytes: number;
          minimumDiskFreeBytes: number;
          blockingIssues: RuntimeBlockingIssue[];
          modelInstall: ModelInstallStatus;
          supportedImportFormats: ImportFormat[];
        }};

        export type StartModelDownloadRequest = {{
          requestedTier?: ModelTier | null;
        }};

        export type ChapterSummary = {{
          id: string;
          title: string;
          order: number;
          warningCount: number;
        }};

        export type ProjectCard = {{
          id: string;
          title: string;
          chapterCount: number;
          lastOpenedAt: string | null;
          activeJobCount: number;
          createdAt: string;
          updatedAt: string;
        }};

        export type ProjectImportSummary = {{
          id: string;
          state: ImportState;
          sourceFileName: string;
          sourceMimeType: string;
          sourceSha256: string;
          fileSizeBytes: number;
          createdAt: string;
          updatedAt: string;
          failureMessage: string | null;
        }};

        export type ProjectDetailResponse = {{
          id: string;
          title: string;
          chapters: ChapterSummary[];
          imports: ProjectImportSummary[];
          defaultVoicePresetId: string | null;
          createdAt: string;
          updatedAt: string;
          lastOpenedAt: string | null;
        }};

        export type ListProjectsResponse = {{
          projects: ProjectCard[];
        }};

        export type CreateProjectRequest = {{
          title: string;
        }};

        export type UpdateProjectRequest = {{
          title?: string;
          defaultVoicePresetId?: string | null;
        }};

        export type CreateImportResponse = {{
          project: ProjectDetailResponse;
          import: ProjectImportSummary;
        }};

        export type VoicePresetResponse = {{
          id: string;
          name: string;
          language: string;
          cachedReferencePath: string | null;
        }};

        export type ListVoicePresetsResponse = {{
          presets: VoicePresetResponse[];
        }};
        """
    ).strip() + "\n"


def generate_contract_artifacts(settings: Settings, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    app = create_app(settings)
    openapi_document = app.openapi()
    (output_dir / "openapi.json").write_text(json.dumps(openapi_document, indent=2, sort_keys=True) + "\n")
    (output_dir / "version.txt").write_text(f"{settings.contract_version}\n")
    (output_dir / "index.d.ts").write_text(_render_typescript_contracts(settings))
    (output_dir / "index.js").write_text(f'export const CONTRACT_VERSION = "{settings.contract_version}";\n')


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Audaisy contract artifacts.")
    parser.add_argument("--app-data-root", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    settings = Settings(
        app_data_root=Path(args.app_data_root),
        contract_artifacts_dir=Path(args.output_dir),
    )
    generate_contract_artifacts(settings, Path(args.output_dir))


if __name__ == "__main__":
    main()
