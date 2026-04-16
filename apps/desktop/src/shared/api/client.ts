import type {
  ChapterDetailResponse,
  CreateRenderJobRequest,
  CreateImportResponse,
  CreateProjectRequest,
  ListProjectsResponse,
  PatchProfileRequest,
  ProfileResponse,
  ProjectDetailResponse,
  RenderJobResponse,
  RuntimeStatusResponse,
  StartModelDownloadRequest,
  StartModelDownloadResponse,
  UpdateChapterRequest,
} from "@audaisy/contracts";

export type AudaisyClient = {
  runtime: {
    getStatus: () => Promise<RuntimeStatusResponse>;
    startModelDownload: (input: StartModelDownloadRequest) => Promise<StartModelDownloadResponse>;
  };
  profile: {
    get: () => Promise<ProfileResponse>;
    update: (input: PatchProfileRequest) => Promise<ProfileResponse>;
  };
  projects: {
    list: () => Promise<ListProjectsResponse["projects"]>;
    create: (input: CreateProjectRequest) => Promise<ProjectDetailResponse>;
    get: (projectId: string) => Promise<ProjectDetailResponse>;
    getChapter: (projectId: string, chapterId: string) => Promise<ChapterDetailResponse>;
    updateChapter: (
      projectId: string,
      chapterId: string,
      input: UpdateChapterRequest,
    ) => Promise<ChapterDetailResponse>;
    listRenderJobs: (projectId: string) => Promise<RenderJobResponse[]>;
    createRenderJob: (projectId: string, input: CreateRenderJobRequest) => Promise<RenderJobResponse>;
    getRenderJob: (projectId: string, jobId: string) => Promise<RenderJobResponse>;
    getRenderJobAudio: (projectId: string, jobId: string) => Promise<Blob>;
    delete: (projectId: string) => Promise<void>;
    importFile: (projectId: string, file: File) => Promise<CreateImportResponse>;
  };
};
