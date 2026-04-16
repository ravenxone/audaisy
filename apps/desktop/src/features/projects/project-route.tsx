import { useEffect, useRef, useState } from "react";
import type { ChapterDetailResponse, ProjectDetailResponse, ProjectImportSummary, ProseMirrorNode, RenderJobResponse } from "@audaisy/contracts";
import { useParams } from "react-router-dom";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { ChapterPlaybackBar } from "@/features/projects/chapter-playback-bar";
import { ManuscriptEditor, type ManuscriptEditorHandle } from "@/features/projects/manuscript-editor";
import styles from "@/features/projects/project-route.module.css";
import { UploadDropzone } from "@/features/uploads/upload-dropzone";
import { getModelFeatureCopy } from "@/shared/runtime/model-feature-copy";
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

function sortRenderJobs(jobs: RenderJobResponse[]) {
  return [...jobs].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function upsertRenderJob(jobs: RenderJobResponse[], nextJob: RenderJobResponse) {
  return sortRenderJobs([nextJob, ...jobs.filter((job) => job.id !== nextJob.id)]);
}

function mergeRenderJobs(currentJobs: RenderJobResponse[], nextJobs: RenderJobResponse[]) {
  const nextIds = new Set(nextJobs.map((job) => job.id));
  return sortRenderJobs([...currentJobs.filter((job) => !nextIds.has(job.id)), ...nextJobs]);
}

function findLatestChapterJob(jobs: RenderJobResponse[], chapterId: string | null) {
  if (!chapterId) {
    return null;
  }

  return jobs.find((job) => job.chapterId === chapterId) ?? null;
}

function findLatestCompletedChapterJob(jobs: RenderJobResponse[], chapterId: string | null) {
  if (!chapterId) {
    return null;
  }

  return jobs.find((job) => job.chapterId === chapterId && job.status === "completed") ?? null;
}

function isTerminalRenderJob(job: RenderJobResponse | null) {
  return job ? job.status === "completed" || job.status === "failed" : true;
}

function toRenderStatusLabel(status: RenderJobResponse["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "assembling":
      return "Assembling";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

export function ProjectRoute() {
  const { projectId = "" } = useParams();
  const client = useAudaisyClient();
  const editorRef = useRef<ManuscriptEditorHandle | null>(null);
  const { canUseModelRequiredFeatures, runtimeStatus } = useWorkspaceSession();
  const [projectState, setProjectState] = useState<ProjectState>({ status: "loading" });
  const [chapterState, setChapterState] = useState<ChapterState>({ status: "idle" });
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [trackedImportId, setTrackedImportId] = useState<string | null>(null);
  const [renderJobs, setRenderJobs] = useState<RenderJobResponse[]>([]);
  const [renderActionPending, setRenderActionPending] = useState(false);
  const [renderActionError, setRenderActionError] = useState<string | null>(null);
  const acceptedFormats = runtimeStatus?.supportedImportFormats ?? [];

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      setProjectState({ status: "loading" });
      setChapterState({ status: "idle" });
      setActiveChapterId(null);
      setTrackedImportId(null);
      setRenderJobs([]);
      setRenderActionError(null);

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

  useEffect(() => {
    if (projectState.status !== "ready") {
      return;
    }

    let cancelled = false;

    async function loadRenderJobs() {
      try {
        const jobs = await client.projects.listRenderJobs(projectId);
        if (!cancelled) {
          setRenderJobs((current) => mergeRenderJobs(current, jobs));
        }
      } catch (error) {
        if (!cancelled) {
          setRenderActionError(toErrorMessage(error));
        }
      }
    }

    void loadRenderJobs();

    return () => {
      cancelled = true;
    };
  }, [client, projectId, projectState.status]);

  const latestChapterJob = findLatestChapterJob(renderJobs, activeChapterId);
  const latestCompletedChapterJob = findLatestCompletedChapterJob(renderJobs, activeChapterId);

  useEffect(() => {
    if (!latestChapterJob || isTerminalRenderJob(latestChapterJob)) {
      return;
    }

    let cancelled = false;
    const timerId = window.setTimeout(async () => {
      try {
        const nextJob = await client.projects.getRenderJob(projectId, latestChapterJob.id);
        if (!cancelled) {
          setRenderJobs((current) => upsertRenderJob(current, nextJob));
        }
      } catch (error) {
        if (!cancelled) {
          setRenderActionError(toErrorMessage(error));
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [client, latestChapterJob, projectId]);

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
  const blockedGenerationCopy = !canUseModelRequiredFeatures && runtimeStatus ? getModelFeatureCopy(runtimeStatus) : null;
  const renderStatusText = blockedGenerationCopy?.label ?? (latestChapterJob ? toRenderStatusLabel(latestChapterJob.status) : "");
  const renderStatusClassName =
    blockedGenerationCopy !== null
      ? `${styles.toolbarStatus} ${styles.toolbarStatusMuted}`
      : latestChapterJob?.status === "completed"
        ? `${styles.toolbarStatus} ${styles.toolbarStatusComplete}`
        : latestChapterJob?.status === "failed"
          ? `${styles.toolbarStatus} ${styles.toolbarStatusFailed}`
          : styles.toolbarStatus;
  const playerFailureMessage =
    latestChapterJob?.status === "failed" ? latestChapterJob.errorMessage ?? "Render job failed." : renderActionError;
  const chapterTitle = chapterState.status === "ready" ? chapterState.chapter.title : project.title;
  const generateDisabled = !canUseModelRequiredFeatures || chapterState.status !== "ready" || renderActionPending;

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

  async function handleGenerateAudio() {
    if (chapterState.status !== "ready" || generateDisabled) {
      return;
    }

    setRenderActionPending(true);
    setRenderActionError(null);

    try {
      const didSaveFlushSucceed = (await editorRef.current?.flushPendingSave()) ?? true;
      if (!didSaveFlushSucceed) {
        setRenderActionError("The latest manuscript changes are still saving. Audio generation stays blocked until save succeeds.");
        return;
      }

      const renderJob = await client.projects.createRenderJob(project.id, {
        chapterId: chapterState.chapter.id,
      });
      setRenderJobs((current) => upsertRenderJob(current, renderJob));
    } catch (error) {
      setRenderActionError(toErrorMessage(error));
    } finally {
      setRenderActionPending(false);
    }
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
            <span className={renderStatusClassName} data-testid="manuscript-render-status">
              {renderStatusText}
            </span>
            <button
              className={generateButtonClassName}
              disabled={generateDisabled}
              onClick={() => void handleGenerateAudio()}
              type="button"
            >
              {renderActionPending ? "Starting..." : "Generate Audio"}
            </button>
          </div>

          <div className={styles.editorViewport}>
            <div className={styles.editorCanvas}>
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
                <ManuscriptEditor chapter={chapterState.chapter} onSave={handleSave} ref={editorRef} />
              ) : null}
            </div>

            <div className={styles.playerHoverRail}>
              <ChapterPlaybackBar
                chapterTitle={chapterTitle}
                completedRenderJob={latestCompletedChapterJob}
                failureMessage={playerFailureMessage}
                projectId={project.id}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
