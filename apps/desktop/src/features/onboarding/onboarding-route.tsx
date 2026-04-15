import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RuntimeStatusResponse } from "@audaisy/contracts";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { avatarOptions } from "@/assets/home-shell-assets";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string };

function getModelReadinessCopy(runtimeStatus: RuntimeStatusResponse) {
  if (runtimeStatus.modelsReady) {
    return "Model-backed features are ready.";
  }

  if (runtimeStatus.modelInstall.lastErrorMessage) {
    return runtimeStatus.modelInstall.lastErrorMessage;
  }

  if (runtimeStatus.modelInstall.state === "unavailable") {
    return "This Mac cannot install the model right now.";
  }

  return "Model-backed features will unlock after the runtime finishes setup.";
}

export function OnboardingRoute() {
  const navigate = useNavigate();
  const {
    clearPostProfileModelInterstitial,
    modelInstallActionPending,
    postProfileModelInterstitialAction,
    profileComplete,
    startModelInstall,
    state,
    updateProfile,
  } = useWorkspaceSession();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftAvatarId, setDraftAvatarId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const resolvedDraftName = draftName ?? (state.status === "ready" ? state.profile.name : "");
  const resolvedDraftAvatarId = draftAvatarId ?? (state.status === "ready" ? state.profile.avatarId ?? "" : "");

  useEffect(() => {
    if (profileComplete && postProfileModelInterstitialAction === null) {
      navigate("/library", { replace: true });
    }
  }, [navigate, postProfileModelInterstitialAction, profileComplete]);

  async function handleSaveProfile() {
    if (state.status !== "ready" || saveState.status === "saving") {
      return;
    }

    setSaveState({ status: "saving" });

    try {
      await updateProfile({
        name: resolvedDraftName,
        avatarId: resolvedDraftAvatarId || null,
      });
      setSaveState({ status: "idle" });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to save your local profile.",
      });
    }
  }

  async function handleContinueToLibrary() {
    try {
      await startModelInstall().catch(() => undefined);
    } finally {
      clearPostProfileModelInterstitial();
      navigate("/library", { replace: true });
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

  const modelReadiness = state.status === "ready" ? getModelReadinessCopy(state.runtimeStatus) : "Checking local model assets.";
  const interstitialTitle = postProfileModelInterstitialAction === "retry" ? "Retry model setup" : "Model setup";
  const interstitialBody =
    postProfileModelInterstitialAction === "retry"
      ? "Model setup previously failed. We can retry it now. Library and editing stay available either way."
      : "We can start the local model setup now. Some features may stay unavailable until it finishes, but library and editing are already available.";
  const interstitialCta =
    postProfileModelInterstitialAction === "retry"
      ? modelInstallActionPending
        ? "Retrying setup..."
        : "Retry setup"
      : modelInstallActionPending
        ? "Starting setup..."
        : "Start setup";

  return (
    <main className="onboarding-screen">
      <section className="onboarding-hero status-panel">
        <p className="eyebrow">First run</p>
        <h1 className="display-title">Welcome to Audaisy</h1>
        <p className="body-text">
          Finish your local profile here. Library, project creation, and local file upload use the live runtime now.
        </p>
      </section>

      {postProfileModelInterstitialAction ? (
        <section className="status-panel">
          <h2 className="section-title">{interstitialTitle}</h2>
          <p className="body-sm">{interstitialBody}</p>
          <button className="primary-cta" disabled={modelInstallActionPending} onClick={() => void handleContinueToLibrary()} type="button">
            {interstitialCta}
          </button>
        </section>
      ) : (
        <div className="onboarding-grid">
          <section className="status-panel">
            <h2 className="section-title">Profile setup</h2>
            <p className="body-sm">
              {state.status === "loading"
                ? "Checking your local profile."
                : profileComplete
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
      )}
    </main>
  );
}
