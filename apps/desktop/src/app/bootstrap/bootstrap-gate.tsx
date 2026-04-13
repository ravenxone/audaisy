import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAudaisyClient } from "@/shared/api/client-context";

type BootstrapState =
  | { status: "loading" }
  | { status: "error"; message: string };

function needsOnboarding(modelsReady: boolean, healthy: boolean) {
  return !healthy || !modelsReady;
}

export function BootstrapGate() {
  const client = useAudaisyClient();
  const navigate = useNavigate();
  const [state, setState] = useState<BootstrapState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function resolveBootstrap() {
      try {
        const runtimeStatus = await client.runtime.getStatus();

        if (cancelled) {
          return;
        }

        if (needsOnboarding(runtimeStatus.modelsReady, runtimeStatus.healthy)) {
          navigate("/onboarding", { replace: true });
          return;
        }

        navigate("/library", { replace: true });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Unable to determine startup readiness.",
          });
        }
      }
    }

    resolveBootstrap();

    return () => {
      cancelled = true;
    };
  }, [client, navigate]);

  if (state.status === "error") {
    return (
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Startup issue</h1>
          <p className="body-text">{state.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="bootstrap-screen">
      <div className="status-panel">
        <h1 className="section-title">Checking your workspace</h1>
        <p className="body-text">Preparing runtime readiness.</p>
      </div>
    </main>
  );
}
