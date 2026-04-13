import { useEffect, useState } from "react";

import {
  useTemporaryLocalBootstrapSupport,
  type TemporaryLocalProfile,
} from "@/app/bootstrap/temporary-local-bootstrap";
import type { RuntimeStatusResponse } from "@/shared/api/contracts-mirror";
import { useAudaisyClient } from "@/shared/api/client-context";

type OnboardingState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      runtimeStatus: RuntimeStatusResponse;
      profile: TemporaryLocalProfile;
    };

export function OnboardingRoute() {
  const client = useAudaisyClient();
  const temporaryLocalBootstrapSupport = useTemporaryLocalBootstrapSupport();
  const [state, setState] = useState<OnboardingState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [runtimeStatus, profile] = await Promise.all([
        client.runtime.getStatus(),
        temporaryLocalBootstrapSupport.getLocalProfile(),
      ]);

      if (!cancelled) {
        setState({
          status: "ready",
          profile,
          runtimeStatus,
        });
      }
    }

    load().catch((error) => {
      if (!cancelled) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load onboarding readiness.",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, temporaryLocalBootstrapSupport]);

  if (state.status === "error") {
    return (
      <main className="onboarding-screen">
        <section className="status-panel">
          <h1 className="section-title">Onboarding issue</h1>
          <p className="body-text">{state.message}</p>
        </section>
      </main>
    );
  }

  const profileReady = state.status === "ready" && Boolean(state.profile.name.trim() && state.profile.avatar);
  const modelsReady = state.status === "ready" && state.runtimeStatus.modelsReady;

  return (
    <main className="onboarding-screen">
      <section className="onboarding-hero status-panel">
        <p className="eyebrow">First run</p>
        <h1 className="display-title">Welcome to Audaisy</h1>
        <p className="body-text">
          This route stays separate from the workspace so profile setup and local model readiness can expand here
          without changing the main router.
        </p>
      </section>

      <div className="onboarding-grid">
        <section className="status-panel">
          <h2 className="section-title">Profile setup</h2>
          <p className="body-sm">
            {state.status === "loading"
              ? "Checking your local profile."
              : profileReady
                ? "Name and avatar are already available."
                : "Your name and avatar still need to be completed."}
          </p>
        </section>

        <section className="status-panel">
          <h2 className="section-title">Model readiness</h2>
          <p className="body-sm">
            {state.status === "loading"
              ? "Checking local model assets."
              : modelsReady
                ? "Model assets are ready for the workspace."
                : "Model assets are not ready yet. Download and install progress will appear here in a later slice."}
          </p>
          {state.status === "ready" && state.runtimeStatus.blockingIssues.length > 0 ? (
            <ul className="status-list">
              {state.runtimeStatus.blockingIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
