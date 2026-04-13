export type ChapterSummary = {
  id: string;
  title: string;
  order: number;
  warningCount: number;
};

export type RuntimeStatusResponse = {
  healthy: boolean;
  modelsReady: boolean;
  activeModelTier: "tada-3b-q4" | "tada-1b-q4" | null;
  canRun3BQuantized: boolean;
  availableDiskBytes: number;
  minimumDiskFreeBytes: number;
  blockingIssues: string[];
};

export type CreateProjectRequest = {
  title: string;
};

export type ProjectResponse = {
  id: string;
  title: string;
  chapters: ChapterSummary[];
  defaultVoicePresetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCard = {
  id: string;
  title: string;
  chapterCount: number;
  lastOpenedAt: string | null;
  activeJobCount: number;
};

export type WarningSummary = {
  info: number;
  warning: number;
  error: number;
};

export type ProjectImportResponse = {
  importId: string;
  documentRecordId: string | null;
  status: "accepted" | "processing" | "completed" | "failed";
  sourceFileName: string;
  warningSummary: WarningSummary | null;
};
