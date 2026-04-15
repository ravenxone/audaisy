import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChapterDetailResponse, CreateImportResponse, ProjectDetailResponse } from "@audaisy/contracts";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render-app";
import { createFile } from "@/test/test-utils";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";

describe("Project manuscript workspace", () => {
  it("polls a stored import until the first imported chapter opens in the workspace", async () => {
    const user = userEvent.setup();

    const emptyProject: ProjectDetailResponse = {
      id: "project-1",
      title: "Imported Book",
      chapters: [],
      imports: [],
      defaultVoicePresetId: null,
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:00:00.000Z",
      lastOpenedAt: "2026-04-13T12:00:00.000Z",
    };
    const storedProject: ProjectDetailResponse = {
      ...emptyProject,
      imports: [
        {
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
      ],
    };
    const completedProject: ProjectDetailResponse = {
      ...storedProject,
      chapters: [
        {
          id: "chapter-1",
          title: "Chapter One",
          order: 1,
          warningCount: 0,
          sourceDocumentRecordId: "import-1",
        },
      ],
      imports: [
        {
          ...storedProject.imports[0],
          state: "completed",
        },
      ],
    };
    const chapterDetail: ChapterDetailResponse = {
      id: "chapter-1",
      projectId: "project-1",
      title: "Chapter One",
      order: 1,
      revision: 1,
      editorDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "paragraph-1" },
            content: [{ type: "text", text: "Imported manuscript body." }],
          },
        ],
      },
      markdown: "Imported manuscript body.\n",
      warnings: [],
      sourceDocumentRecordId: "import-1",
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:00:00.000Z",
    };

    let phase: "idle" | "stored" | "completed" = "idle";
    const client = createInMemoryAudaisyClient({
      initialProjects: [emptyProject],
      initialChapterDetails: [chapterDetail],
      getProjectImpl: async () => {
        if (phase === "completed") {
          return completedProject;
        }
        return phase === "stored" ? storedProject : emptyProject;
      },
      importFileImpl: async (): Promise<CreateImportResponse> => {
        phase = "stored";
        return {
          project: storedProject,
          import: storedProject.imports[0],
        };
      },
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const input = await screen.findByLabelText("Upload manuscript file");
    await user.upload(input, createFile("chapter.txt", "text/plain", "hello world"));
    expect(
      await screen.findByText("Stored chapter.txt safely. Import processing will continue before editing is ready."),
    ).toBeInTheDocument();

    phase = "completed";

    expect(await screen.findByTestId("manuscript-toolbar", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(await screen.findByTestId("manuscript-editor", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Imported manuscript body.")).toBeInTheDocument();
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByText("Warnings")).not.toBeInTheDocument();
  });

  it("autosaves chapter edits and retries after a save failure", async () => {
    const user = userEvent.setup();

    const project: ProjectDetailResponse = {
      id: "project-1",
      title: "Existing Book",
      chapters: [
        {
          id: "chapter-1",
          title: "Chapter One",
          order: 1,
          warningCount: 0,
          sourceDocumentRecordId: "import-1",
        },
      ],
      imports: [],
      defaultVoicePresetId: null,
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:00:00.000Z",
      lastOpenedAt: "2026-04-13T12:00:00.000Z",
    };
    const chapterDetail: ChapterDetailResponse = {
      id: "chapter-1",
      projectId: "project-1",
      title: "Chapter One",
      order: 1,
      revision: 1,
      editorDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "paragraph-1" },
            content: [{ type: "text", text: "Draft chapter" }],
          },
        ],
      },
      markdown: "Draft chapter\n",
      warnings: [],
      sourceDocumentRecordId: "import-1",
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:00:00.000Z",
    };

    let saveAttempts = 0;
    const savedTexts: string[] = [];
    const client = createInMemoryAudaisyClient({
      initialProjects: [project],
      initialChapterDetails: [chapterDetail],
      updateChapterImpl: async (_projectId, chapterId, input) => {
        saveAttempts += 1;
        const savedText = input.editorDoc.content?.[0]?.content?.[0]?.text;
        savedTexts.push(typeof savedText === "string" ? savedText : "");
        expect(chapterId).toBe("chapter-1");
        if (saveAttempts === 1) {
          throw new Error("Runtime save failed");
        }
        return {
          ...chapterDetail,
          revision: chapterDetail.revision + saveAttempts,
          editorDoc: input.editorDoc,
          updatedAt: "2026-04-13T12:05:00.000Z",
        };
      },
    });

    renderApp({ client, initialEntries: ["/projects/project-1"] });

    const editor = await screen.findByTestId("manuscript-editor");
    await user.click(editor);
    await user.keyboard(" updated");

    expect(client.calls.updateChapter).toBe(0);

    await waitFor(() => {
      expect(client.calls.updateChapter).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(client.calls.updateChapter).toBe(2);
    }, { timeout: 4000 });
    expect(savedTexts.at(-1)).toContain("Draft chapter");
    expect(savedTexts.at(-1)).toContain("updated");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText(/Save failed\. Retrying automatically\./)).not.toBeInTheDocument();
  });

});
