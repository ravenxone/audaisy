import { useId, useMemo, useState } from "react";

import type { ProjectImportResponse } from "@/shared/api/contracts-mirror";

type UploadDropzoneProps = {
  acceptedFormats: string[];
  onUpload: (file: File) => Promise<ProjectImportResponse>;
};

type UploadState = "idle" | "drag-over" | "uploading" | "error";

function getFileExtension(name: string) {
  const index = name.lastIndexOf(".");

  if (index < 0) {
    return "";
  }

  return name.slice(index).toLowerCase();
}

export function UploadDropzone({ acceptedFormats, onUpload }: UploadDropzoneProps) {
  const inputId = useId();
  const [state, setState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const allowedFormats = useMemo(() => acceptedFormats.map((format) => format.toLowerCase()), [acceptedFormats]);

  async function submitFile(file: File | null) {
    if (!file) {
      return;
    }

    const extension = getFileExtension(file.name);

    if (!allowedFormats.includes(extension)) {
      setState("error");
      setErrorMessage("Please choose a .pdf, .txt, or .md file for this step.");
      setSuccessMessage(null);
      return;
    }

    setState("uploading");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await onUpload(file);
      setState("idle");
      setSuccessMessage(`Imported ${response.sourceFileName}`);
    } catch {
      setState("error");
      setErrorMessage("Import failed. Please try another file or retry.");
    }
  }

  return (
    <div className="upload-panel">
      <div
        className="dropzone"
        data-state={state}
        data-testid="upload-dropzone"
        onDragEnter={(event) => {
          event.preventDefault();
          setState("drag-over");
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setState((currentState) => (currentState === "uploading" ? currentState : "idle"));
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (state !== "uploading") {
            setState("drag-over");
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setState("idle");
          void submitFile(event.dataTransfer.files.item(0));
        }}
      >
        <div className="upload-icon" aria-hidden="true">
          +
        </div>
        <h2 className="section-title">Upload a file to get started</h2>
        <p className="body-text">Drag a file here or choose one from your Mac to create the first manuscript import.</p>
        <p className="body-sm">Accepted formats: {acceptedFormats.join(", ")}</p>

        <label className="upload-select-button" htmlFor={inputId}>
          Choose a file
        </label>
        <input
          aria-label="Upload manuscript file"
          className="visually-hidden"
          id={inputId}
          onChange={(event) => {
            void submitFile(event.currentTarget.files?.item(0) ?? null);
            event.currentTarget.value = "";
          }}
          type="file"
        />

        {state === "uploading" ? <p className="body-sm status-inline">Uploading file...</p> : null}
        {errorMessage ? (
          <p className="body-sm status-inline status-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? <p className="body-sm status-inline status-success">{successMessage}</p> : null}
      </div>
    </div>
  );
}
