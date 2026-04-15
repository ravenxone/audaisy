import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RuntimeStatusResponse, StartModelDownloadResponse } from "@audaisy/contracts";

import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";
import { renderApp } from "@/test/render-app";

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

describe("OnboardingRoute", () => {
  it("shows the transient model interstitial only when profile completion reveals a real setup action", async () => {
    const user = userEvent.setup();
    let runtimeStatus = createRuntimeStatus();
    const startDownloadResponse: StartModelDownloadResponse = {
      result: "started",
      modelInstall: {
        ...runtimeStatus.modelInstall,
        state: "downloading",
        requestedTier: "tada-3b-q4",
        manifestVersion: "manifest-1",
        bytesDownloaded: 0,
        totalBytes: 1_000,
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    };
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
      getRuntimeStatusImpl: async () => runtimeStatus,
      startModelDownloadImpl: async () => {
        runtimeStatus = createRuntimeStatus({
          modelInstall: startDownloadResponse.modelInstall,
        });
        return startDownloadResponse;
      },
    });

    renderApp({ client, initialEntries: ["/onboarding"] });

    await user.type(await screen.findByLabelText("Name"), "Raven");
    await user.selectOptions(screen.getByLabelText("Avatar"), "sunflower-avatar");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("heading", { name: "Model setup" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start setup" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(client.calls.updateProfile).toBe(1);
    expect(client.calls.startModelDownload).toBe(1);
    expect(await screen.findByRole("heading", { name: "Downloading model" })).toBeInTheDocument();
  });

  it("uses truthful retry copy when profile completion lands in a retryable model state", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
      runtimeStatus: createRuntimeStatus({
        modelInstall: {
          state: "error",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 500,
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
          bytesDownloaded: 500,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:01:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    });

    renderApp({ client, initialEntries: ["/onboarding"] });

    await user.type(await screen.findByLabelText("Name"), "Raven");
    await user.selectOptions(screen.getByLabelText("Avatar"), "sunflower-avatar");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("heading", { name: "Retry model setup" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry setup" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(client.calls.startModelDownload).toBe(1);
  });

  it.each([
    {
      label: "unavailable",
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
      }),
    },
    {
      label: "downloading",
      runtimeStatus: createRuntimeStatus({
        modelInstall: {
          state: "downloading",
          requestedTier: "tada-3b-q4",
          resolvedTier: null,
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 100,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:00:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    },
    {
      label: "verifying",
      runtimeStatus: createRuntimeStatus({
        modelInstall: {
          state: "verifying",
          requestedTier: "tada-3b-q4",
          resolvedTier: "tada-3b-q4",
          manifestVersion: "manifest-1",
          checksumVerified: false,
          bytesDownloaded: 1_000,
          totalBytes: 1_000,
          updatedAt: "2026-04-13T12:00:00.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    },
  ])("skips the interstitial when model setup is already $label", async ({ runtimeStatus }) => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
      runtimeStatus,
    });

    renderApp({ client, initialEntries: ["/onboarding"] });

    await user.type(await screen.findByLabelText("Name"), "Raven");
    await user.selectOptions(screen.getByLabelText("Avatar"), "sunflower-avatar");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(screen.queryByRole("button", { name: "Start setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry setup" })).not.toBeInTheDocument();
    expect(client.calls.startModelDownload).toBe(0);
  });

  it("does not persist the model interstitial once profile setup is already complete", async () => {
    const client = createInMemoryAudaisyClient({
      runtimeStatus: createRuntimeStatus(),
    });

    renderApp({ client, initialEntries: ["/onboarding"] });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(
      screen.queryByText("We can start the local model setup now. Some features may stay unavailable until it finishes, but library and editing are already available."),
    ).not.toBeInTheDocument();
  });
});
