import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";

import { AppShell } from "@/features/app-shell/app-shell";
import { useAudaisyClient } from "@/shared/api/client-context";
import type { LocalProfile, ProjectCard } from "@/shared/api/contracts-mirror";

type ShellState = {
  loading: boolean;
  projects: ProjectCard[];
  profile: LocalProfile | null;
};

export function AppShellLayout() {
  const client = useAudaisyClient();
  const [state, setState] = useState<ShellState>({
    loading: true,
    projects: [],
    profile: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadShellData() {
      const [projects, profile] = await Promise.all([client.projects.list(), client.profile.getLocalProfile()]);

      if (!cancelled) {
        setState({
          loading: false,
          projects,
          profile,
        });
      }
    }

    loadShellData().catch(() => {
      if (!cancelled) {
        setState({
          loading: false,
          projects: [],
          profile: null,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  if (state.loading) {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Loading workspace</h1>
          <p className="body-text">Preparing your projects and shell navigation.</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell projects={state.projects} profile={state.profile ?? undefined}>
      <Outlet />
    </AppShell>
  );
}
