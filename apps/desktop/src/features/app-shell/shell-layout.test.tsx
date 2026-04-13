import { screen } from "@testing-library/react";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("AppShellLayout", () => {
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
