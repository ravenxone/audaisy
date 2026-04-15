export declare const CONTRACT_VERSION: "0.2.0";

export type ApiErrorCode = "INVALID_REQUEST" | "PROJECT_NOT_FOUND" | "CHAPTER_NOT_FOUND" | "RENDER_JOB_NOT_FOUND" | "UNSUPPORTED_IMPORT_TYPE" | "MALFORMED_IMPORT" | "MODEL_HARDWARE_UNSUPPORTED" | "MODEL_DISK_SPACE_LOW" | "MODEL_MANIFEST_FETCH_FAILED" | "MODEL_MANIFEST_INVALID" | "MODEL_DOWNLOAD_FAILED" | "MODEL_CHECKSUM_MISMATCH" | "MODEL_NOT_READY" | "MODEL_LOAD_FAILED" | "VOICE_PRESET_NOT_FOUND" | "VOICE_REFERENCE_MISSING" | "RENDER_GENERATION_FAILED";
export type ImportFormat = ".txt" | ".md";
export type RuntimeBlockingIssueCode = "MODELS_MISSING" | "DISK_SPACE_LOW" | "UNSUPPORTED_HARDWARE" | "MODEL_MANIFEST_INVALID" | "MODEL_DOWNLOAD_ERROR";
export type ModelInstallErrorCode = "UNSUPPORTED_HARDWARE" | "DISK_SPACE_LOW" | "MODEL_MANIFEST_FETCH_FAILED" | "MODEL_MANIFEST_INVALID" | "MODEL_DOWNLOAD_FAILED" | "MODEL_CHECKSUM_MISMATCH" | "INTERRUPTED";
export type ModelTier = "tada-3b-q4";
export type ModelInstallState = "not_installed" | "unavailable" | "downloading" | "verifying" | "installed" | "error";
export type StartModelDownloadResult = "started" | "already_downloading" | "already_installed";
export type ImportState = "stored" | "processing" | "completed" | "failed";
export type RenderJobStatus = "queued" | "running" | "assembling" | "completed" | "failed";
export type RenderSegmentStatus = "queued" | "running" | "completed" | "failed";
export type RenderFailureCode = "INTERRUPTED" | "MODEL_NOT_READY" | "MODEL_LOAD_FAILED" | "VOICE_PRESET_NOT_FOUND" | "VOICE_REFERENCE_MISSING" | "RENDER_GENERATION_FAILED" | "OUTPUT_ASSEMBLY_FAILED";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
};

export type ErrorEnvelope = {
  error: ApiError;
};

export type HealthResponse = {
  healthy: boolean;
  contractVersion: string;
  runtimeVersion: string;
};

export type ProfileResponse = {
  id: string;
  name: string;
  avatarId: string | null;
  hasCompletedProfileSetup: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PatchProfileRequest = {
  name?: string;
  avatarId?: string | null;
};

export type RuntimeBlockingIssue = {
  code: RuntimeBlockingIssueCode;
  message: string;
};

export type ModelInstallStatus = {
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
};

export type RuntimeStatusResponse = {
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
};

export type StartModelDownloadRequest = {
  requestedTier?: ModelTier | null;
};

export type StartModelDownloadResponse = {
  result: StartModelDownloadResult;
  modelInstall: ModelInstallStatus;
};

export type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
};

export type ImportWarning = {
  id: string;
  code: string;
  severity: string;
  message: string;
  sourcePage?: number | null;
  blockId?: string | null;
};

export type ChapterSummary = {
  id: string;
  title: string;
  order: number;
  warningCount: number;
  sourceDocumentRecordId?: string | null;
};

export type ChapterDetailResponse = {
  id: string;
  projectId: string;
  title: string;
  order: number;
  revision: number;
  editorDoc: ProseMirrorNode;
  markdown: string;
  warnings: ImportWarning[];
  sourceDocumentRecordId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateChapterRequest = {
  editorDoc: ProseMirrorNode;
};

export type ProjectCard = {
  id: string;
  title: string;
  chapterCount: number;
  lastOpenedAt: string | null;
  activeJobCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectImportSummary = {
  id: string;
  state: ImportState;
  sourceFileName: string;
  sourceMimeType: string;
  sourceSha256: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  failureMessage: string | null;
};

export type ProjectDetailResponse = {
  id: string;
  title: string;
  chapters: ChapterSummary[];
  imports: ProjectImportSummary[];
  defaultVoicePresetId: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type ListProjectsResponse = {
  projects: ProjectCard[];
};

export type CreateProjectRequest = {
  title: string;
};

export type UpdateProjectRequest = {
  title?: string;
  defaultVoicePresetId?: string | null;
};

export type CreateImportResponse = {
  project: ProjectDetailResponse;
  import: ProjectImportSummary;
};

export type VoicePresetResponse = {
  id: string;
  name: string;
  language: string;
  hasReference: boolean;
};

export type ListVoicePresetsResponse = {
  presets: VoicePresetResponse[];
};

export type CreateRenderJobRequest = {
  chapterId: string;
  voicePresetId?: string | null;
};

export type RenderSegmentSummary = {
  id: string;
  chapterId: string;
  order: number;
  status: RenderSegmentStatus;
  blockIds: string[];
  hasAudio: boolean;
  audioArtifactId: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorCode?: RenderFailureCode | null;
  errorMessage?: string | null;
};

export type RenderJobResponse = {
  id: string;
  projectId: string;
  chapterId: string;
  voicePresetId: string;
  modelTier: ModelTier;
  sourceChapterRevision: number;
  status: RenderJobStatus;
  segmentSummaries: RenderSegmentSummary[];
  hasAudio: boolean;
  audioArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorCode?: RenderFailureCode | null;
  errorMessage?: string | null;
};

export type ListRenderJobsResponse = {
  jobs: RenderJobResponse[];
};
