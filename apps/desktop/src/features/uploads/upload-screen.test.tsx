import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateImportResponse, ProjectDetailResponse } from "@audaisy/contracts";

import { renderApp } from "@/test/render-app";
import { createDeferred, createFile } from "@/test/test-utils";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

const SEEDED_PROJECTS: ProjectDetailResponse[] = [
  {
    id: "sample-project",
    title: "Sample Project",
    chapters: [
      { id: "sample-1", title: "Chapter 1", order: 1, warningCount: 0 },
      { id: "sample-2", title: "Chapter 2", order: 2, warningCount: 0 },
      { id: "sample-3", title: "Chapter 3", order: 3, warningCount: 0 },
    ],
    imports: [],
    defaultVoicePresetId: null,
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
    lastOpenedAt: "2026-04-13T12:00:00.000Z",
  },
  {
    id: "your-first-project",
    title: "Your first Project",
    chapters: [],
    imports: [],
    defaultVoicePresetId: null,
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
    lastOpenedAt: "2026-04-13T12:00:00.000Z",
  },
];

function createFileList(files: File[]) {
  return {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
}

function createUploadRouteClient() {
  return createInMemoryAudaisyClient({
    initialProjects: SEEDED_PROJECTS,
  });
}

describe("Upload screen", () => {
  it("renders the dropzone and accepted format copy", async () => {
    const client = createUploadRouteClient();

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    expect(await screen.findByRole("heading", { name: "Your first Project" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload a file to get started" })).toBeInTheDocument();
    expect(screen.getByText("Click here or drop the file to start uploading")).toBeInTheDocument();
    expect(screen.getByText("Accepted formats")).toBeInTheDocument();
    expect(screen.getByText(".pdf, .txt, .md")).toBeInTheDocument();
    expect(screen.getByText("Downloads")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your first Project" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("upload-frame")).toBeInTheDocument();
  });

  it("shows the drag-over state", async () => {
    const client = createUploadRouteClient();

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    const dropzone = await screen.findByTestId("upload-dropzone");
    fireEvent.dragEnter(dropzone, {
      dataTransfer: { files: createFileList([createFile("chapter.txt", "text/plain")]) },
    });

    expect(dropzone).toHaveAttribute("data-state", "drag-over");

    fireEvent.dragLeave(dropzone);
    expect(dropzone).toHaveAttribute("data-state", "idle");
  });

  it("shows a UX error for an invalid file type", async () => {
    const client = createUploadRouteClient();

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    const dropzone = await screen.findByTestId("upload-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: createFileList([
          createFile("chapter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ]),
      },
    });

    expect(
      await screen.findByText("Please choose a .pdf, .txt, or .md file for this step."),
    ).toBeInTheDocument();
  });

  it("switches to a different project when another project is clicked in the navbar", async () => {
    const user = userEvent.setup();
    const client = createUploadRouteClient();

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    expect(await screen.findByRole("heading", { name: "Your first Project" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Sample Project" }));

    expect(await screen.findByRole("heading", { name: "Sample Project" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/sample-project");
    expect(screen.getByRole("link", { name: "Sample Project" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Your first Project" })).not.toHaveAttribute("aria-current");
  });

  it("creates a new untitled project from the navbar action", async () => {
    const user = userEvent.setup();
    const client = createUploadRouteClient();

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    await screen.findByRole("heading", { name: "Your first Project" });
    await user.click(screen.getByRole("button", { name: "Start something new +" }));

    await waitFor(() => {
      expect(client.calls.createProject).toBe(1);
      expect(window.location.pathname).not.toBe("/projects/your-first-project");
    });
    expect(await screen.findByRole("heading", { name: "Untitled Project" })).toBeInTheDocument();
  });

  it("deletes a project from the navbar and removes it from the list", async () => {
    const user = userEvent.setup();
    const client = createUploadRouteClient();

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    await screen.findByRole("heading", { name: "Your first Project" });
    await user.click(screen.getByRole("button", { name: "Delete project Sample Project" }));

    await waitFor(() => {
      expect(client.calls.deleteProject).toBe(1);
    });
    expect(screen.queryByRole("link", { name: "Sample Project" })).not.toBeInTheDocument();
  });

  it("shows an uploading state while the import is pending", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<CreateImportResponse>();
    const client = createInMemoryAudaisyClient({
      initialProjects: SEEDED_PROJECTS,
      importFileImpl: () => deferred.promise,
    });

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    const input = await screen.findByLabelText("Upload manuscript file");
    await user.upload(input, createFile("chapter.txt", "text/plain"));

    expect(await screen.findByText("Uploading file...")).toBeInTheDocument();

    await act(async () => {
      deferred.resolve({
        project: SEEDED_PROJECTS[1],
        import: {
          id: "import-1",
          state: "stored",
          sourceFileName: "chapter.txt",
          sourceMimeType: "text/plain",
          sourceSha256: "sha256-import-1",
          fileSizeBytes: 12,
          createdAt: "2026-04-13T12:00:00.000Z",
          updatedAt: "2026-04-13T12:00:00.000Z",
          failureMessage: null,
        },
      });
      await deferred.promise;
    });

    expect(
      await screen.findByText("Stored chapter.txt safely for import processing."),
    ).toBeInTheDocument();
  });

  it("does not trigger upload twice while pending", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<CreateImportResponse>();
    const client = createInMemoryAudaisyClient({
      initialProjects: SEEDED_PROJECTS,
      importFileImpl: () => deferred.promise,
    });

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    const input = await screen.findByLabelText("Upload manuscript file");
    const dropzone = screen.getByTestId("upload-dropzone");

    await user.upload(input, createFile("chapter.txt", "text/plain"));
    fireEvent.drop(dropzone, {
      dataTransfer: { files: createFileList([createFile("chapter-again.txt", "text/plain")]) },
    });

    expect(client.calls.importFile).toBe(1);

    await act(async () => {
      deferred.resolve({
        project: SEEDED_PROJECTS[1],
        import: {
          id: "import-1",
          state: "processing",
          sourceFileName: "chapter.txt",
          sourceMimeType: "text/plain",
          sourceSha256: "sha256-import-1",
          fileSizeBytes: 12,
          createdAt: "2026-04-13T12:00:00.000Z",
          updatedAt: "2026-04-13T12:00:00.000Z",
          failureMessage: null,
        },
      });
      await deferred.promise;
    });

    expect(await screen.findByText("Processing chapter.txt.")).toBeInTheDocument();
  });

  it("shows an upload error when the import fails", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient({
      initialProjects: SEEDED_PROJECTS,
      importFileImpl: async () => {
        throw new Error("Import failed");
      },
    });

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    const input = await screen.findByLabelText("Upload manuscript file");
    await user.upload(input, createFile("chapter.txt", "text/plain"));

    await waitFor(() => {
      expect(screen.getByText("Import failed. Please try another file or retry.")).toBeInTheDocument();
    });
  });

  it("shows a visible upload error when the runtime reports a failed import status", async () => {
    const user = userEvent.setup();
    const client = createInMemoryAudaisyClient({
      initialProjects: SEEDED_PROJECTS,
      importFileImpl: async () => ({
        project: SEEDED_PROJECTS[1],
        import: {
          id: "import-1",
          state: "failed",
          sourceFileName: "chapter.txt",
          sourceMimeType: "text/plain",
          sourceSha256: "sha256-import-1",
          fileSizeBytes: 12,
          createdAt: "2026-04-13T12:00:00.000Z",
          updatedAt: "2026-04-13T12:00:00.000Z",
          failureMessage: "Conversion failed",
        },
      }),
    });

    renderApp({ client, initialEntries: ["/projects/your-first-project"] });

    const input = await screen.findByLabelText("Upload manuscript file");
    await user.upload(input, createFile("chapter.txt", "text/plain"));

    expect(await screen.findByText("Import failed for chapter.txt. Please try another file or retry.")).toBeInTheDocument();
  });
});
