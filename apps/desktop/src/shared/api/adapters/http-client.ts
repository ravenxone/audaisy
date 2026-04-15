import type {
  ApiErrorCode,
  ChapterDetailResponse,
  CreateImportResponse,
  CreateProjectRequest,
  ErrorEnvelope,
  ListProjectsResponse,
  PatchProfileRequest,
  ProfileResponse,
  ProjectDetailResponse,
  RuntimeStatusResponse,
  StartModelDownloadRequest,
  StartModelDownloadResponse,
  UpdateChapterRequest,
} from "@audaisy/contracts";

import type { AudaisyClient } from "@/shared/api/client";

type FetchLike = typeof fetch;

type HttpAudaisyClientOptions = {
  baseUrl: string;
  fetchImpl?: FetchLike;
};

export class AudaisyApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | null;

  constructor(message: string, options: { status: number; code: ApiErrorCode | null }) {
    super(message);
    this.name = "AudaisyApiError";
    this.status = options.status;
    this.code = options.code;
  }
}

function buildUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function parseError(response: Response): Promise<AudaisyApiError> {
  const fallbackMessage = `Runtime request failed with status ${response.status}.`;
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return new AudaisyApiError(fallbackMessage, {
      status: response.status,
      code: null,
    });
  }

  try {
    const body = (await response.json()) as ErrorEnvelope;
    return new AudaisyApiError(body.error.message, {
      status: response.status,
      code: body.error.code,
    });
  } catch {
    return new AudaisyApiError(fallbackMessage, {
      status: response.status,
      code: null,
    });
  }
}

async function requestJson<T>(fetchImpl: FetchLike, baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(buildUrl(baseUrl, path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

async function requestVoid(fetchImpl: FetchLike, baseUrl: string, path: string, init?: RequestInit): Promise<void> {
  const response = await fetchImpl(buildUrl(baseUrl, path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }
}

export function createHttpAudaisyClient(options: HttpAudaisyClientOptions): AudaisyClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    runtime: {
      getStatus: () => requestJson<RuntimeStatusResponse>(fetchImpl, options.baseUrl, "/runtime/status"),
      startModelDownload: (input) =>
        requestJson<StartModelDownloadResponse>(fetchImpl, options.baseUrl, "/runtime/models/download", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input satisfies StartModelDownloadRequest),
        }),
    },
    profile: {
      get: () => requestJson<ProfileResponse>(fetchImpl, options.baseUrl, "/profile"),
      update: (input) =>
        requestJson<ProfileResponse>(fetchImpl, options.baseUrl, "/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input satisfies PatchProfileRequest),
        }),
    },
    projects: {
      list: async () => {
        const response = await requestJson<ListProjectsResponse>(fetchImpl, options.baseUrl, "/projects");
        return response.projects;
      },
      create: (input) =>
        requestJson<ProjectDetailResponse>(fetchImpl, options.baseUrl, "/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input satisfies CreateProjectRequest),
        }),
      get: (projectId) =>
        requestJson<ProjectDetailResponse>(fetchImpl, options.baseUrl, `/projects/${encodeURIComponent(projectId)}`),
      getChapter: (projectId, chapterId) =>
        requestJson<ChapterDetailResponse>(
          fetchImpl,
          options.baseUrl,
          `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
        ),
      updateChapter: (projectId, chapterId, input) =>
        requestJson<ChapterDetailResponse>(
          fetchImpl,
          options.baseUrl,
          `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(input satisfies UpdateChapterRequest),
          },
        ),
      delete: (projectId) =>
        requestVoid(fetchImpl, options.baseUrl, `/projects/${encodeURIComponent(projectId)}`, {
          method: "DELETE",
        }),
      importFile: (projectId, file) => {
        const formData = new FormData();
        formData.append("file", file);

        return requestJson<CreateImportResponse>(fetchImpl, options.baseUrl, `/projects/${encodeURIComponent(projectId)}/imports`, {
          method: "POST",
          body: formData,
        });
      },
    },
  };
}
