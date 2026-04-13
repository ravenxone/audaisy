import type {
  CreateProjectRequest,
  ProjectCard,
  ProjectImportResponse,
  ProjectResponse,
  RuntimeStatusResponse,
} from "@/shared/api/contracts-mirror";

export type AudaisyClient = {
  runtime: {
    getStatus: () => Promise<RuntimeStatusResponse>;
  };
  projects: {
    list: () => Promise<ProjectCard[]>;
    create: (input: CreateProjectRequest) => Promise<ProjectResponse>;
    get: (projectId: string) => Promise<ProjectResponse>;
    importFile: (projectId: string, file: File) => Promise<ProjectImportResponse>;
  };
};
