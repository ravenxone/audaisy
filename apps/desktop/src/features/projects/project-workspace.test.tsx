import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ChapterDetailResponse,
  CreateRenderJobRequest,
  CreateImportResponse,
  ProjectDetailResponse,
  RenderJobResponse,
  RuntimeStatusResponse,
} from "@audaisy/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render-app";
import { createFile, createDeferred } from "@/test/test-utils";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

function createProject(overrides: Partial<ProjectDetailResponse> = {}): ProjectDetailResponse {
  return {
    id: "project-1",
    title: "Existing Book",
    chapters: [
      {
        id: "chapter-1",
        title: "Chapter One",
        order: 1,
        warningCount: 0,
        sourceDocumentRecordId: "import-1",
      },
    ],
    imports: [],
    defaultVoicePresetId: null,
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
    lastOpenedAt: "2026-04-13T12:00:00.000Z",
    ...overrides,
  };
}

function createChapter(overrides: Partial<ChapterDetailResponse> = {}): ChapterDetailResponse {
  return {
    id: "chapter-1",
    projectId: "project-1",
    title: "Chapter One",
    order: 1,
    revision: 1,
    editorDoc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "paragraph-1" },
          content: [{ type: "text", text: "Draft chapter" }],
        },
      ],
    },
    markdown: "Draft chapter\n",
    warnings: [],
    sourceDocumentRecordId: "import-1",
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
    ...overrides,
  };
}

function createRuntimeStatus(overrides: Partial<RuntimeStatusResponse> = {}): RuntimeStatusResponse {
  return {
    healthy: true,
    contractVersion: "0.2.1",
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
      manifestVersion: "manifest-1",
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

function buildRenderJob(
  status: RenderJobResponse["status"],
  overrides: Partial<RenderJobResponse> = {},
): RenderJobResponse {
  const hasAudio = status === "completed";

  return {
    id: `job-${status}`,
    projectId: "project-1",
    chapterId: "chapter-1",
    voicePresetId: "default-local-reference",
    modelTier: "tada-3b-q4",
    sourceChapterRevision: 1,
    status,
    segmentSummaries: [
      {
        id: `segment-${status}`,
        chapterId: "chapter-1",
        order: 1,
        status: status === "assembling" ? "completed" : status === "failed" ? "failed" : status,
        blockIds: ["paragraph-1"],
        hasAudio,
        audioArtifactId: hasAudio ? "artifact-segment-1" : null,
        startedAt: "2026-04-13T12:00:00.000Z",
        completedAt: hasAudio || status === "failed" ? "2026-04-13T12:02:00.000Z" : null,
        errorCode: status === "failed" ? "RENDER_GENERATION_FAILED" : null,
        errorMessage: status === "failed" ? "Render generation failed." : null,
      },
    ],
    hasAudio,
    audioArtifactId: hasAudio ? "artifact-job-1" : null,
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
    startedAt: status === "queued" ? null : "2026-04-13T12:00:30.000Z",
    completedAt: hasAudio || status === "failed" ? "2026-04-13T12:02:00.000Z" : null,
    errorCode: status === "failed" ? "RENDER_GENERATION_FAILED" : null,
    errorMessage: status === "failed" ? "Render generation failed." : null,
    ...overrides,
  };
}

describe("Project manuscript workspace", () => {
  it("polls a stored import until the first imported chapter opens in the workspace", async () => {
    const user = userEvent.setup();

    const emptyProject: ProjectDetailResponse = {
      id: "project-1",
      title: "Imported Book",
      chapters: [],
      imports: [],
      defaultVoicePresetId: null,
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:00:00.000Z",
      lastOpenedAt: "2026-04-13T12:00:00.000Z",
    };
    const storedProject: ProjectDetailResponse = {
      ...emptyProject,
      imports: [
        {
          id: "import-1",
          state: "stored",
          sourceFileName: "chapter.txt",
          sourceMimeType: "text/plain",
          sourceSha256: "sha256-import-1",
          fileSizeBytes: 12,
          createdAt: "2026-04-13T12:00:00.000Z",
          updatedAt: "2026-04-13T12:00:00.000Z",
          failureMessage: null,
        },
      ],
    };
    const completedProject: ProjectDetailResponse = {
      ...storedProject,
      chapters: [
        {
          id: "chapter-1",
          title: "Chapter One",
          order: 1,
          warningCount: 0,
          sourceDocumentRecordId: "import-1",
        },
      ],
      imports: [
        {
          ...storedProject.imports[0],
          state: "completed",
        },
      ],
    };
    const chapterDetail: ChapterDetailResponse = {
      ...createChapter(),
      title: "Chapter One",
      editorDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "paragraph-1" },
            content: [{ type: "text", text: "Imported manuscript body." }],
          },
        ],
      },
      markdown: "Imported manuscript body.\n",
      updatedAt: "2026-04-13T12:00:00.000Z",
    };

    let phase: "idle" | "stored" | "completed" = "idle";
    const client = createInMemoryAudaisyClient({
      initialProjects: [emptyProject],
      initialChapterDetails: [chapterDetail],
      getProjectImpl: async () => {
        if (phase === "completed") {
          return completedProject;
        }
        return phase === "stored" ? storedProject : emptyProject;
      },
      importFileImpl: async (): Promise<CreateImportResponse> => {
        phase = "stored";
        return {
          project: storedProject,
          import: storedProject.imports[0],
        };
      },
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const input = await screen.findByLabelText("Upload manuscript file");
    await user.upload(input, createFile("chapter.txt", "text/plain", "hello world"));
    expect(
      await screen.findByText("Stored chapter.txt safely. Import processing will continue before editing is ready."),
    ).toBeInTheDocument();

    phase = "completed";

    expect(await screen.findByTestId("manuscript-toolbar", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Audio" })).toBeInTheDocument();
    expect(await screen.findByTestId("manuscript-editor", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Imported manuscript body.")).toBeInTheDocument();
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByText("Warnings")).not.toBeInTheDocument();
  });

  it("autosaves chapter edits and retries after a save failure", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const chapterDetail = createChapter();

    let saveAttempts = 0;
    const savedTexts: string[] = [];
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      updateChapterImpl: async (_projectId, chapterId, input) => {
        saveAttempts += 1;
        const savedText = input.editorDoc.content?.[0]?.content?.[0]?.text;
        savedTexts.push(typeof savedText === "string" ? savedText : "");
        expect(chapterId).toBe("chapter-1");
        if (saveAttempts === 1) {
          throw new Error("Runtime save failed");
        }
        return {
          ...chapterDetail,
          revision: chapterDetail.revision + saveAttempts,
          editorDoc: input.editorDoc,
          updatedAt: "2026-04-13T12:05:00.000Z",
        };
      },
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const editor = await screen.findByTestId("manuscript-editor");
    await user.click(editor);
    await user.keyboard(" updated");

    expect(client.calls.updateChapter).toBe(0);

    await waitFor(() => {
      expect(client.calls.updateChapter).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(client.calls.updateChapter).toBe(2);
    }, { timeout: 4000 });
    expect(savedTexts.at(-1)).toContain("Draft chapter");
    expect(savedTexts.at(-1)).toContain("updated");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText(/Save failed\. Retrying automatically\./)).not.toBeInTheDocument();
  });

  it("gates the generate action from shared readiness state and shows a truthful blocked reason", async () => {
    const project = createProject();
    const chapterDetail = createChapter();
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      runtimeStatus: createRuntimeStatus({
        modelsReady: false,
        activeModelTier: null,
        modelInstall: {
          state: "not_installed",
          requestedTier: null,
          resolvedTier: null,
          manifestVersion: null,
          checksumVerified: false,
          bytesDownloaded: null,
          totalBytes: null,
          updatedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const button = await screen.findByRole("button", { name: "Generate Audio" });
    expect(button).toBeDisabled();
    expect(screen.getByTestId("manuscript-render-status")).toHaveTextContent("Model not installed");
  });

  it("starts a chapter render job with the active chapter payload only", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const chapterDetail = createChapter();
    const createRenderJobSpy = vi.fn<(projectId: string, input: CreateRenderJobRequest) => Promise<RenderJobResponse>>(
      async () => createRenderJobResponse,
    );
    const createRenderJobResponse = buildRenderJob("queued");
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      createRenderJobImpl: async (projectId, input) => createRenderJobSpy(projectId, input),
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    await user.click(await screen.findByRole("button", { name: "Generate Audio" }));

    await waitFor(() => {
      expect(createRenderJobSpy).toHaveBeenCalledWith("project-1", { chapterId: "chapter-1" });
    });
    expect(screen.getByTestId("manuscript-render-status")).toHaveTextContent("Queued");
  });

  it("polls honest queued, running, assembling, and completed states for the active chapter", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const chapterDetail = createChapter();
    const queuedJob = buildRenderJob("queued", { id: "job-1" });
    const runningJob = buildRenderJob("running", { id: "job-1", updatedAt: "2026-04-13T12:01:00.000Z" });
    const assemblingJob = buildRenderJob("assembling", { id: "job-1", updatedAt: "2026-04-13T12:02:00.000Z" });
    const completedJob = buildRenderJob("completed", { id: "job-1", updatedAt: "2026-04-13T12:03:00.000Z" });

    let pollCount = 0;
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      createRenderJobImpl: async () => queuedJob,
      getRenderJobImpl: async () => {
        pollCount += 1;
        if (pollCount === 1) {
          return runningJob;
        }
        if (pollCount === 2) {
          return assemblingJob;
        }
        return completedJob;
      },
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    await user.click(await screen.findByRole("button", { name: "Generate Audio" }));

    expect(screen.getByTestId("manuscript-render-status")).toHaveTextContent("Queued");
    expect(await screen.findByText("Running", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(await screen.findByText("Assembling", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(await screen.findByText("Completed", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play chapter audio" })).toBeEnabled();
  }, 7000);

  it("shows honest failure UI when the active render job fails", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const chapterDetail = createChapter();
    const queuedJob = buildRenderJob("queued", { id: "job-1" });
    const failedJob = buildRenderJob("failed", {
      id: "job-1",
      updatedAt: "2026-04-13T12:01:00.000Z",
      errorMessage: "Voice reference clip is missing.",
    });
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      createRenderJobImpl: async () => queuedJob,
      getRenderJobImpl: async () => failedJob,
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    await user.click(await screen.findByRole("button", { name: "Generate Audio" }));

    expect(screen.getByTestId("manuscript-render-status")).toHaveTextContent("Queued");
    expect(await screen.findByText("Failed", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("Voice reference clip is missing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Audio" })).toBeEnabled();
  }, 5000);

  it("enables playback for the latest completed chapter render and loads audio on demand", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const chapterDetail = createChapter();
    const completedJob = buildRenderJob("completed", { id: "job-complete" });
    const audioBlob = new Blob(["RIFF"], { type: "audio/wav" });
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      initialRenderJobs: [completedJob],
      initialRenderJobAudio: [{ jobId: "job-complete", audio: audioBlob }],
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const playButton = await screen.findByRole("button", { name: "Play chapter audio" });
    await waitFor(() => {
      expect(playButton).toBeEnabled();
    });

    await user.click(playButton);

    await waitFor(() => {
      expect(client.calls.getRenderJobAudio).toBe(1);
    });
    expect(globalThis.HTMLMediaElement.prototype.play).toHaveBeenCalled();

    const audioElement = screen.getByTestId("chapter-audio-element");
    Object.defineProperty(audioElement, "duration", {
      configurable: true,
      value: 37,
    });
    fireEvent.loadedMetadata(audioElement);
    Object.defineProperty(audioElement, "currentTime", {
      configurable: true,
      value: 5,
    });
    fireEvent.timeUpdate(audioElement);

    expect(screen.getByText("0:05")).toBeInTheDocument();
    expect(screen.getByText("0:37")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause chapter audio" }));
    expect(globalThis.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("flushes pending manuscript edits before starting a render job", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const chapterDetail = createChapter();
    const saveDeferred = createDeferred<ChapterDetailResponse>();
    const createRenderJobSpy = vi.fn<(projectId: string, input: CreateRenderJobRequest) => Promise<RenderJobResponse>>(
      async () => buildRenderJob("queued"),
    );
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      updateChapterImpl: async (_projectId, _chapterId, input) => {
        return saveDeferred.promise.then((chapter) => ({
          ...chapter,
          editorDoc: input.editorDoc,
        }));
      },
      createRenderJobImpl: async (projectId, input) => createRenderJobSpy(projectId, input),
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const editor = await screen.findByTestId("manuscript-editor");
    await user.click(editor);
    await user.keyboard(" updated");
    await user.click(screen.getByRole("button", { name: "Generate Audio" }));

    await waitFor(() => {
      expect(client.calls.updateChapter).toBe(1);
    });
    expect(createRenderJobSpy).not.toHaveBeenCalled();

    await act(async () => {
      saveDeferred.resolve({
        ...chapterDetail,
        revision: 2,
        updatedAt: "2026-04-13T12:05:00.000Z",
      });
      await saveDeferred.promise;
    });

    await waitFor(() => {
      expect(createRenderJobSpy).toHaveBeenCalledWith("project-1", { chapterId: "chapter-1" });
    });
  });
});
