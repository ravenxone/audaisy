import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "@/test/render-app";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("first-run integration flow", () => {
  it("creates a project from the home screen and lands on the upload welcome screen", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient();

    renderApp({ client, initialEntries: ["/home"] });

    await user.click(await screen.findByRole("button", { name: "Get started" }));

    expect(await screen.findByRole("heading", { name: "Upload a file to get started" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your first Project" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your first Project" })).toBeInTheDocument();
    expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
  });
});
