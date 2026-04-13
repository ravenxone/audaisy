import type { TemporaryLocalProfile } from "@/app/bootstrap/temporary-local-bootstrap";
import { screen } from "@testing-library/react";

import { AppShell } from "@/features/app-shell/app-shell";
import { renderWithElement } from "@/test/render-app";

describe("AppShell", () => {
  it("renders the required primary sections and profile row", () => {
    const profile: TemporaryLocalProfile = {
      name: "Raven",
      avatar: "sunflower-avatar",
    };

    renderWithElement(
      <AppShell
        profile={profile}
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
    );

    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Active Jobs")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Start something new +")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sample Project" })).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Raven")).toBeInTheDocument();
    expect(screen.getByLabelText("Audaisy brand")).toBeInTheDocument();
    expect(screen.getByLabelText("Sidebar toggle")).toBeInTheDocument();
    expect(screen.getByText("Trash").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByText("Active Jobs").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByText("Settings").closest("[aria-disabled='true']")).not.toBeNull();
  });
});
