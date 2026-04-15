import type { AudaisyClient } from "@/shared/api/client";
import type {
  ChapterDetailResponse,
  CreateImportResponse,
  CreateProjectRequest,
  ModelInstallStatus,
  PatchProfileRequest,
  ProfileResponse,
  ProjectImportSummary,
  ProjectCard,
  ProjectDetailResponse,
  ProseMirrorNode,
  RuntimeStatusResponse,
  StartModelDownloadRequest,
  StartModelDownloadResponse,
  UpdateChapterRequest,
} from "@audaisy/contracts";

type InMemoryClientOptions = {
  runtimeStatus?: Partial<RuntimeStatusResponse>;
  getRuntimeStatusImpl?: () => Promise<RuntimeStatusResponse>;
  startModelDownloadImpl?: (input: StartModelDownloadRequest) => Promise<StartModelDownloadResponse>;
  profile?: ProfileResponse;
  getProfileImpl?: () => Promise<ProfileResponse>;
  updateProfileImpl?: (input: PatchProfileRequest) => Promise<ProfileResponse>;
  listProjectsImpl?: () => Promise<ProjectCard[]>;
  createProjectImpl?: (input: CreateProjectRequest) => Promise<ProjectDetailResponse>;
  getProjectImpl?: (projectId: string) => Promise<ProjectDetailResponse>;
  getChapterImpl?: (projectId: string, chapterId: string) => Promise<ChapterDetailResponse>;
  updateChapterImpl?: (
    projectId: string,
    chapterId: string,
    input: UpdateChapterRequest,
  ) => Promise<ChapterDetailResponse>;
  deleteProjectImpl?: (projectId: string) => Promise<void>;
  importFileImpl?: (projectId: string, file: File) => Promise<CreateImportResponse>;
  initialProjects?: ProjectDetailResponse[];
  initialChapterDetails?: ChapterDetailResponse[];
};

type InMemoryAudaisyClient = AudaisyClient & {
  calls: {
    getRuntimeStatus: number;
    startModelDownload: number;
    getProfile: number;
    updateProfile: number;
    createProject: number;
    deleteProject: number;
    importFile: number;
    listProjects: number;
    getProject: number;
    getChapter: number;
    updateChapter: number;
  };
  factories: {
    project: (id: string, title: string) => ProjectDetailResponse;
    projectCard: (project: ProjectDetailResponse) => ProjectCard;
    chapterDetail: (chapterId: string, projectId: string, title: string, order?: number) => ChapterDetailResponse;
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
    supportedImportFormats: [".txt", ".md"],
    ...overrides,
  };
}

function buildProfile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: "local",
    name: "Raven",
    avatarId: "sunflower-avatar",
    hasCompletedProfileSetup: true,
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
    ...overrides,
  };
}

function paragraphNode(text: string, blockId: string): ProseMirrorNode {
  return {
    type: "paragraph",
    attrs: { blockId },
    content: [{ type: "text", text }],
  };
}

function createChapterDetailFactory(
  chapterId: string,
  projectId: string,
  title: string,
  order = 1,
): ChapterDetailResponse {
  const timestamp = new Date("2026-04-13T12:00:00.000Z").toISOString();
  return {
    id: chapterId,
    projectId,
    title,
    order,
    revision: 1,
    editorDoc: {
      type: "doc",
      content: [paragraphNode(`${title} body`, `${chapterId}-block-1`)],
    },
    markdown: `${title} body\n`,
    warnings: [],
    sourceDocumentRecordId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
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
            sourceDocumentRecordId: null,
          },
          {
            id: "sample-chapter-2",
            title: "Chapter 2",
            order: 2,
            warningCount: 0,
            sourceDocumentRecordId: null,
          },
          {
            id: "sample-chapter-3",
            title: "Chapter 3",
            order: 3,
            warningCount: 0,
            sourceDocumentRecordId: null,
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

function nextTimestamp() {
  return new Date("2026-04-13T12:00:00.000Z").toISOString();
}

function syncRuntimeStatusFromModelInstall(
  currentStatus: RuntimeStatusResponse,
  modelInstall: ModelInstallStatus,
): RuntimeStatusResponse {
  const modelsReady = modelInstall.state === "installed";

  return {
    ...currentStatus,
    modelsReady,
    activeModelTier: modelsReady ? modelInstall.resolvedTier : null,
    modelInstall,
  };
}

export function createInMemoryAudaisyClient(options: InMemoryClientOptions = {}): InMemoryAudaisyClient {
  let runtimeStatus = buildRuntimeStatus(options.runtimeStatus);
  let profile = options.profile ?? buildProfile();
  const calls = {
    getRuntimeStatus: 0,
    startModelDownload: 0,
    getProfile: 0,
    updateProfile: 0,
    createProject: 0,
    deleteProject: 0,
    importFile: 0,
    listProjects: 0,
    getProject: 0,
    getChapter: 0,
    updateChapter: 0,
  };

  const seededProjects = options.initialProjects ?? [createProjectFactory("sample-project", "Sample Project")];
  const projects = new Map<string, ProjectDetailResponse>(seededProjects.map((project) => [project.id, project]));
  const chapterDetails = new Map<string, ChapterDetailResponse>();

  for (const chapter of options.initialChapterDetails ?? []) {
    chapterDetails.set(chapter.id, chapter);
  }

  for (const project of seededProjects) {
    for (const chapter of project.chapters) {
      if (!chapterDetails.has(chapter.id)) {
        chapterDetails.set(chapter.id, createChapterDetailFactory(chapter.id, project.id, chapter.title, chapter.order));
      }
    }
  }

  function syncProject(project: ProjectDetailResponse) {
    projects.set(project.id, project);
    for (const chapter of project.chapters) {
      if (!chapterDetails.has(chapter.id)) {
        chapterDetails.set(chapter.id, createChapterDetailFactory(chapter.id, project.id, chapter.title, chapter.order));
      }
    }
  }

  const client: InMemoryAudaisyClient = {
    runtime: {
      getStatus: async () => {
        calls.getRuntimeStatus += 1;
        return (await options.getRuntimeStatusImpl?.()) ?? runtimeStatus;
      },
      startModelDownload: async (input) => {
        calls.startModelDownload += 1;
        const response =
          (await options.startModelDownloadImpl?.(input)) ?? {
            result: "started",
            modelInstall: {
              ...runtimeStatus.modelInstall,
              state: "downloading",
              requestedTier: runtimeStatus.defaultModelTier,
              resolvedTier: null,
              bytesDownloaded: 0,
              totalBytes: runtimeStatus.modelInstall.totalBytes,
              updatedAt: nextTimestamp(),
              lastErrorCode: null,
              lastErrorMessage: null,
            },
          };
        runtimeStatus = syncRuntimeStatusFromModelInstall(runtimeStatus, response.modelInstall);
        return response;
      },
    },
    profile: {
      get: async () => {
        calls.getProfile += 1;
        return (await options.getProfileImpl?.()) ?? profile;
      },
      update: async (input) => {
        calls.updateProfile += 1;
        const nextName = input.name ?? profile.name;
        const nextAvatarId = input.avatarId !== undefined ? input.avatarId : profile.avatarId;
        const nextProfile =
          (await options.updateProfileImpl?.(input)) ??
          buildProfile({
            ...profile,
            name: nextName,
            avatarId: nextAvatarId,
            hasCompletedProfileSetup: Boolean(nextName.trim() && nextAvatarId),
            updatedAt: nextTimestamp(),
          });
        profile = nextProfile;
        return nextProfile;
      },
    },
    projects: {
      list: async () => {
        calls.listProjects += 1;
        return (await options.listProjectsImpl?.()) ?? Array.from(projects.values()).map(createProjectCard);
      },
      create: async (input) => {
        calls.createProject += 1;
        const createdProject =
          (await options.createProjectImpl?.(input)) ?? createProjectFactory(slugifyTitle(input.title), input.title);
        syncProject(createdProject);
        return createdProject;
      },
      get: async (projectId) => {
        calls.getProject += 1;
        const project = (await options.getProjectImpl?.(projectId)) ?? projects.get(projectId);
        if (!project) {
          throw new Error(`Project ${projectId} was not found.`);
        }
        syncProject(project);
        return project;
      },
      getChapter: async (projectId, chapterId) => {
        calls.getChapter += 1;
        const project = projects.get(projectId);
        if (!project) {
          throw new Error(`Project ${projectId} was not found.`);
        }
        const chapter =
          (await options.getChapterImpl?.(projectId, chapterId)) ??
          chapterDetails.get(chapterId);
        if (!chapter) {
          throw new Error(`Chapter ${chapterId} was not found.`);
        }
        chapterDetails.set(chapterId, chapter);
        return chapter;
      },
      updateChapter: async (projectId, chapterId, input) => {
        calls.updateChapter += 1;
        const project = projects.get(projectId);
        if (!project) {
          throw new Error(`Project ${projectId} was not found.`);
        }
        const currentChapter = chapterDetails.get(chapterId);
        if (!currentChapter) {
          throw new Error(`Chapter ${chapterId} was not found.`);
        }
        const updatedChapter =
          (await options.updateChapterImpl?.(projectId, chapterId, input)) ?? {
            ...currentChapter,
            revision: currentChapter.revision + 1,
            editorDoc: input.editorDoc,
            updatedAt: nextTimestamp(),
          };
        chapterDetails.set(chapterId, updatedChapter);
        return updatedChapter;
      },
      delete: async (projectId) => {
        calls.deleteProject += 1;
        if (!projects.has(projectId)) {
          throw new Error(`Project ${projectId} was not found.`);
        }
        await options.deleteProjectImpl?.(projectId);
        projects.delete(projectId);
        for (const [chapterId, chapter] of chapterDetails) {
          if (chapter.projectId === projectId) {
            chapterDetails.delete(chapterId);
          }
        }
      },
      importFile: async (projectId, file) => {
        calls.importFile += 1;
        const project = projects.get(projectId);
        if (!project) {
          throw new Error(`Project ${projectId} was not found.`);
        }

        const timestamp = nextTimestamp();
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
        const storedProject: ProjectDetailResponse = {
          ...project,
          imports: [importSummary, ...project.imports],
          updatedAt: timestamp,
        };
        syncProject(storedProject);

        const response =
          (await options.importFileImpl?.(projectId, file)) ?? {
            project: storedProject,
            import: importSummary,
          };
        syncProject(response.project);
        return response;
      },
    },
    calls,
    factories: {
      project: createProjectFactory,
      projectCard: createProjectCard,
      chapterDetail: createChapterDetailFactory,
    },
  };

  return client;
}
