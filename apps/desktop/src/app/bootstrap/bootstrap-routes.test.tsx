import { screen, waitFor } from "@testing-library/react";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("bootstrap routing", () => {
  it("routes to /library when runtime is healthy, models are ready, and profile exists", async () => {
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Active Jobs" });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
  });

  it("routes to /onboarding when the profile is missing", async () => {
    const client = createInMemoryAudaisyClient({
      profile: { name: "", avatar: null },
    });

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
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
        blockingIssues: ["Models not installed"],
      },
    });

    renderApp({ client, initialEntries: ["/"] });

    await screen.findByRole("heading", { name: "Welcome to Audaisy" });
    expect(window.location.pathname).toBe("/onboarding");
  });
});
