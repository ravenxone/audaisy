import { screen } from "@testing-library/react";

import { AppShell } from "@/features/app-shell/app-shell";
import { renderWithElement } from "@/test/render-app";

describe("AppShell", () => {
  it("renders the required primary sections and profile row", () => {
    renderWithElement(
      <AppShell
        projects={[
          {
            id: "sample-project",
            title: "Sample Project",
            chapterCount: 3,
            lastOpenedAt: null,
            activeJobCount: 0,
          },
        ]}
      >
        <div>Body</div>
      </AppShell>,
    );

    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trash" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Active Jobs" })).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Start something new +")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sample Project" })).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Raven")).toBeInTheDocument();
  });
});
