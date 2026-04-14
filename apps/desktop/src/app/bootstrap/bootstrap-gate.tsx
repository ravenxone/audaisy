import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";

export function BootstrapGate() {
  const navigate = useNavigate();
  const { state: sessionState } = useWorkspaceSession();
  const redirectTarget =
    sessionState.status === "ready" && sessionState.runtimeStatus.healthy
      ? sessionState.profile.hasCompletedProfileSetup
        ? "/home"
        : "/onboarding"
      : null;

  useEffect(() => {
    if (redirectTarget) {
      navigate(redirectTarget, { replace: true });
    }
  }, [navigate, redirectTarget]);

  if (sessionState.status === "error") {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Startup issue</h1>
          <p className="body-text">{sessionState.message}</p>
        </div>
      </main>
    );
  }

  if (sessionState.status === "ready" && !sessionState.runtimeStatus.healthy) {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Startup issue</h1>
          <p className="body-text">The local runtime did not report a healthy status.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="bootstrap-screen">
      <div className="status-panel">
        <h1 className="section-title">Checking your workspace</h1>
        <p className="body-text">Loading your local profile and runtime status.</p>
      </div>
    </main>
  );
}
