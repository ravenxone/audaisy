import { matchPath, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ProjectCard, ProjectDetailResponse } from "@audaisy/contracts";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { AppShell } from "@/features/app-shell/app-shell";
import { useAudaisyClient } from "@/shared/api/client-context";
import { formatBytes, getModelFeatureCopy } from "@/shared/runtime/model-feature-copy";

const MODEL_READY_STATUS_DISMISSED_KEY_PREFIX = "audaisy:model-ready-status-dismissed:";

type ShellState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projects: ProjectCard[] };

function toProjectCard(project: ProjectDetailResponse): ProjectCard {
  return {
    id: project.id,
    title: project.title,
    chapterCount: project.chapters.length,
    lastOpenedAt: project.lastOpenedAt,
    activeJobCount: 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function readReadyStatusDismissed(key: string | null) {
  if (typeof window === "undefined" || key === null) {
    return false;
  }

  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function AppShellLayout() {
  const client = useAudaisyClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { canUseModelRequiredFeatures, downloadProgress, modelInstall, profile, runtimeStatus, state: sessionState } =
    useWorkspaceSession();
  const [state, setState] = useState<ShellState>({ status: "loading" });
  const [creatingProject, setCreatingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const [dismissedReadyStatusKey, setDismissedReadyStatusKey] = useState<string | null>(null);
  const currentProjectId = matchPath("/projects/:projectId", location.pathname)?.params.projectId ?? null;
  const readyDismissKey = canUseModelRequiredFeatures
    ? `${MODEL_READY_STATUS_DISMISSED_KEY_PREFIX}${modelInstall?.manifestVersion ?? "installed"}`
    : null;
  const hasCurrentProject =
    state.status === "ready" &&
    currentProjectId !== null &&
    state.projects.some((project) => project.id === currentProjectId);
  const shouldLoadShellData =
    state.status === "loading" ||
    (state.status === "ready" && currentProjectId !== null && !hasCurrentProject);
  const isModelReadyStatusDismissed =
    readyDismissKey !== null && (dismissedReadyStatusKey === readyDismissKey || readReadyStatusDismissed(readyDismissKey));
  const showReadyModelStatus = canUseModelRequiredFeatures && !isModelReadyStatusDismissed;
  const blockedModelFeature = !canUseModelRequiredFeatures && runtimeStatus ? getModelFeatureCopy(runtimeStatus) : null;
  const modelStatus = showReadyModelStatus
    ? {
        label: "Model ready",
        onDismiss: () => {
          if (!readyDismissKey) {
            return;
          }

          setDismissedReadyStatusKey(readyDismissKey);

          try {
            window.localStorage.setItem(readyDismissKey, "true");
          } catch {
            // Ignore storage failures and keep the shell usable.
          }
        },
      }
    : blockedModelFeature
      ? {
          ...blockedModelFeature,
          label:
            modelInstall?.state === "downloading" && downloadProgress !== null
              ? `Downloading ${Math.round(downloadProgress * 100)}%`
              : blockedModelFeature.label,
          detail:
            modelInstall?.state === "downloading" &&
            typeof modelInstall.bytesDownloaded === "number" &&
            typeof modelInstall.totalBytes === "number"
              ? `${formatBytes(modelInstall.bytesDownloaded)} of ${formatBytes(modelInstall.totalBytes)} downloaded`
              : blockedModelFeature.detail,
          progress: downloadProgress,
        }
      : null;

  function upsertProject(project: ProjectDetailResponse) {
    const projectCard = toProjectCard(project);
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            projects: current.projects.some((item) => item.id === project.id)
              ? current.projects.map((item) => (item.id === project.id ? projectCard : item))
              : [...current.projects, projectCard],
          }
        : current,
    );
  }

  useEffect(() => {
    if (!shouldLoadShellData) {
      return;
    }

    let cancelled = false;

    async function loadShellData() {
      const projects = await client.projects.list();

      if (!cancelled) {
        setState({
          status: "ready",
          projects,
        });
      }
    }

    loadShellData().catch((error) => {
      if (!cancelled) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load workspace navigation.",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, currentProjectId, shouldLoadShellData]);

  if (sessionState.status === "loading" || state.status === "loading") {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Loading workspace</h1>
          <p className="body-text">Preparing your projects and shell navigation.</p>
        </div>
      </main>
    );
  }

  if (sessionState.status === "error") {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Workspace issue</h1>
          <p className="body-text">{sessionState.message}</p>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Workspace issue</h1>
          <p className="body-text">{state.message}</p>
        </div>
      </main>
    );
  }

  async function handleCreateProject() {
    if (creatingProject || state.status !== "ready") {
      return;
    }

    setCreatingProject(true);
    setProjectActionError(null);

    try {
      const project = await client.projects.create({ title: "Untitled Project" });
      upsertProject(project);
      navigate(`/projects/${project.id}`);
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to create project.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (deletingProjectId || state.status !== "ready") {
      return;
    }

    setDeletingProjectId(projectId);
    setProjectActionError(null);

    try {
      await client.projects.delete(projectId);
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              projects: current.projects.filter((project) => project.id !== projectId),
            }
          : current,
      );

      if (currentProjectId === projectId) {
        navigate("/library");
      }
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to delete project.");
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <AppShell
      creatingProject={creatingProject}
      deletingProjectId={deletingProjectId}
      modelStatus={modelStatus}
      onCreateProject={() => void handleCreateProject()}
      onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
      profile={profile}
      projectActionError={projectActionError}
      projects={state.projects}
    >
      <Outlet />
    </AppShell>
  );
}
