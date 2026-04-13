import type { CreateImportResponse, ListProjectsResponse, ProjectDetailResponse, RuntimeStatusResponse } from "@audaisy/contracts";
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
        state: "unavailable",
        requestedTier: null,
        resolvedTier: null,
        manifestVersion: null,
        checksumVerified: false,
        bytesDownloaded: null,
        totalBytes: null,
        updatedAt: null,
        lastErrorCode: "MODEL_DOWNLOAD_UNAVAILABLE",
        lastErrorMessage: "Model download is not implemented in this runtime slice yet.",
      },
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

  it("throws a typed API error for non-2xx responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: {
            code: "MODEL_DOWNLOAD_UNAVAILABLE",
            message: "Model download is not implemented in this runtime slice yet.",
          },
        },
        501,
      ),
    );
    const client = createHttpAudaisyClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.runtime.getStatus()).rejects.toMatchObject(
      new AudaisyApiError("Model download is not implemented in this runtime slice yet.", {
        status: 501,
        code: "MODEL_DOWNLOAD_UNAVAILABLE",
      }),
    );
  });
});
