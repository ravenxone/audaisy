import { Outlet, Route, Routes } from "react-router-dom";

import { BootstrapGate } from "@/app/bootstrap/bootstrap-gate";
import { AppShellLayout } from "@/features/app-shell/shell-layout";
import { HomeRoute } from "@/features/home/home-route";
import { OnboardingRoute } from "@/features/onboarding/onboarding-route";
import { ProjectRoute } from "@/features/projects/project-route";
import type { AudaisyClient } from "@/shared/api/client";
import { AudaisyClientProvider } from "@/shared/api/client-context";

function AppProviders({ client }: { client: AudaisyClient }) {
  return (
    <AudaisyClientProvider client={client}>
      <Outlet />
    </AudaisyClientProvider>
  );
}

export function createAppRoutes(client: AudaisyClient) {
  return (
    <Routes>
      <Route element={<AppProviders client={client} />} path="/">
        <Route element={<BootstrapGate />} index />
        <Route element={<OnboardingRoute />} path="onboarding" />
        <Route element={<AppShellLayout />}>
          <Route element={<HomeRoute />} path="library" />
          <Route element={<ProjectRoute />} path="projects/:projectId" />
        </Route>
      </Route>
    </Routes>
  );
}
