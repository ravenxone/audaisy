import { screen } from "@testing-library/react";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("Home screen", () => {
  it("renders the expected headings and CTA", async () => {
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/library"] });

    expect(await screen.findByRole("heading", { name: "Active Jobs" })).toBeInTheDocument();
    expect(screen.getByText("You have no jobs running at the moment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it Works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload a file" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Check the imported text" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Generate audio and share!" })).toBeInTheDocument();
  });
});
