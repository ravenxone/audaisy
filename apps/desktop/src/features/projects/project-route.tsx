import { useEffect, useState } from "react";
import type { ChapterDetailResponse, ProjectDetailResponse, ProjectImportSummary, ProseMirrorNode } from "@audaisy/contracts";
import { useParams } from "react-router-dom";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { ManuscriptEditor } from "@/features/projects/manuscript-editor";
import styles from "@/features/projects/project-route.module.css";
import { UploadDropzone } from "@/features/uploads/upload-dropzone";
import { useAudaisyClient } from "@/shared/api/client-context";

type ProjectState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; project: ProjectDetailResponse };

type ChapterState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; chapter: ChapterDetailResponse };

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load project.";
}

function findPendingImportId(project: ProjectDetailResponse) {
  return project.imports.find((item) => item.state === "stored" || item.state === "processing")?.id ?? null;
}

function resolveActiveChapterId(project: ProjectDetailResponse, currentChapterId: string | null) {
  if (project.chapters.length === 0) {
    return null;
  }

  if (currentChapterId && project.chapters.some((chapter) => chapter.id === currentChapterId)) {
    return currentChapterId;
  }

  return project.chapters[0].id;
}

function getImportStatusCopy(importSummary: ProjectImportSummary | null) {
  if (!importSummary) {
    return null;
  }

  switch (importSummary.state) {
    case "stored":
      return {
        title: "Import stored",
        message: `${importSummary.sourceFileName} is stored locally. Chapter creation is still processing.`,
      };
    case "processing":
      return {
        title: "Import processing",
        message: `${importSummary.sourceFileName} is still being normalized into chapter content.`,
      };
    case "failed":
      return {
        title: "Import failed",
        message: importSummary.failureMessage ?? `Unable to create manuscript content from ${importSummary.sourceFileName}.`,
      };
    case "completed":
      return {
        title: "Import completed",
        message: `${importSummary.sourceFileName} finished importing. Loading the manuscript workspace.`,
      };
  }
}

export function ProjectRoute() {
  const { projectId = "" } = useParams();
  const client = useAudaisyClient();
  const { canUseModelRequiredFeatures, runtimeStatus } = useWorkspaceSession();
  const [projectState, setProjectState] = useState<ProjectState>({ status: "loading" });
  const [chapterState, setChapterState] = useState<ChapterState>({ status: "idle" });
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [trackedImportId, setTrackedImportId] = useState<string | null>(null);
  const acceptedFormats = runtimeStatus?.supportedImportFormats ?? [];

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      setProjectState({ status: "loading" });
      setChapterState({ status: "idle" });
      setActiveChapterId(null);
      setTrackedImportId(null);

      try {
        const project = await client.projects.get(projectId);
        if (cancelled) {
          return;
        }

        setProjectState({ status: "ready", project });
        setTrackedImportId((current) => current ?? findPendingImportId(project));
        setActiveChapterId((current) => resolveActiveChapterId(project, current));

        if (project.chapters.length === 0) {
          setChapterState({ status: "idle" });
        }
      } catch (error) {
        if (!cancelled) {
          setProjectState({
            status: "error",
            message: toErrorMessage(error),
          });
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [client, projectId]);

  const fallbackChapterId =
    projectState.status === "ready" && projectState.project.chapters.length > 0 ? projectState.project.chapters[0].id : null;

  useEffect(() => {
    if (!activeChapterId) {
      return;
    }

    const chapterId = activeChapterId;
    let cancelled = false;

    async function loadChapter() {
      setChapterState({ status: "loading" });

      try {
        const chapter = await client.projects.getChapter(projectId, chapterId);
        if (!cancelled) {
          setChapterState({ status: "ready", chapter });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (fallbackChapterId && fallbackChapterId !== chapterId) {
          setActiveChapterId(fallbackChapterId);
          return;
        }

        setChapterState({
          status: "error",
          message: toErrorMessage(error),
        });
      }
    }

    void loadChapter();

    return () => {
      cancelled = true;
    };
  }, [activeChapterId, client, fallbackChapterId, projectId]);

  useEffect(() => {
    if (projectState.status !== "ready" || !trackedImportId) {
      return;
    }

    const timerId = window.setTimeout(async () => {
      try {
        const project = await client.projects.get(projectId);
        setProjectState({ status: "ready", project });

        const importSummary = project.imports.find((item) => item.id === trackedImportId);
        if (!importSummary) {
          setTrackedImportId(null);
          return;
        }

        if (importSummary.state === "completed") {
          setTrackedImportId(null);
          const importedChapter =
            project.chapters.find((chapter) => chapter.sourceDocumentRecordId === trackedImportId) ?? project.chapters[0] ?? null;
          if (importedChapter) {
            setActiveChapterId(importedChapter.id);
          }
          return;
        }

        if (importSummary.state === "failed") {
          setTrackedImportId(null);
        }
      } catch {
        // Keep the last honest project state rendered and retry on the next cycle.
      }
    }, 1000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [client, projectId, projectState.status, trackedImportId]);

  if (projectState.status === "loading") {
    return (
      <section className={styles.projectPage}>
        <div className={styles.statusPanel}>
          <h1 className="section-title">Loading project</h1>
        </div>
      </section>
    );
  }

  if (projectState.status === "error") {
    return (
      <section className={styles.projectPage}>
        <div className={styles.statusPanel}>
          <h1 className="section-title">Project unavailable</h1>
          <p className="body-sm">{projectState.message}</p>
        </div>
      </section>
    );
  }

  const project = projectState.project;
  const importStatus =
    project.imports.find((item) => item.id === trackedImportId) ??
    (project.chapters.length === 0 ? project.imports[0] ?? null : null);
  const importStatusCopy = getImportStatusCopy(importStatus);
  const generateButtonClassName = canUseModelRequiredFeatures
    ? styles.generateButton
    : `${styles.generateButton} ${styles.generateButtonMuted}`;

  async function handleSave(chapterId: string, editorDoc: ProseMirrorNode) {
    const updatedChapter = await client.projects.updateChapter(project.id, chapterId, { editorDoc });
    setChapterState((current) =>
      current.status === "ready" && current.chapter.id === updatedChapter.id
        ? { status: "ready", chapter: updatedChapter }
        : current,
    );
    setProjectState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            project: {
              ...current.project,
              updatedAt: updatedChapter.updatedAt,
            },
          }
        : current,
    );
  }

  return (
    <section className={styles.projectPage}>
      {project.chapters.length === 0 ? (
        <>
          <header className={styles.projectHeader}>
            <h1 className={styles.projectTitle}>{project.title}</h1>
          </header>

          <div className={styles.uploadStage}>
            <UploadDropzone
              acceptedFormats={acceptedFormats}
              onUpload={async (file) => {
                const response = await client.projects.importFile(project.id, file);
                setProjectState({ status: "ready", project: response.project });

                if (response.import.state === "completed") {
                  const importedChapter =
                    response.project.chapters.find((chapter) => chapter.sourceDocumentRecordId === response.import.id) ??
                    response.project.chapters[0] ??
                    null;
                  if (importedChapter) {
                    setActiveChapterId(importedChapter.id);
                  }
                  setTrackedImportId(null);
                } else if (response.import.state === "failed") {
                  setTrackedImportId(null);
                } else {
                  setTrackedImportId(response.import.id);
                }

                return response;
              }}
            />

            {importStatusCopy ? (
              <aside className={styles.statusPanel}>
                <h2 className="section-title">{importStatusCopy.title}</h2>
                <p className="body-sm">{importStatusCopy.message}</p>
              </aside>
            ) : null}
          </div>
        </>
      ) : (
        <div className={styles.manuscriptWorkspace}>
          <div className={styles.manuscriptToolbar} data-testid="manuscript-toolbar">
            <span className={styles.toolbarTitle}>{project.title}</span>
            <button className={generateButtonClassName} disabled={!canUseModelRequiredFeatures} type="button">
              Generate
            </button>
          </div>

          <div className={styles.editorViewport}>
            {chapterState.status === "loading" ? (
              <div className={styles.statusPanel}>
                <h2 className="section-title">Editor loading</h2>
                <p className="body-sm">Loading chapter content from the local runtime.</p>
              </div>
            ) : null}

            {chapterState.status === "error" ? (
              <div className={styles.statusPanel}>
                <h2 className="section-title">Chapter unavailable</h2>
                <p className="body-sm">{chapterState.message}</p>
              </div>
            ) : null}

            {chapterState.status === "ready" ? (
              <ManuscriptEditor chapter={chapterState.chapter} onSave={handleSave} />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
