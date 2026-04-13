import { screen } from "@testing-library/react";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("Home screen", () => {
  it("renders the expected headings and CTA", async () => {
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/home"] });

    expect(await screen.findByRole("heading", { name: "Active Jobs" })).toBeInTheDocument();
    expect(screen.getByText("You have no jobs running at the moment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it Works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload a file" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Check the imported text" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Generate audio and share!" })).toBeInTheDocument();
    expect(screen.queryByText("Library")).not.toBeInTheDocument();
    expect(screen.queryByText("Bring in a manuscript draft and let Audaisy prepare the first project workspace for it.")).not.toBeInTheDocument();
    expect(screen.queryByText("01")).not.toBeInTheDocument();
  });
});
