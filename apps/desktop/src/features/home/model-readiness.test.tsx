import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RuntimeStatusResponse } from "@audaisy/contracts";
import { describe, expect, it } from "vitest";

import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";
import { renderApp } from "@/test/render-app";
import { createDeferred } from "@/test/test-utils";

function createRuntimeStatus(overrides: Partial<RuntimeStatusResponse> = {}): RuntimeStatusResponse {
  return {
    healthy: true,
    contractVersion: "0.1.0",
    modelsReady: false,
    activeModelTier: null,
    defaultModelTier: "tada-3b-q4",
    canRun3BQuantized: true,
    diskReady: true,
    availableDiskBytes: 64_000_000_000,
    minimumDiskFreeBytes: 8_000_000_000,
    blockingIssues: [],
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
    ...overrides,
  };
}

describe("Library model readiness", () => {
  it("polls runtime status once per interval from the app-level provider and stops after install completes", async () => {
    const statuses = [
      createRuntimeStatus({
        modelInstall: {
          state: "downloading",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 250,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:00:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
      createRuntimeStatus({
        modelInstall: {
          state: "verifying",
          requestedTier: "tada-3b-q4",
          resolvedTier: "tada-3b-q4",
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 1_000,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:01:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
      createRuntimeStatus({
        modelsReady: true,
        activeModelTier: "tada-3b-q4",
        modelInstall: {
          state: "installed",
          requestedTier: "tada-3b-q4",
          resolvedTier: "tada-3b-q4",
          manifestVersion: "manifest-1",
          checksumVerified: true,
          bytesDownloaded: 1_000,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:02:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    ];
    let index = 0;
    const client = createInMemoryAudaisyClient({
      getRuntimeStatusImpl: async () => statuses[Math.min(index++, statuses.length - 1)],
    });

    renderApp({ client, initialEntries: ["/library"] });

    expect(await screen.findByRole("heading", { name: "Downloading model" })).toBeInTheDocument();
    expect(client.calls.getRuntimeStatus).toBe(1);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Verifying model" })).toBeInTheDocument();
    }, { timeout: 2000 });
    expect(await screen.findByRole("heading", { name: "Verifying model" })).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(client.calls.getRuntimeStatus).toBe(2);

    await waitFor(() => {
      expect(screen.queryByTestId("library-model-panel")).not.toBeInTheDocument();
    }, { timeout: 2000 });
    expect(screen.queryByRole("heading", { name: "Model ready" })).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar-model-status")).toHaveTextContent("Model ready");
    expect(screen.getByRole("button", { name: "Dismiss model status" })).toBeInTheDocument();
    expect(client.calls.getRuntimeStatus).toBe(3);

    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    expect(client.calls.getRuntimeStatus).toBe(3);
  }, 7000);

  it("renders unavailable runtime state honestly without an install action", async () => {
    const client = createInMemoryAudaisyClient({
      runtimeStatus: createRuntimeStatus({
        modelInstall: {
          state: "unavailable",
          requestedTier: null,
          resolvedTier: null,
          manifestVersion: null,
          checksumVerified: false,
          bytesDownloaded: null,
          totalBytes: null,
          updatedAt: "2026-04-13T12:00:00.000Z",
          lastErrorCode: "UNSUPPORTED_HARDWARE",
          lastErrorMessage: "Apple Silicon with 16 GB unified memory is required.",
        },
        blockingIssues: [
          {
            code: "UNSUPPORTED_HARDWARE",
            message: "Apple Silicon with 16 GB unified memory is required.",
          },
        ],
      }),
    });

    renderApp({ client, initialEntries: ["/library"] });

    expect(await screen.findByRole("heading", { name: "Model unavailable" })).toBeInTheDocument();
    expect(screen.getAllByText("Apple Silicon with 16 GB unified memory is required.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Start setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry setup" })).not.toBeInTheDocument();
  });

  it("renders failed install state honestly and exposes retry from shared readiness state", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient({
      runtimeStatus: createRuntimeStatus({
        modelInstall: {
          state: "error",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 512,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:00:00.000Z",
          lastErrorCode: "MODEL_DOWNLOAD_FAILED",
          lastErrorMessage: "Network connection dropped.",
        },
      }),
      startModelDownloadImpl: async () => ({
        result: "started",
        modelInstall: {
          state: "downloading",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 512,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:01:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    });

    renderApp({ client, initialEntries: ["/library"] });

    expect(await screen.findByRole("heading", { name: "Model setup failed" })).toBeInTheDocument();
    expect(screen.getAllByText("Network connection dropped.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Retry setup" }));

    await waitFor(() => {
      expect(client.calls.startModelDownload).toBe(1);
    });
  });

  it("serializes runtime status refreshes while retry kicks polling back on", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<RuntimeStatusResponse>();
    let getStatusCalls = 0;
    const client = createInMemoryAudaisyClient({
      runtimeStatus: createRuntimeStatus({
        modelInstall: {
          state: "error",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 512,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:00:00.000Z",
          lastErrorCode: "MODEL_DOWNLOAD_FAILED",
          lastErrorMessage: "Network connection dropped.",
        },
      }),
      getRuntimeStatusImpl: async () => {
        getStatusCalls += 1;
        return getStatusCalls === 1
          ? createRuntimeStatus({
              modelInstall: {
                state: "error",
                requestedTier: "tada-3b-q4",
                resolvedTier: null,
                manifestVersion: "manifest-1",
                checksumVerified: false,
                bytesDownloaded: 512,
                totalBytes: 1_000,
                updatedAt: "2026-04-13T12:00:00.000Z",
                lastErrorCode: "MODEL_DOWNLOAD_FAILED",
                lastErrorMessage: "Network connection dropped.",
              },
            })
          : deferred.promise;
      },
      startModelDownloadImpl: async () => ({
        result: "started",
        modelInstall: {
          state: "downloading",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 512,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:01:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    });

    renderApp({ client, initialEntries: ["/library"] });

    await user.click(await screen.findByRole("button", { name: "Retry setup" }));

    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    expect(client.calls.getRuntimeStatus).toBe(2);

    deferred.resolve(
      createRuntimeStatus({
        modelsReady: true,
        activeModelTier: "tada-3b-q4",
        modelInstall: {
          state: "installed",
          requestedTier: "tada-3b-q4",
          resolvedTier: "tada-3b-q4",
          manifestVersion: "manifest-1",
          checksumVerified: true,
          bytesDownloaded: 1_000,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:02:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId("library-model-panel")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-model-status")).toHaveTextContent("Model ready");
  }, 7000);
});
