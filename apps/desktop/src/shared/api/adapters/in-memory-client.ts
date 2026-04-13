import type { AudaisyClient } from "@/shared/api/client";
import type {
  CreateImportResponse,
  CreateProjectRequest,
  ProjectImportSummary,
  ProjectCard,
  ProjectDetailResponse,
  RuntimeStatusResponse,
} from "@audaisy/contracts";

type InMemoryClientOptions = {
  runtimeStatus?: Partial<RuntimeStatusResponse>;
  getRuntimeStatusImpl?: () => Promise<RuntimeStatusResponse>;
  listProjectsImpl?: () => Promise<ProjectCard[]>;
  createProjectImpl?: (input: CreateProjectRequest) => Promise<ProjectDetailResponse>;
  importFileImpl?: (projectId: string, file: File) => Promise<CreateImportResponse>;
  initialProjects?: ProjectDetailResponse[];
};

type InMemoryAudaisyClient = AudaisyClient & {
  calls: {
    createProject: number;
    importFile: number;
    listProjects: number;
    getProject: number;
  };
  factories: {
    project: (id: string, title: string) => ProjectDetailResponse;
    projectCard: (project: ProjectDetailResponse) => ProjectCard;
  };
};

function buildRuntimeStatus(overrides: Partial<RuntimeStatusResponse> = {}): RuntimeStatusResponse {
  return {
    healthy: true,
    contractVersion: "0.1.0",
    modelsReady: true,
    activeModelTier: "tada-3b-q4",
    defaultModelTier: "tada-3b-q4",
    canRun3BQuantized: true,
    diskReady: true,
    availableDiskBytes: 64_000_000_000,
    minimumDiskFreeBytes: 8_000_000_000,
    blockingIssues: [],
    modelInstall: {
      state: "installed",
      requestedTier: "tada-3b-q4",
      resolvedTier: "tada-3b-q4",
      manifestVersion: "test-manifest",
      checksumVerified: true,
      bytesDownloaded: null,
      totalBytes: null,
      updatedAt: "2026-04-13T12:00:00.000Z",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    ...overrides,
  };
}

function createProjectFactory(id: string, title: string): ProjectDetailResponse {
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
    imports: [],
    defaultVoicePresetId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
}

function createProjectCard(project: ProjectDetailResponse): ProjectCard {
  return {
    id: project.id,
    title: project.title,
    chapterCount: project.chapters.length,
    lastOpenedAt: project.lastOpenedAt,
    activeJobCount: 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
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
  const runtimeStatus = buildRuntimeStatus(options.runtimeStatus);
  const calls = {
    createProject: 0,
    importFile: 0,
    listProjects: 0,
    getProject: 0,
  };

  const seededProjects = options.initialProjects ?? [createProjectFactory("sample-project", "Sample Project")];
  const projects = new Map<string, ProjectDetailResponse>(seededProjects.map((project) => [project.id, project]));

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

        const project = projects.get(projectId);
        if (!project) {
          throw new Error(`Project ${projectId} was not found.`);
        }

        const timestamp = new Date("2026-04-13T12:00:00.000Z").toISOString();
        const importSummary: ProjectImportSummary = {
          id: `import-${projectId}`,
          state: "stored",
          sourceFileName: file.name,
          sourceMimeType: file.type || "application/octet-stream",
          sourceSha256: `sha256-${projectId}`,
          fileSizeBytes: file.size,
          createdAt: timestamp,
          updatedAt: timestamp,
          failureMessage: null,
        };
        const updatedProject: ProjectDetailResponse = {
          ...project,
          imports: [importSummary, ...project.imports],
          updatedAt: timestamp,
        };
        projects.set(projectId, updatedProject);

        return (
          (await options.importFileImpl?.(projectId, file)) ?? {
            project: updatedProject,
            import: importSummary,
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
