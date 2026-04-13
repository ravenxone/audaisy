import { useId, useMemo, useState } from "react";

import type { CreateImportResponse } from "@audaisy/contracts";

type UploadDropzoneProps = {
  acceptedFormats: string[];
  onUpload: (file: File) => Promise<CreateImportResponse>;
};

type UploadState = "idle" | "drag-over" | "uploading" | "error";

function getFileExtension(name: string) {
  const index = name.lastIndexOf(".");

  if (index < 0) {
    return "";
  }

  return name.slice(index).toLowerCase();
}

function getImportStatusMessage(response: CreateImportResponse) {
  switch (response.import.state) {
    case "stored":
      return {
        tone: "neutral" as const,
        message: `Stored ${response.import.sourceFileName} safely for import processing.`,
      };
    case "processing":
      return {
        tone: "neutral" as const,
        message: `Processing ${response.import.sourceFileName}.`,
      };
    case "completed":
      return {
        tone: "success" as const,
        message: `Import completed for ${response.import.sourceFileName}.`,
      };
    case "failed":
      return {
        tone: "error" as const,
        message: `Import failed for ${response.import.sourceFileName}. Please try another file or retry.`,
      };
  }
}

export function UploadDropzone({ acceptedFormats, onUpload }: UploadDropzoneProps) {
  const inputId = useId();
  const [state, setState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"neutral" | "success">("neutral");
  const allowedFormats = useMemo(() => acceptedFormats.map((format) => format.toLowerCase()), [acceptedFormats]);
  const isUploading = state === "uploading";

  async function submitFile(file: File | null) {
    if (!file || isUploading) {
      return;
    }

    const extension = getFileExtension(file.name);

    if (!allowedFormats.includes(extension)) {
      setState("error");
      setErrorMessage("Please choose a .pdf, .txt, or .md file for this step.");
      setStatusMessage(null);
      return;
    }

    setState("uploading");
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await onUpload(file);
      const nextMessage = getImportStatusMessage(response);

      if (nextMessage.tone === "error") {
        setState("error");
        setErrorMessage(nextMessage.message);
        return;
      }

      setState("idle");
      setStatusTone(nextMessage.tone);
      setStatusMessage(nextMessage.message);
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

          if (isUploading) {
            return;
          }
          setState("drag-over");
        }}
        onDragLeave={(event) => {
          event.preventDefault();

          if (isUploading) {
            return;
          }
          setState("idle");
        }}
        onDragOver={(event) => {
          event.preventDefault();

          if (isUploading) {
            return;
          }
          setState("drag-over");
        }}
        onDrop={(event) => {
          event.preventDefault();

          if (isUploading) {
            return;
          }
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

        <label aria-disabled={isUploading} className="upload-select-button" htmlFor={inputId}>
          Choose a file
        </label>
        <input
          aria-label="Upload manuscript file"
          className="visually-hidden"
          disabled={isUploading}
          id={inputId}
          onChange={(event) => {
            void submitFile(event.currentTarget.files?.item(0) ?? null);
            event.currentTarget.value = "";
          }}
          type="file"
        />

        {isUploading ? <p className="body-sm status-inline">Uploading file...</p> : null}
        {errorMessage ? (
          <p className="body-sm status-inline status-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {statusMessage ? (
          <p className={`body-sm status-inline ${statusTone === "success" ? "status-success" : ""}`}>{statusMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
