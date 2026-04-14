import { useId, useMemo, useState } from "react";
import type { CreateImportResponse } from "@audaisy/contracts";

import cloudUploadIcon from "@/assets/icons/cloud-upload.svg";
import styles from "@/features/uploads/upload-dropzone.module.css";

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

function formatAcceptedFormatsForError(acceptedFormats: string[]) {
  if (acceptedFormats.length === 0) {
    return "supported file";
  }

  if (acceptedFormats.length === 1) {
    return acceptedFormats[0];
  }

  if (acceptedFormats.length === 2) {
    return `${acceptedFormats[0]} or ${acceptedFormats[1]}`;
  }

  return `${acceptedFormats.slice(0, -1).join(", ")}, or ${acceptedFormats.at(-1)}`;
}

export function UploadDropzone({ acceptedFormats, onUpload }: UploadDropzoneProps) {
  const inputId = useId();
  const [state, setState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"neutral" | "success">("neutral");
  const allowedFormats = useMemo(() => acceptedFormats.map((format) => format.toLowerCase()), [acceptedFormats]);
  const acceptedFormatsLabel = acceptedFormats.join(", ");
  const acceptedFormatsErrorLabel = formatAcceptedFormatsForError(acceptedFormats);
  const isUploading = state === "uploading";

  async function submitFile(file: File | null) {
    if (!file || isUploading) {
      return;
    }

    const extension = getFileExtension(file.name);

    if (!allowedFormats.includes(extension)) {
      setState("error");
      setErrorMessage(`Please choose a ${acceptedFormatsErrorLabel} file for this step.`);
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
    <section className={styles.frame} data-state={state} data-testid="upload-frame">
      <div
        className={styles.dropzone}
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
        <h2 className={styles.title}>Upload a file to get started</h2>

        <label aria-disabled={isUploading} className={styles.innerCard} htmlFor={inputId}>
          <img alt="" aria-hidden="true" className={styles.cloudIcon} src={cloudUploadIcon} />
          <span className={styles.innerCopy}>Click here or drop the file to start uploading</span>
        </label>

        <div className={styles.acceptedFormats}>
          <p className={styles.acceptedFormatsLabel}>Accepted formats</p>
          <p className={styles.acceptedFormatsValue}>{acceptedFormatsLabel}</p>
        </div>

        <input
          accept={acceptedFormats.join(",")}
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

        <div className={styles.statusArea}>
          {isUploading ? <p className={styles.statusMessage}>Uploading file...</p> : null}
          {errorMessage ? (
            <p className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
              {errorMessage}
            </p>
          ) : null}
          {statusMessage ? (
            <p className={`${styles.statusMessage} ${statusTone === "success" ? styles.statusSuccess : ""}`}>
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
