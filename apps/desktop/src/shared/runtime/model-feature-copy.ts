import type { RuntimeStatusResponse } from "@audaisy/contracts";

type ModelFeatureCopyOptions = {
  actionErrorMessage?: string | null;
};

export function formatBytes(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1_000)} KB`;
}

export function getModelFeatureCopy(
  runtimeStatus: RuntimeStatusResponse,
  options: ModelFeatureCopyOptions = {},
) {
  const { modelInstall, blockingIssues } = runtimeStatus;

  if (modelInstall.state === "downloading") {
    return {
      label: "Downloading model",
      detail:
        modelInstall.totalBytes !== null && modelInstall.bytesDownloaded !== null
          ? `Downloading ${formatBytes(modelInstall.bytesDownloaded)} of ${formatBytes(modelInstall.totalBytes)}. Importing and editing stay available.`
          : "Downloading model assets. Importing and editing stay available.",
    };
  }

  if (modelInstall.state === "verifying") {
    return {
      label: "Verifying model",
      detail: "Checking the downloaded model files. Importing and editing stay available.",
    };
  }

  if (modelInstall.state === "error") {
    return {
      label: "Model setup failed",
      detail: modelInstall.lastErrorMessage ?? options.actionErrorMessage ?? "Model setup failed. Importing and editing stay available.",
    };
  }

  if (modelInstall.state === "unavailable") {
    return {
      label: "Model unavailable",
      detail: blockingIssues[0]?.message ?? modelInstall.lastErrorMessage ?? "This Mac cannot install the model right now.",
    };
  }

  return {
    label: "Model not installed",
    detail: "Model-backed features stay unavailable until setup finishes. Importing and editing are ready now.",
  };
}
