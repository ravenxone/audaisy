import type {
  CreateImportResponse,
  CreateProjectRequest,
  ListProjectsResponse,
  PatchProfileRequest,
  ProfileResponse,
  ProjectDetailResponse,
  RuntimeStatusResponse,
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
    delete: (projectId: string) => Promise<void>;
    importFile: (projectId: string, file: File) => Promise<CreateImportResponse>;
  };
};
