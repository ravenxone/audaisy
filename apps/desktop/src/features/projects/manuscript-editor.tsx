import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import type { ChapterDetailResponse, ProseMirrorNode } from "@audaisy/contracts";
import Document from "@tiptap/extension-document";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";

import styles from "@/features/projects/manuscript-editor.module.css";

const SAVE_DEBOUNCE_MS = 500;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;
const BLOCK_NODE_NAMES = new Set(["heading", "paragraph"]);
let fallbackBlockIdCounter = 0;

function createBlockId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  fallbackBlockIdCounter += 1;
  return `block-${fallbackBlockIdCounter}`;
}

const BlockDocument = Document.extend({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          let transaction = newState.tr;
          let changed = false;

          newState.doc.descendants((node, pos) => {
            if (!BLOCK_NODE_NAMES.has(node.type.name)) {
              return;
            }

            const blockId = node.attrs.blockId;
            if (typeof blockId === "string" && blockId.trim()) {
              return;
            }

            transaction = transaction.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: createBlockId() }, node.marks);
            changed = true;
          });

          return changed ? transaction : null;
        },
      }),
    ];
  },
});

const BlockParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) => (attributes.blockId ? { "data-block-id": String(attributes.blockId) } : {}),
      },
    };
  },
});

const BlockHeading = Heading.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) => (attributes.blockId ? { "data-block-id": String(attributes.blockId) } : {}),
      },
    };
  },
});

type ManuscriptEditorProps = {
  chapter: ChapterDetailResponse;
  onSave: (chapterId: string, editorDoc: ProseMirrorNode) => Promise<void>;
};

export type ManuscriptEditorHandle = {
  flushPendingSave: () => Promise<boolean>;
};

type QueuedSave = {
  chapterId: string;
  editorDoc: ProseMirrorNode;
};

export const ManuscriptEditor = forwardRef<ManuscriptEditorHandle, ManuscriptEditorProps>(function ManuscriptEditor(
  { chapter, onSave }: ManuscriptEditorProps,
  ref,
) {
  const onSaveRef = useRef(onSave);
  const currentChapterIdRef = useRef(chapter.id);
  const queuedSaveRef = useRef<QueuedSave | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const saveRequestRef = useRef<Promise<boolean> | null>(null);
  const retryAttemptRef = useRef(0);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const editor = useEditor({
    extensions: [BlockDocument, Text, BlockParagraph, BlockHeading],
    content: chapter.editorDoc,
    editorProps: {
      attributes: {
        class: styles.editorContent,
        "data-testid": "manuscript-editor",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      queuedSaveRef.current = {
        chapterId: currentChapterIdRef.current,
        editorDoc: currentEditor.getJSON() as ProseMirrorNode,
      };
      scheduleSave();
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    currentChapterIdRef.current = chapter.id;
    editor.commands.setContent(chapter.editorDoc, { emitUpdate: false });
    retryAttemptRef.current = 0;
    setSaveState("saved");
    return () => {
      void flushPendingSave(chapter.id);
    };
  }, [chapter.id, editor]);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  function clearTimeoutRef(timerRef: MutableRefObject<number | null>) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    clearTimeoutRef(saveTimerRef);
    clearTimeoutRef(retryTimerRef);
    saveTimerRef.current = window.setTimeout(() => {
      void flushQueuedSaves();
    }, delay);
  }

  function scheduleRetry() {
    clearTimeoutRef(retryTimerRef);
    const delay = Math.min(RETRY_BASE_MS * 2 ** retryAttemptRef.current, RETRY_MAX_MS);
    retryAttemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      void flushQueuedSaves();
    }, delay);
  }

  async function persistQueuedSave(snapshot: QueuedSave) {
    savingRef.current = true;
    if (mountedRef.current) {
      setSaveState("saving");
    }

    try {
      await onSaveRef.current(snapshot.chapterId, snapshot.editorDoc);
      retryAttemptRef.current = 0;
      if (queuedSaveRef.current === snapshot) {
        queuedSaveRef.current = null;
      }
      if (mountedRef.current) {
        setSaveState("saved");
      }
      return true;
    } catch {
      if (mountedRef.current) {
        setSaveState("error");
        scheduleRetry();
      }
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  async function flushQueuedSaves() {
    clearTimeoutRef(saveTimerRef);
    clearTimeoutRef(retryTimerRef);

    while (true) {
      if (savingRef.current) {
        const activeRequest = saveRequestRef.current;
        if (!activeRequest) {
          return false;
        }
        const didActiveSaveSucceed = await activeRequest;
        if (!didActiveSaveSucceed) {
          return false;
        }
        continue;
      }

      const snapshot = queuedSaveRef.current;
      if (!snapshot) {
        return true;
      }

      const request = persistQueuedSave(snapshot);
      saveRequestRef.current = request;
      const didSaveSucceed = await request;
      if (saveRequestRef.current === request) {
        saveRequestRef.current = null;
      }
      if (!didSaveSucceed) {
        return false;
      }
    }
  }

  async function flushPendingSave(chapterId: string) {
    const queuedSave = queuedSaveRef.current;
    if (!queuedSave || queuedSave.chapterId !== chapterId) {
      if (savingRef.current && currentChapterIdRef.current === chapterId) {
        return (await saveRequestRef.current) ?? false;
      }
      return true;
    }

    return flushQueuedSaves();
  }

  useImperativeHandle(
    ref,
    () => ({
      flushPendingSave: () => flushPendingSave(currentChapterIdRef.current),
    }),
    [],
  );

  return (
    <div
      aria-busy={saveState === "saving"}
      className={styles.editorShell}
      data-save-state={saveState}
      data-testid="manuscript-editor-shell"
    >
      <div className={styles.editorSurface}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
