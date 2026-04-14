import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChapterDetailResponse, ProseMirrorNode } from "@audaisy/contracts";
import { describe, expect, it, vi } from "vitest";

import { ManuscriptEditor } from "@/features/projects/manuscript-editor";

function createChapter(id: string, text: string): ChapterDetailResponse {
  return {
    id,
    projectId: "project-1",
    title: `Chapter ${id}`,
    order: 1,
    revision: 1,
    editorDoc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: `${id}-paragraph-1` },
          content: [{ type: "text", text }],
        },
      ],
    },
    markdown: `${text}\n`,
    warnings: [],
    sourceDocumentRecordId: "import-1",
    createdAt: "2026-04-13T12:00:00.000Z",
    updatedAt: "2026-04-13T12:00:00.000Z",
  };
}

function blockNodes(editorDoc: ProseMirrorNode) {
  return (editorDoc.content ?? []).filter((node) => node.type === "heading" || node.type === "paragraph");
}

describe("ManuscriptEditor", () => {
  it("assigns block ids to newly created block nodes before save", async () => {
    const user = userEvent.setup();
    const chapter = createChapter("chapter-1", "Draft chapter");
    const saves: ProseMirrorNode[] = [];

    render(
      <ManuscriptEditor
        chapter={chapter}
        onSave={async (_chapterId, editorDoc) => {
          saves.push(editorDoc);
        }}
      />,
    );

    const editor = await screen.findByTestId("manuscript-editor");
    await user.click(editor);
    await user.keyboard("{Enter}Second paragraph");

    await waitFor(() => {
      expect(saves.length).toBeGreaterThan(0);
    });

    const latestSave = saves.at(-1);
    expect(latestSave).toBeDefined();
    expect(blockNodes(latestSave as ProseMirrorNode)).toHaveLength(2);
    expect(blockNodes(latestSave as ProseMirrorNode).every((node) => node.attrs?.blockId)).toBe(true);
  });

  it("flushes pending edits for the previous chapter before switching chapters", async () => {
    const user = userEvent.setup();
    const chapterOne = createChapter("chapter-1", "Draft chapter");
    const chapterTwo = createChapter("chapter-2", "Second chapter");
    const onSave = vi.fn(async () => {});

    const result = render(<ManuscriptEditor chapter={chapterOne} onSave={onSave} />);

    const editor = await screen.findByTestId("manuscript-editor");
    await user.click(editor);
    await user.keyboard(" updated");

    result.rerender(<ManuscriptEditor chapter={chapterTwo} onSave={onSave} />);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const saveCall = onSave.mock.calls[0];
    expect(saveCall).toBeDefined();
    if (!saveCall) {
      throw new Error("Expected the previous chapter to be saved before switching.");
    }
    const savedChapterId = saveCall[0];
    const savedEditorDoc = saveCall[1] as ProseMirrorNode;
    expect(savedChapterId).toBe("chapter-1");
    expect(blockNodes(savedEditorDoc).every((node) => node.attrs?.blockId)).toBe(true);
  });

  it("flushes pending edits when the editor unmounts", async () => {
    const user = userEvent.setup();
    const chapter = createChapter("chapter-1", "Draft chapter");
    const onSave = vi.fn(async () => {});

    const result = render(<ManuscriptEditor chapter={chapter} onSave={onSave} />);

    const editor = await screen.findByTestId("manuscript-editor");
    await user.click(editor);
    await user.keyboard(" updated");
    result.unmount();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const saveCall = onSave.mock.calls[0];
    expect(saveCall).toBeDefined();
    if (!saveCall) {
      throw new Error("Expected the pending chapter save to flush on unmount.");
    }
    expect(saveCall[0]).toBe("chapter-1");
  });
});
