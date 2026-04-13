import { useEffect, useState } from "react";

import type { LocalProfile, RuntimeStatusResponse } from "@/shared/api/contracts-mirror";
import { useAudaisyClient } from "@/shared/api/client-context";

type OnboardingState = {
  runtimeStatus: RuntimeStatusResponse | null;
  profile: LocalProfile | null;
  loading: boolean;
};

export function OnboardingRoute() {
  const client = useAudaisyClient();
  const [state, setState] = useState<OnboardingState>({
    runtimeStatus: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [runtimeStatus, profile] = await Promise.all([
        client.runtime.getStatus(),
        client.profile.getLocalProfile(),
      ]);

      if (!cancelled) {
        setState({
          runtimeStatus,
          profile,
          loading: false,
        });
      }
    }

    load().catch(() => {
      if (!cancelled) {
        setState({
          runtimeStatus: null,
          profile: null,
          loading: false,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const profileReady = Boolean(state.profile?.name.trim() && state.profile?.avatar);
  const modelsReady = Boolean(state.runtimeStatus?.modelsReady);

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
            {state.loading
              ? "Checking your local profile."
              : profileReady
                ? "Name and avatar are already available."
                : "Your name and avatar still need to be completed."}
          </p>
        </section>

        <section className="status-panel">
          <h2 className="section-title">Model readiness</h2>
          <p className="body-sm">
            {state.loading
              ? "Checking local model assets."
              : modelsReady
                ? "Model assets are ready for the workspace."
                : "Model assets are not ready yet. Download and install progress will appear here in a later slice."}
          </p>
          {!state.loading && state.runtimeStatus && state.runtimeStatus.blockingIssues.length > 0 ? (
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
