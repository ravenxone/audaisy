import type { AudaisyClient } from "@/shared/api/client";
import type {
  CreateProjectRequest,
  ProjectCard,
  ProjectImportResponse,
  ProjectResponse,
  RuntimeStatusResponse,
} from "@/shared/api/contracts-mirror";

type InMemoryClientOptions = {
  runtimeStatus?: RuntimeStatusResponse;
  getRuntimeStatusImpl?: () => Promise<RuntimeStatusResponse>;
  listProjectsImpl?: () => Promise<ProjectCard[]>;
  createProjectImpl?: (input: CreateProjectRequest) => Promise<ProjectResponse>;
  importFileImpl?: (projectId: string, file: File) => Promise<ProjectImportResponse>;
  initialProjects?: ProjectResponse[];
};

type InMemoryAudaisyClient = AudaisyClient & {
  calls: {
    createProject: number;
    importFile: number;
    listProjects: number;
    getProject: number;
  };
  factories: {
    project: (id: string, title: string) => ProjectResponse;
    projectCard: (project: ProjectResponse) => ProjectCard;
  };
};

const DEFAULT_RUNTIME_STATUS: RuntimeStatusResponse = {
  healthy: true,
  modelsReady: true,
  activeModelTier: "tada-3b-q4",
  canRun3BQuantized: true,
  availableDiskBytes: 64_000_000_000,
  minimumDiskFreeBytes: 8_000_000_000,
  blockingIssues: [],
};

function createProjectFactory(id: string, title: string): ProjectResponse {
  const timestamp = new Date("2026-04-13T12:00:00.000Z").toISOString();
  const isSample = id === "sample-project";

  return {
    id,
    title,
    chapters: isSample
      ? [
          {
            id: "sample-chapter-1",
            title: "Chapter 1",
            order: 1,
            warningCount: 0,
          },
          {
            id: "sample-chapter-2",
            title: "Chapter 2",
            order: 2,
            warningCount: 0,
          },
          {
            id: "sample-chapter-3",
            title: "Chapter 3",
            order: 3,
            warningCount: 0,
          },
        ]
      : [],
    defaultVoicePresetId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createProjectCard(project: ProjectResponse): ProjectCard {
  return {
    id: project.id,
    title: project.title,
    chapterCount: project.chapters.length,
    lastOpenedAt: project.updatedAt,
    activeJobCount: 0,
  };
}

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createInMemoryAudaisyClient(options: InMemoryClientOptions = {}): InMemoryAudaisyClient {
  const runtimeStatus = options.runtimeStatus ?? DEFAULT_RUNTIME_STATUS;
  const calls = {
    createProject: 0,
    importFile: 0,
    listProjects: 0,
    getProject: 0,
  };

  const seededProjects = options.initialProjects ?? [createProjectFactory("sample-project", "Sample Project")];
  const projects = new Map<string, ProjectResponse>(seededProjects.map((project) => [project.id, project]));

  const client: InMemoryAudaisyClient = {
    runtime: {
      getStatus: async () => (await options.getRuntimeStatusImpl?.()) ?? runtimeStatus,
    },
    projects: {
      list: async () => {
        calls.listProjects += 1;

        return (await options.listProjectsImpl?.()) ?? Array.from(projects.values()).map(createProjectCard);
      },
      create: async (input) => {
        calls.createProject += 1;

        const createdProject =
          (await options.createProjectImpl?.(input)) ??
          createProjectFactory(slugifyTitle(input.title), input.title);

        projects.set(createdProject.id, createdProject);

        return createdProject;
      },
      get: async (projectId) => {
        calls.getProject += 1;
        const project = projects.get(projectId);

        if (!project) {
          throw new Error(`Project ${projectId} was not found.`);
        }

        return project;
      },
      importFile: async (projectId, file) => {
        calls.importFile += 1;

        if (!projects.has(projectId)) {
          throw new Error(`Project ${projectId} was not found.`);
        }

        return (
          (await options.importFileImpl?.(projectId, file)) ?? {
            importId: `import-${projectId}`,
            documentRecordId: `document-${projectId}`,
            status: "accepted",
            sourceFileName: file.name,
            warningSummary: null,
          }
        );
      },
    },
    calls,
    factories: {
      project: createProjectFactory,
      projectCard: createProjectCard,
    },
  };

  return client;
}
