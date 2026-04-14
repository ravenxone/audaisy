import type {
  ChapterDetailResponse,
  CreateImportResponse,
  CreateProjectRequest,
  ListProjectsResponse,
  PatchProfileRequest,
  ProfileResponse,
  ProjectDetailResponse,
  RuntimeStatusResponse,
  UpdateChapterRequest,
} from "@audaisy/contracts";

export type AudaisyClient = {
  runtime: {
    getStatus: () => Promise<RuntimeStatusResponse>;
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
    delete: (projectId: string) => Promise<void>;
    importFile: (projectId: string, file: File) => Promise<CreateImportResponse>;
  };
};
