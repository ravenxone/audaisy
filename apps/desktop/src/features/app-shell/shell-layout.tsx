import { matchPath, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ProjectCard, ProjectDetailResponse } from "@audaisy/contracts";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { AppShell } from "@/features/app-shell/app-shell";
import { useAudaisyClient } from "@/shared/api/client-context";

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

export function AppShellLayout() {
  const client = useAudaisyClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, state: sessionState } = useWorkspaceSession();
  const [state, setState] = useState<ShellState>({ status: "loading" });
  const [creatingProject, setCreatingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const currentProjectId = matchPath("/projects/:projectId", location.pathname)?.params.projectId ?? null;
  const hasCurrentProject =
    state.status === "ready" &&
    currentProjectId !== null &&
    state.projects.some((project) => project.id === currentProjectId);
  const shouldLoadShellData =
    state.status === "loading" ||
    (state.status === "ready" && currentProjectId !== null && !hasCurrentProject);

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
      const projectCard = toProjectCard(project);

      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              projects: [...current.projects, projectCard],
            }
          : current,
      );
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
        navigate("/home");
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
