import type {
  CreateImportResponse,
  CreateProjectRequest,
  ListProjectsResponse,
  ProjectDetailResponse,
  RuntimeStatusResponse,
} from "@audaisy/contracts";

export type AudaisyClient = {
  runtime: {
    getStatus: () => Promise<RuntimeStatusResponse>;
  };
  projects: {
    list: () => Promise<ListProjectsResponse["projects"]>;
    create: (input: CreateProjectRequest) => Promise<ProjectDetailResponse>;
    get: (projectId: string) => Promise<ProjectDetailResponse>;
    importFile: (projectId: string, file: File) => Promise<CreateImportResponse>;
  };
};
