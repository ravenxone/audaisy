import type {
  ChapterDetailResponse,
  CreateImportResponse,
  ListProjectsResponse,
  ProfileResponse,
  ProjectDetailResponse,
  RuntimeStatusResponse,
  StartModelDownloadResponse,
} from "@audaisy/contracts";
import { describe, expect, it, vi } from "vitest";

import { AudaisyApiError, createHttpAudaisyClient } from "@/shared/api/adapters/http-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("createHttpAudaisyClient", () => {
  it("uses the canonical runtime status contract", async () => {
    const payload: RuntimeStatusResponse = {
      healthy: true,
      contractVersion: "0.1.0",
      modelsReady: false,
      activeModelTier: null,
      defaultModelTier: "tada-3b-q4",
      canRun3BQuantized: false,
      diskReady: true,
      availableDiskBytes: 64_000_000_000,
      minimumDiskFreeBytes: 15_000_000_000,
      blockingIssues: [
        {
          code: "MODELS_MISSING",
          message: "Required model assets are not installed yet.",
        },
      ],
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
      supportedImportFormats: [".txt", ".md"],
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(payload));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.runtime.getStatus()).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/runtime/status",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("posts the canonical model download request", async () => {
    const payload: StartModelDownloadResponse = {
      result: "started",
      modelInstall: {
        state: "downloading",
        requestedTier: "tada-3b-q4",
        resolvedTier: null,
        manifestVersion: "manifest-1",
        checksumVerified: false,
        bytesDownloaded: 0,
        totalBytes: 1_000,
        updatedAt: "2026-04-13T12:00:00.000Z",
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(payload, 202));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.runtime.startModelDownload({})).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/runtime/models/download",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({}),
      }),
    );
  });

  it("uses the canonical profile contract for get and patch", async () => {
    const payload: ProfileResponse = {
      id: "local",
      name: "Raven",
      avatarId: "sunflower-avatar",
      hasCompletedProfileSetup: true,
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:05:00.000Z",
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => jsonResponse(payload))
      .mockImplementationOnce(async () => jsonResponse(payload));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.profile.get()).resolves.toEqual(payload);
    await expect(client.profile.update({ name: "Raven", avatarId: "sunflower-avatar" })).resolves.toEqual(payload);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/profile",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Raven", avatarId: "sunflower-avatar" }),
      }),
    );
  });

  it("unwraps the projects list response", async () => {
    const payload: ListProjectsResponse = {
      projects: [
        {
          id: "project-1",
          title: "Project One",
          chapterCount: 0,
          lastOpenedAt: null,
          activeJobCount: 0,
          createdAt: "2026-04-13T12:00:00.000Z",
          updatedAt: "2026-04-13T12:00:00.000Z",
        },
      ],
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(payload));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.projects.list()).resolves.toEqual(payload.projects);
  });

  it("posts project creation JSON using canonical request and response shapes", async () => {
    const payload: ProjectDetailResponse = {
      id: "project-1",
      title: "Project One",
      chapters: [],
      imports: [],
      defaultVoicePresetId: null,
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:00:00.000Z",
      lastOpenedAt: "2026-04-13T12:00:00.000Z",
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(payload));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.projects.create({ title: "Project One" })).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ title: "Project One" }),
      }),
    );
  });

  it("deletes a project with the canonical runtime path", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.projects.delete("project-1")).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/project-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("posts multipart imports and returns the canonical import envelope", async () => {
    const payload: CreateImportResponse = {
      project: {
        id: "project-1",
        title: "Project One",
        chapters: [],
        imports: [],
        defaultVoicePresetId: null,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
        lastOpenedAt: "2026-04-13T12:00:00.000Z",
      },
      import: {
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
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(payload));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });
    const file = new File(["hello world"], "chapter.txt", { type: "text/plain" });

    await expect(client.projects.importFile("project-1", file)).resolves.toEqual(payload);

    const [, request] = fetchImpl.mock.calls[0];
    expect(request?.method).toBe("POST");
    expect(request?.body).toBeInstanceOf(FormData);
    const sentFile = (request?.body as FormData).get("file");
    expect(sentFile).toBe(file);
  });

  it("gets and patches chapter content with the canonical nested project routes", async () => {
    const chapterPayload: ChapterDetailResponse = {
      id: "chapter-1",
      projectId: "project-1",
      title: "Chapter One",
      order: 1,
      revision: 2,
      editorDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "paragraph-1" },
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      },
      markdown: "Hello world\n",
      warnings: [],
      sourceDocumentRecordId: "import-1",
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:05:00.000Z",
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => jsonResponse(chapterPayload))
      .mockImplementationOnce(async () => jsonResponse(chapterPayload));
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.projects.getChapter("project-1", "chapter-1")).resolves.toEqual(chapterPayload);
    await expect(
      client.projects.updateChapter("project-1", "chapter-1", {
        editorDoc: chapterPayload.editorDoc,
      }),
    ).resolves.toEqual(chapterPayload);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/projects/project-1/chapters/chapter-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/projects/project-1/chapters/chapter-1",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          editorDoc: chapterPayload.editorDoc,
        }),
      }),
    );
  });

  it("throws a typed API error for non-2xx responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request body.",
          },
        },
        422,
      ),
    );
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.profile.update({ name: "Raven" })).rejects.toMatchObject(
      new AudaisyApiError("Invalid request body.", {
        status: 422,
        code: "INVALID_REQUEST",
      }),
    );
  });
});
