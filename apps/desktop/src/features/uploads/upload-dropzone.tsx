import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CreateImportResponse } from "@audaisy/contracts";

import cloudUploadIcon from "@/assets/icons/cloud-upload.svg";
import styles from "@/features/uploads/upload-dropzone.module.css";

type UploadDropzoneProps = {
  acceptedFormats: string[];
  onUpload: (file: File) => Promise<CreateImportResponse>;
};

type UploadState = "idle" | "drag-over" | "uploading" | "error";

function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) {
    return false;
  }

  const types = dataTransfer.types ? Array.from(dataTransfer.types) : [];
  if (types.includes("Files")) {
    return true;
  }

  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  if (items.length > 0) {
    return items.some((item) => item.kind === "file");
  }

  return Boolean(dataTransfer.files?.length);
}

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
        message: `Stored ${response.import.sourceFileName} safely. Import processing will continue before editing is ready.`,
      };
    case "processing":
      return {
        tone: "neutral" as const,
        message: `Processing ${response.import.sourceFileName}. The manuscript will open when chapter content is ready.`,
      };
    case "completed":
      return {
        tone: "success" as const,
        message: `Import completed for ${response.import.sourceFileName}. Opening the manuscript workspace.`,
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
  const dragDepthRef = useRef(0);
  const allowedFormats = useMemo(() => acceptedFormats.map((format) => format.toLowerCase()), [acceptedFormats]);
  const acceptedFormatsLabel = acceptedFormats.join(", ");
  const acceptedFormatsErrorLabel = formatAcceptedFormatsForError(acceptedFormats);
  const isUploading = state === "uploading";

  useEffect(() => {
    function preventWindowFileDrop(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      if (event.type === "dragover" && event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }

    window.addEventListener("dragover", preventWindowFileDrop);
    window.addEventListener("drop", preventWindowFileDrop);

    return () => {
      window.removeEventListener("dragover", preventWindowFileDrop);
      window.removeEventListener("drop", preventWindowFileDrop);
    };
  }, []);

  useEffect(() => {
    if (!isUploading) {
      return;
    }

    dragDepthRef.current = 0;
  }, [isUploading]);

  function resetDragState(nextState: UploadState = "idle") {
    dragDepthRef.current = 0;
    setState(nextState);
  }

  async function submitFile(file: File | null) {
    if (!file || isUploading) {
      return;
    }

    const extension = getFileExtension(file.name);

    if (!allowedFormats.includes(extension)) {
      resetDragState("error");
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
        resetDragState("error");
        setErrorMessage(nextMessage.message);
        return;
      }

      resetDragState("idle");
      setStatusTone(nextMessage.tone);
      setStatusMessage(nextMessage.message);
    } catch {
      resetDragState("error");
      setErrorMessage("Import failed. Please try another file or retry.");
    }
  }

  return (
    <section
      className={styles.frame}
      data-state={state}
      data-testid="upload-frame"
      onDragEnter={(event) => {
        if (!hasDraggedFiles(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        if (isUploading) {
          return;
        }

        dragDepthRef.current += 1;
        setState("drag-over");
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (isUploading || dragDepthRef.current === 0) {
          return;
        }

        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setState("idle");
        }
      }}
      onDragOver={(event) => {
        if (!hasDraggedFiles(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
        if (isUploading) {
          return;
        }

        setState("drag-over");
      }}
      onDrop={(event) => {
        event.preventDefault();
        const droppedFile = hasDraggedFiles(event.dataTransfer) ? event.dataTransfer.files.item(0) : null;

        if (isUploading) {
          dragDepthRef.current = 0;
          return;
        }

        resetDragState("idle");
        void submitFile(droppedFile);
      }}
    >
      <div
        className={styles.dropzone}
        data-state={state}
        data-testid="upload-dropzone"
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
