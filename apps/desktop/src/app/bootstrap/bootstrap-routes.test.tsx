import { screen, waitFor } from "@testing-library/react";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("bootstrap routing", () => {
  it("routes to /library when profile setup is complete", async () => {
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Active Jobs" });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(client.calls.getProfile).toBe(1);
  });

  it("routes to /onboarding when the profile is incomplete", async () => {
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    });

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
  });

  it("redirects direct /library access back to /onboarding when the profile is incomplete", async () => {
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    });

    renderApp({ client, initialEntries: ["/library"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
  });

  it("redirects direct project access back to /onboarding when the profile is incomplete", async () => {
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    });

    renderApp({ client, initialEntries: ["/projects/sample-project"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
  });

  it("still routes to /library when profile setup is complete but models are not ready", async () => {
    const client = createInMemoryAudaisyClient({
      runtimeStatus: {
        healthy: true,
        modelsReady: false,
        activeModelTier: null,
        canRun3BQuantized: true,
        availableDiskBytes: 100_000_000,
        minimumDiskFreeBytes: 10_000_000,
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
      },
    });

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Active Jobs" });
    expect(window.location.pathname).toBe("/library");
  });

  it("resolves unknown paths through the entry gate instead of bypassing onboarding", async () => {
    const client = createInMemoryAudaisyClient({
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    });

    renderApp({ client, initialEntries: ["/unknown-path"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
  });

  it("blocks direct /onboarding access when runtime startup is unhealthy", async () => {
    const client = createInMemoryAudaisyClient({
      runtimeStatus: {
        healthy: false,
      },
      profile: {
        id: "local",
        name: "",
        avatarId: null,
        hasCompletedProfileSetup: false,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    });

    renderApp({ client, initialEntries: ["/onboarding"] });

    expect(await screen.findByRole("heading", { name: "Startup issue" })).toBeInTheDocument();
    expect(screen.getByText("The local runtime did not report a healthy status.")).toBeInTheDocument();
  });

  it("shows a visible startup error when runtime readiness fails to load", async () => {
    const client = createInMemoryAudaisyClient({
      getRuntimeStatusImpl: async () => {
        throw new Error("Runtime offline");
      },
    });

    renderApp({ client, initialEntries: ["/"] });

    expect(await screen.findByRole("heading", { name: "Startup issue" })).toBeInTheDocument();
    expect(screen.getByText("Runtime offline")).toBeInTheDocument();
  });
});
