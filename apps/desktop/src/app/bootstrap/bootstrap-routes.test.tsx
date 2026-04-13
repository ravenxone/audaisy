import { screen, waitFor } from "@testing-library/react";

import { createInMemoryTemporaryLocalBootstrapSupport } from "@/app/bootstrap/adapters/in-memory-local-bootstrap";
import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("bootstrap routing", () => {
  it("routes to /library when runtime is healthy and models are ready", async () => {
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Active Jobs" });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
  });

  it("routes to /onboarding when models are not ready", async () => {
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
            message: "Models not installed",
          },
        ],
      },
    });

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
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

  it("shows a visible onboarding error when temporary local profile support fails", async () => {
    const client = createInMemoryAudaisyClient();
    const temporaryLocalBootstrapSupport = createInMemoryTemporaryLocalBootstrapSupport({
      getLocalProfileImpl: async () => {
        throw new Error("Local profile unavailable");
      },
    });

    renderApp({ client, temporaryLocalBootstrapSupport, initialEntries: ["/onboarding"] });

    expect(await screen.findByRole("heading", { name: "Onboarding issue" })).toBeInTheDocument();
    expect(screen.getByText("Local profile unavailable")).toBeInTheDocument();
  });
});
