import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ModelInstallStatus,
  PatchProfileRequest,
  ProfileResponse,
  RuntimeBlockingIssue,
  RuntimeStatusResponse,
  StartModelDownloadResponse,
} from "@audaisy/contracts";

import type { AudaisyClient } from "@/shared/api/client";
import { useAudaisyClient } from "@/shared/api/client-context";

export type WorkspaceProfile = Pick<ProfileResponse, "name" | "avatarId" | "hasCompletedProfileSetup">;
export type PostProfileModelInterstitialAction = "start" | "retry";

type ReadyWorkspaceSessionState = {
  status: "ready";
  profile: ProfileResponse;
  runtimeStatus: RuntimeStatusResponse;
  showPostProfileModelInterstitial: boolean;
  modelInstallActionPending: boolean;
  modelInstallActionError: string | null;
};

type WorkspaceSessionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ReadyWorkspaceSessionState;

type WorkspaceSessionValue = {
  state: WorkspaceSessionState;
  profile: WorkspaceProfile | null;
  runtimeStatus: RuntimeStatusResponse | null;
  profileComplete: boolean;
  runtimeHealthy: boolean;
  canUseModelRequiredFeatures: boolean;
  modelInstall: ModelInstallStatus | null;
  runtimeBlockingIssues: RuntimeBlockingIssue[];
  downloadProgress: number | null;
  canStartModelInstall: boolean;
  canRetryModelInstall: boolean;
  postProfileModelInterstitialAction: PostProfileModelInterstitialAction | null;
  modelInstallActionPending: boolean;
  modelInstallActionError: string | null;
  updateProfile: (input: PatchProfileRequest) => Promise<ProfileResponse>;
  startModelInstall: () => Promise<StartModelDownloadResponse | null>;
  refreshRuntimeStatus: () => Promise<RuntimeStatusResponse | null>;
  clearPostProfileModelInterstitial: () => void;
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

function isModelInstallPollingState(runtimeStatus: RuntimeStatusResponse) {
  return runtimeStatus.modelInstall.state === "downloading" || runtimeStatus.modelInstall.state === "verifying";
}

function getDownloadProgress(modelInstall: ModelInstallStatus) {
  if (modelInstall.state !== "downloading") {
    return null;
  }

  if (
    typeof modelInstall.bytesDownloaded === "number" &&
    typeof modelInstall.totalBytes === "number" &&
    modelInstall.totalBytes > 0
  ) {
    return Math.min(modelInstall.bytesDownloaded / modelInstall.totalBytes, 1);
  }

  return null;
}

function canStartModelInstall(runtimeStatus: RuntimeStatusResponse) {
  return runtimeStatus.modelInstall.state === "not_installed";
}

function canRetryModelInstall(runtimeStatus: RuntimeStatusResponse) {
  return runtimeStatus.modelInstall.state === "error";
}

function getPostProfileModelInterstitialAction(
  runtimeStatus: RuntimeStatusResponse,
): PostProfileModelInterstitialAction | null {
  if (canStartModelInstall(runtimeStatus)) {
    return "start";
  }

  if (canRetryModelInstall(runtimeStatus)) {
    return "retry";
  }

  return null;
}

function canUseModelRequiredFeatures(runtimeStatus: RuntimeStatusResponse) {
  return runtimeStatus.healthy && runtimeStatus.modelsReady;
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
    .then(
      ([profile, runtimeStatus]) =>
        ({
          status: "ready",
          profile,
          runtimeStatus,
          showPostProfileModelInterstitial: false,
          modelInstallActionPending: false,
          modelInstallActionError: null,
        }) as const,
    )
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
  const [runtimePollTick, setRuntimePollTick] = useState(0);
  const runtimeStatusRequestRef = useRef<Promise<RuntimeStatusResponse | null> | null>(null);

  const applyReadyState = useCallback(
    (updater: (currentState: ReadyWorkspaceSessionState) => ReadyWorkspaceSessionState) => {
      setState((currentState) => {
        if (currentState.status !== "ready") {
          return currentState;
        }

        const nextState = updater(currentState);
        workspaceSessionCache.set(client, nextState);
        return nextState;
      });
    },
    [client],
  );

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

  const refreshRuntimeStatus = useCallback(async () => {
    if (runtimeStatusRequestRef.current) {
      return runtimeStatusRequestRef.current;
    }

    const request = client.runtime.getStatus().then((runtimeStatus) => {
      applyReadyState((currentState) => ({
        ...currentState,
        runtimeStatus,
        showPostProfileModelInterstitial:
          currentState.showPostProfileModelInterstitial &&
          getPostProfileModelInterstitialAction(runtimeStatus) !== null,
      }));

      return runtimeStatus;
    });

    const requestPromise = request.finally(() => {
      if (runtimeStatusRequestRef.current === requestPromise) {
        runtimeStatusRequestRef.current = null;
      }
    });

    runtimeStatusRequestRef.current = requestPromise;
    return requestPromise;
  }, [applyReadyState, client]);

  useEffect(() => {
    if (state.status !== "ready" || !isModelInstallPollingState(state.runtimeStatus)) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void refreshRuntimeStatus()
        .catch(() => undefined)
        .finally(() => {
          setRuntimePollTick((current) => current + 1);
        });
    }, 1000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [refreshRuntimeStatus, runtimePollTick, state.status === "ready" ? state.runtimeStatus.modelInstall.state : state.status]);

  const updateProfile = useCallback(
    async (input: PatchProfileRequest) => {
      const profile = await client.profile.update(input);

      applyReadyState((currentState) => ({
        ...currentState,
        profile,
        showPostProfileModelInterstitial:
          !currentState.profile.hasCompletedProfileSetup &&
          profile.hasCompletedProfileSetup &&
          getPostProfileModelInterstitialAction(currentState.runtimeStatus) !== null,
      }));

      return profile;
    },
    [applyReadyState, client],
  );

  const clearPostProfileModelInterstitial = useCallback(() => {
    applyReadyState((currentState) => ({
      ...currentState,
      showPostProfileModelInterstitial: false,
    }));
  }, [applyReadyState]);

  const startModelInstall = useCallback(async () => {
    const cachedState = workspaceSessionCache.get(client);
    if (
      cachedState?.status !== "ready" ||
      cachedState.modelInstallActionPending ||
      (!canStartModelInstall(cachedState.runtimeStatus) && !canRetryModelInstall(cachedState.runtimeStatus))
    ) {
      return null;
    }

    applyReadyState((currentState) => ({
      ...currentState,
      modelInstallActionPending: true,
      modelInstallActionError: null,
    }));

    try {
      const response = await client.runtime.startModelDownload({});

      applyReadyState((currentState) => ({
        ...currentState,
        runtimeStatus: {
          ...currentState.runtimeStatus,
          modelInstall: response.modelInstall,
        },
      }));

      await refreshRuntimeStatus().catch(() => null);
      return response;
    } catch (error) {
      applyReadyState((currentState) => ({
        ...currentState,
        modelInstallActionError: toErrorMessage(error),
      }));
      await refreshRuntimeStatus().catch(() => null);
      throw error;
    } finally {
      applyReadyState((currentState) => ({
        ...currentState,
        modelInstallActionPending: false,
      }));
    }
  }, [applyReadyState, client, refreshRuntimeStatus]);

  const value = useMemo<WorkspaceSessionValue>(() => {
    const isReady = state.status === "ready";
    const runtimeStatus = state.status === "ready" ? state.runtimeStatus : null;
    const modelInstall = runtimeStatus?.modelInstall ?? null;
    const postProfileModelInterstitialAction =
      isReady && state.showPostProfileModelInterstitial ? getPostProfileModelInterstitialAction(state.runtimeStatus) : null;

    return {
      state,
      profile: isReady ? toWorkspaceProfile(state.profile) : null,
      runtimeStatus,
      profileComplete: isReady ? state.profile.hasCompletedProfileSetup : false,
      runtimeHealthy: runtimeStatus?.healthy ?? false,
      canUseModelRequiredFeatures: runtimeStatus ? canUseModelRequiredFeatures(runtimeStatus) : false,
      modelInstall,
      runtimeBlockingIssues: runtimeStatus?.blockingIssues ?? [],
      downloadProgress: modelInstall ? getDownloadProgress(modelInstall) : null,
      canStartModelInstall: isReady && !state.modelInstallActionPending && canStartModelInstall(state.runtimeStatus),
      canRetryModelInstall: isReady && !state.modelInstallActionPending && canRetryModelInstall(state.runtimeStatus),
      postProfileModelInterstitialAction,
      modelInstallActionPending: isReady && state.modelInstallActionPending,
      modelInstallActionError: isReady ? state.modelInstallActionError : null,
      updateProfile,
      startModelInstall,
      refreshRuntimeStatus,
      clearPostProfileModelInterstitial,
    };
  }, [clearPostProfileModelInterstitial, refreshRuntimeStatus, startModelInstall, state, updateProfile]);

  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const context = useContext(WorkspaceSessionContext);

  if (!context) {
    throw new Error("Workspace session is not available in context.");
  }

  return context;
}
