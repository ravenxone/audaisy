import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectDetailResponse } from "@audaisy/contracts";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("AppShellLayout", () => {
  it("does not refetch project navigation when switching between already loaded projects", async () => {
    const user = userEvent.setup();
    const seededProjects: ProjectDetailResponse[] = [
      {
        id: "project-a",
        title: "Untitled Project",
        chapters: [],
        imports: [],
        defaultVoicePresetId: null,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
        lastOpenedAt: "2026-04-13T12:00:00.000Z",
      },
      {
        id: "project-b",
        title: "Untitled Project",
        chapters: [],
        imports: [],
        defaultVoicePresetId: null,
        createdAt: "2026-04-13T12:05:00.000Z",
        updatedAt: "2026-04-13T12:05:00.000Z",
        lastOpenedAt: "2026-04-13T12:05:00.000Z",
      },
    ];
    let listCallCount = 0;
    let client = createInMemoryAudaisyClient();

    client = createInMemoryAudaisyClient({
      initialProjects: seededProjects,
      listProjectsImpl: async () => {
        listCallCount += 1;
        return seededProjects.map((project) => client.factories.projectCard(project));
      },
    });

    renderApp({ client, initialEntries: ["/projects/project-a"] });

    await screen.findByRole("heading", { name: "Untitled Project" });
    expect(listCallCount).toBe(1);

    const projectLinks = await screen.findAllByRole("link", { name: "Untitled Project" });
    await user.click(projectLinks[1]);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/project-b");
    });
    expect(listCallCount).toBe(1);
  });

  it("shows a visible workspace error when shell data fails to load", async () => {
    const client = createInMemoryAudaisyClient({
      listProjectsImpl: async () => {
        throw new Error("Projects unavailable");
      },
    });

    renderApp({ client, initialEntries: ["/home"] });

    expect(await screen.findByRole("heading", { name: "Workspace issue" })).toBeInTheDocument();
    expect(screen.getByText("Projects unavailable")).toBeInTheDocument();
  });
});
