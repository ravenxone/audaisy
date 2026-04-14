import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RuntimeStatusResponse } from "@audaisy/contracts";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { avatarOptions } from "@/assets/home-shell-assets";
import { useAudaisyClient } from "@/shared/api/client-context";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string };

function getModelReadinessCopy(runtimeStatus: RuntimeStatusResponse) {
  if (runtimeStatus.modelsReady) {
    return "Model assets are ready for future generation features.";
  }

  return runtimeStatus.modelInstall.lastErrorMessage ?? "Model download is not available yet in this integration slice.";
}

export function OnboardingRoute() {
  const client = useAudaisyClient();
  const navigate = useNavigate();
  const { setProfile, state } = useWorkspaceSession();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftAvatarId, setDraftAvatarId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const resolvedDraftName = draftName ?? (state.status === "ready" ? state.profile.name : "");
  const resolvedDraftAvatarId = draftAvatarId ?? (state.status === "ready" ? state.profile.avatarId ?? "" : "");

  useEffect(() => {
    if (state.status === "ready" && state.profile.hasCompletedProfileSetup) {
      navigate("/home", { replace: true });
    }
  }, [navigate, state]);

  async function handleSaveProfile() {
    if (state.status !== "ready" || saveState.status === "saving") {
      return;
    }

    setSaveState({ status: "saving" });

    try {
      const profile = await client.profile.update({
        name: resolvedDraftName,
        avatarId: resolvedDraftAvatarId || null,
      });

      setProfile(profile);
      setSaveState({ status: "idle" });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to save your local profile.",
      });
    }
  }

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

  const profileReady = state.status === "ready" && state.profile.hasCompletedProfileSetup;
  const modelReadiness = state.status === "ready" ? getModelReadinessCopy(state.runtimeStatus) : "Checking local model assets.";

  return (
    <main className="onboarding-screen">
      <section className="onboarding-hero status-panel">
        <p className="eyebrow">First run</p>
        <h1 className="display-title">Welcome to Audaisy</h1>
        <p className="body-text">
          Finish your local profile here. Home, project creation, and local file upload use the live runtime now.
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

          <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
            <label className="body-sm" htmlFor="profile-name" style={{ display: "grid", gap: "8px" }}>
              Name
              <input
                id="profile-name"
                onChange={(event) => setDraftName(event.currentTarget.value)}
                type="text"
                value={resolvedDraftName}
              />
            </label>

            <label className="body-sm" htmlFor="profile-avatar" style={{ display: "grid", gap: "8px" }}>
              Avatar
              <select
                id="profile-avatar"
                onChange={(event) => setDraftAvatarId(event.currentTarget.value)}
                value={resolvedDraftAvatarId}
              >
                <option value="">Choose an avatar</option>
                {avatarOptions.map((avatar) => (
                  <option key={avatar.id} value={avatar.id}>
                    {avatar.emoji} {avatar.id.replace("-avatar", "")}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="primary-cta"
              disabled={saveState.status === "saving"}
              onClick={() => void handleSaveProfile()}
              type="button"
            >
              {saveState.status === "saving" ? "Saving profile..." : "Save profile"}
            </button>
            {saveState.status === "error" ? (
              <p className="body-sm status-error" role="alert">
                {saveState.message}
              </p>
            ) : null}
          </div>
        </section>

        <section className="status-panel">
          <h2 className="section-title">Model readiness</h2>
          <p className="body-sm">{modelReadiness}</p>
          {state.status === "ready" && state.runtimeStatus.blockingIssues.length > 0 ? (
            <ul className="status-list">
              {state.runtimeStatus.blockingIssues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
