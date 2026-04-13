import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ProjectCard } from "@audaisy/contracts";

import {
  useTemporaryLocalBootstrapSupport,
  type TemporaryLocalProfile,
} from "@/app/bootstrap/temporary-local-bootstrap";
import { AppShell } from "@/features/app-shell/app-shell";
import { useAudaisyClient } from "@/shared/api/client-context";

type ShellState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      projects: ProjectCard[];
      profile: TemporaryLocalProfile;
    };

export function AppShellLayout() {
  const client = useAudaisyClient();
  const temporaryLocalBootstrapSupport = useTemporaryLocalBootstrapSupport();
  const location = useLocation();
  const [state, setState] = useState<ShellState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadShellData() {
      const [projects, profile] = await Promise.all([
        client.projects.list(),
        temporaryLocalBootstrapSupport.getLocalProfile(),
      ]);

      if (!cancelled) {
        setState({
          status: "ready",
          projects,
          profile,
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
  }, [client, location.pathname, temporaryLocalBootstrapSupport]);

  if (state.status === "loading") {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Loading workspace</h1>
          <p className="body-text">Preparing your projects and shell navigation.</p>
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

  return (
    <AppShell projects={state.projects} profile={state.profile}>
      <Outlet />
    </AppShell>
  );
}
