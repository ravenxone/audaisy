import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProfileResponse, RuntimeStatusResponse } from "@audaisy/contracts";

import type { AudaisyClient } from "@/shared/api/client";
import { useAudaisyClient } from "@/shared/api/client-context";

export type WorkspaceProfile = Pick<ProfileResponse, "name" | "avatarId" | "hasCompletedProfileSetup">;

type ReadyWorkspaceSessionState = {
  status: "ready";
  profile: ProfileResponse;
  runtimeStatus: RuntimeStatusResponse;
};

type WorkspaceSessionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ReadyWorkspaceSessionState;

type WorkspaceSessionValue = {
  state: WorkspaceSessionState;
  profile: WorkspaceProfile | null;
  setProfile: (profile: ProfileResponse) => void;
};

const WorkspaceSessionContext = createContext<WorkspaceSessionValue | null>(null);
const workspaceSessionCache = new WeakMap<AudaisyClient, Exclude<WorkspaceSessionState, { status: "loading" }>>();
const workspaceSessionInflight = new WeakMap<AudaisyClient, Promise<Exclude<WorkspaceSessionState, { status: "loading" }>>>();

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load workspace session.";
}

function toWorkspaceProfile(profile: ProfileResponse): WorkspaceProfile {
  return {
    name: profile.name,
    avatarId: profile.avatarId,
    hasCompletedProfileSetup: profile.hasCompletedProfileSetup,
  };
}

async function loadWorkspaceSession(client: AudaisyClient): Promise<Exclude<WorkspaceSessionState, { status: "loading" }>> {
  const cachedState = workspaceSessionCache.get(client);
  if (cachedState) {
    return cachedState;
  }

  const inflightState = workspaceSessionInflight.get(client);
  if (inflightState) {
    return inflightState;
  }

  const request = Promise.all([client.profile.get(), client.runtime.getStatus()])
    .then(([profile, runtimeStatus]) => ({ status: "ready", profile, runtimeStatus }) as const)
    .catch((error) => ({ status: "error", message: toErrorMessage(error) }) as const)
    .finally(() => {
      workspaceSessionInflight.delete(client);
    });

  workspaceSessionInflight.set(client, request);

  const nextState = await request;
  workspaceSessionCache.set(client, nextState);
  return nextState;
}

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const client = useAudaisyClient();
  const [state, setState] = useState<WorkspaceSessionState>(() => workspaceSessionCache.get(client) ?? { status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void loadWorkspaceSession(client).then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const setProfile = useCallback(
    (profile: ProfileResponse) => {
      setState((currentState) => {
        if (currentState.status !== "ready") {
          return currentState;
        }

        const nextState = {
          ...currentState,
          profile,
        } satisfies ReadyWorkspaceSessionState;
        workspaceSessionCache.set(client, nextState);
        return nextState;
      });
    },
    [client],
  );

  const value = useMemo<WorkspaceSessionValue>(
    () => ({
      state,
      profile: state.status === "ready" ? toWorkspaceProfile(state.profile) : null,
      setProfile,
    }),
    [setProfile, state],
  );

  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const context = useContext(WorkspaceSessionContext);

  if (!context) {
    throw new Error("Workspace session is not available in context.");
  }

  return context;
}
