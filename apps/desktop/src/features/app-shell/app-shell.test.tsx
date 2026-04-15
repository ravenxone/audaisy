import { screen } from "@testing-library/react";
import type { ProfileResponse, ProjectCard } from "@audaisy/contracts";
import userEvent from "@testing-library/user-event";

import { AppShell } from "@/features/app-shell/app-shell";
import { renderWithElement } from "@/test/render-app";

const PROFILE: ProfileResponse = {
  id: "local",
  name: "Raven",
  avatarId: "sunflower-avatar",
  hasCompletedProfileSetup: true,
  createdAt: "2026-04-13T12:00:00.000Z",
  updatedAt: "2026-04-13T12:00:00.000Z",
};

describe("AppShell", () => {
  const shellProps = {
    creatingProject: false,
    deletingProjectId: null,
    modelStatus: { label: "Model ready" },
    onCreateProject: () => {},
    onDeleteProject: () => {},
    projectActionError: null,
  } as const;

  it("renders the required primary sections and profile row", () => {
    const projects: ProjectCard[] = [
      {
        id: "sample-project",
        title: "Sample Project",
        chapterCount: 3,
        lastOpenedAt: null,
        activeJobCount: 0,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    ];

    renderWithElement(
      <AppShell {...shellProps} profile={PROFILE} projects={projects}>
        <div>Body</div>
      </AppShell>,
      { initialEntries: ["/library"] },
    );

    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Downloads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start something new +" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sample Project" })).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Raven")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-model-status")).toBeInTheDocument();
    expect(screen.getByLabelText("Audaisy brand")).toBeInTheDocument();
    expect(screen.getByLabelText("Sidebar toggle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Trash").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByText("Downloads").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByText("Settings").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sample Project" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Delete project Sample Project" })).toBeInTheDocument();
  });

  it("keeps downloads visible and highlights only the selected project on a project route", () => {
    const projects: ProjectCard[] = [
      {
        id: "sample-project",
        title: "Sample Project",
        chapterCount: 3,
        lastOpenedAt: null,
        activeJobCount: 0,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
      {
        id: "your-first-project",
        title: "Your first Project",
        chapterCount: 0,
        lastOpenedAt: null,
        activeJobCount: 0,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    ];

    renderWithElement(
      <AppShell {...shellProps} profile={PROFILE} projects={projects}>
        <div>Body</div>
      </AppShell>,
      { initialEntries: ["/projects/your-first-project"] },
    );

    expect(screen.getByText("Downloads")).toBeInTheDocument();
    expect(screen.getByText("Downloads").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Your first Project" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sample Project" })).not.toHaveAttribute("aria-current");
  });

  it("switches selected project rows when the route changes", async () => {
    const user = userEvent.setup();
    const projects: ProjectCard[] = [
      {
        id: "sample-project",
        title: "Sample Project",
        chapterCount: 3,
        lastOpenedAt: null,
        activeJobCount: 0,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
      {
        id: "your-first-project",
        title: "Your first Project",
        chapterCount: 0,
        lastOpenedAt: null,
        activeJobCount: 0,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    ];

    renderWithElement(
      <AppShell {...shellProps} profile={PROFILE} projects={projects}>
        <div>Body</div>
      </AppShell>,
      { initialEntries: ["/projects/sample-project"] },
    );

    expect(screen.getByRole("link", { name: "Sample Project" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "Your first Project" }));

    expect(screen.getByRole("link", { name: "Your first Project" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sample Project" })).not.toHaveAttribute("aria-current");
  });

  it("collapses and expands the sidebar from the toolbar button", async () => {
    const user = userEvent.setup();

    renderWithElement(
      <AppShell
        {...shellProps}
        profile={PROFILE}
        projects={[
          {
            id: "sample-project",
            title: "Sample Project",
            chapterCount: 3,
            lastOpenedAt: null,
            activeJobCount: 0,
            createdAt: "2026-04-13T12:00:00.000Z",
            updatedAt: "2026-04-13T12:00:00.000Z",
          },
        ]}
      >
        <div>Body</div>
      </AppShell>,
      { initialEntries: ["/library"] },
    );

    const toggle = screen.getByRole("button", { name: "Sidebar toggle" });
    const sidebar = document.getElementById("audaisy-sidebar");

    expect(sidebar).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(screen.getByText("Main")).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByText("Body")).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(screen.getByText("Main")).toBeInTheDocument();
  });
});
