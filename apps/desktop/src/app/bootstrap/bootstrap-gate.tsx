import { Navigate, Outlet } from "react-router-dom";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";

function StatusScreen({ message, title }: { message: string; title: string }) {
  return (
    <main className="bootstrap-screen">
      <div className="status-panel">
        <h1 className="section-title">{title}</h1>
        <p className="body-text">{message}</p>
      </div>
    </main>
  );
}

export function BootstrapGate() {
  const { state: sessionState } = useWorkspaceSession();

  if (sessionState.status === "error") {
    return <StatusScreen message={sessionState.message} title="Startup issue" />;
  }

  if (sessionState.status === "ready" && !sessionState.runtimeStatus.healthy) {
    return <StatusScreen message="The local runtime did not report a healthy status." title="Startup issue" />;
  }

  if (sessionState.status === "ready") {
    return <Navigate replace to={sessionState.profile.hasCompletedProfileSetup ? "/library" : "/onboarding"} />;
  }

  return <StatusScreen message="Loading your local profile and runtime status." title="Checking your workspace" />;
}

export function OnboardingAccessGate() {
  const { state: sessionState } = useWorkspaceSession();

  if (sessionState.status === "loading") {
    return <StatusScreen message="Loading your local profile and runtime status." title="Checking your workspace" />;
  }

  if (sessionState.status === "error") {
    return <StatusScreen message={sessionState.message} title="Startup issue" />;
  }

  if (!sessionState.runtimeStatus.healthy) {
    return <StatusScreen message="The local runtime did not report a healthy status." title="Startup issue" />;
  }

  return <Outlet />;
}

export function ShellAccessGate() {
  const { state: sessionState } = useWorkspaceSession();

  if (sessionState.status === "loading") {
    return <StatusScreen message="Loading your local profile and runtime status." title="Checking your workspace" />;
  }

  if (sessionState.status === "error") {
    return <StatusScreen message={sessionState.message} title="Startup issue" />;
  }

  if (!sessionState.runtimeStatus.healthy) {
    return <StatusScreen message="The local runtime did not report a healthy status." title="Startup issue" />;
  }

  if (!sessionState.profile.hasCompletedProfileSetup) {
    return <Navigate replace to="/onboarding" />;
  }

  return <Outlet />;
}
