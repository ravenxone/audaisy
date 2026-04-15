import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { BootstrapGate, OnboardingAccessGate, ShellAccessGate } from "@/app/bootstrap/bootstrap-gate";
import { WorkspaceSessionProvider } from "@/app/bootstrap/workspace-session";
import { AppShellLayout } from "@/features/app-shell/shell-layout";
import { HomeRoute } from "@/features/home/home-route";
import { OnboardingRoute } from "@/features/onboarding/onboarding-route";
import { ProjectRoute } from "@/features/projects/project-route";
import type { AudaisyClient } from "@/shared/api/client";
import { AudaisyClientProvider } from "@/shared/api/client-context";

type AppDependencies = {
  client: AudaisyClient;
};

function AppProviders({ client }: AppDependencies) {
  return (
    <AudaisyClientProvider client={client}>
      <WorkspaceSessionProvider>
        <Outlet />
      </WorkspaceSessionProvider>
    </AudaisyClientProvider>
  );
}

export function createAppRoutes({ client }: AppDependencies) {
  return (
    <Routes>
      <Route element={<AppProviders client={client} />} path="/">
        <Route element={<BootstrapGate />} index />
        <Route element={<OnboardingAccessGate />}>
          <Route element={<OnboardingRoute />} path="onboarding" />
        </Route>
        <Route element={<ShellAccessGate />}>
          <Route element={<AppShellLayout />}>
            <Route element={<HomeRoute />} path="library" />
            <Route element={<ProjectRoute />} path="projects/:projectId" />
          </Route>
        </Route>
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
  );
}
