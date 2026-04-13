import { Outlet, Route, Routes } from "react-router-dom";

import { BootstrapGate } from "@/app/bootstrap/bootstrap-gate";
import { TemporaryLocalBootstrapProvider } from "@/app/bootstrap/temporary-local-bootstrap-provider";
import type { TemporaryLocalBootstrapSupport } from "@/app/bootstrap/temporary-local-bootstrap";
import { AppShellLayout } from "@/features/app-shell/shell-layout";
import { HomeRoute } from "@/features/home/home-route";
import { OnboardingRoute } from "@/features/onboarding/onboarding-route";
import { ProjectRoute } from "@/features/projects/project-route";
import type { AudaisyClient } from "@/shared/api/client";
import { AudaisyClientProvider } from "@/shared/api/client-context";

type AppDependencies = {
  client: AudaisyClient;
  temporaryLocalBootstrapSupport: TemporaryLocalBootstrapSupport;
};

function AppProviders({ client, temporaryLocalBootstrapSupport }: AppDependencies) {
  return (
    <AudaisyClientProvider client={client}>
      <TemporaryLocalBootstrapProvider support={temporaryLocalBootstrapSupport}>
        <Outlet />
      </TemporaryLocalBootstrapProvider>
    </AudaisyClientProvider>
  );
}

export function createAppRoutes({ client, temporaryLocalBootstrapSupport }: AppDependencies) {
  return (
    <Routes>
      <Route
        element={<AppProviders client={client} temporaryLocalBootstrapSupport={temporaryLocalBootstrapSupport} />}
        path="/"
      >
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
