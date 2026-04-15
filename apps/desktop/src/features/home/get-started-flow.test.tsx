import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectDetailResponse } from "@audaisy/contracts";

import { renderApp } from "@/test/render-app";
import { createDeferred } from "@/test/test-utils";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("Create project flow", () => {
  it("triggers project creation exactly once", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<ProjectDetailResponse>();
    const client = createInMemoryAudaisyClient({
      createProjectImpl: () => deferred.promise,
    });

    renderApp({ client, initialEntries: ["/library"] });

    const cta = await screen.findByRole("button", { name: "Get started" });
    await user.click(cta);
    await user.click(cta);

    expect(client.calls.createProject).toBe(1);

    await act(async () => {
      deferred.resolve(client.factories.project("created-project", "Your first Project"));
      await deferred.promise;
    });
  });

  it("shows a loading and disabled state while pending", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<ProjectDetailResponse>();
    const client = createInMemoryAudaisyClient({
      createProjectImpl: () => deferred.promise,
    });

    renderApp({ client, initialEntries: ["/library"] });

    const cta = await screen.findByRole("button", { name: "Get started" });
    await user.click(cta);

    expect(cta).toBeDisabled();
    expect(screen.getByText("Creating project...")).toBeInTheDocument();

    await act(async () => {
      deferred.resolve(client.factories.project("created-project", "Your first Project"));
      await deferred.promise;
    });
  });

  it("redirects to the project welcome upload route on success", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/library"] });

    await user.click(await screen.findByRole("button", { name: "Get started" }));

    await screen.findByRole("heading", { name: "Upload a file to get started" });
    expect(window.location.pathname).toBe("/projects/your-first-project");
  });

  it("refreshes the sidebar project list after create and navigation", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/library"] });

    await user.click(await screen.findByRole("button", { name: "Get started" }));

    await screen.findByRole("heading", { name: "Your first Project" });
    expect(screen.getByRole("link", { name: "Your first Project" })).toHaveAttribute("aria-current", "page");
  });

  it("shows a visible error UI on failure", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient({
      createProjectImpl: async () => {
        throw new Error("Unable to create project");
      },
    });

    renderApp({ client, initialEntries: ["/library"] });

    await user.click(await screen.findByRole("button", { name: "Get started" }));

    expect(await screen.findByText("Unable to create project. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("retries creation after a failure", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const client = createInMemoryAudaisyClient({
      createProjectImpl: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error("Unable to create project");
        }

        return client.factories.project("your-first-project", "Your first Project");
      },
    });

    renderApp({ client, initialEntries: ["/library"] });

    await user.click(await screen.findByRole("button", { name: "Get started" }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/your-first-project");
    });
  });
});
