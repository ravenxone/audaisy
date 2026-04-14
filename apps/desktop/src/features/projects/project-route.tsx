import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ProjectDetailResponse } from "@audaisy/contracts";

import { UploadDropzone } from "@/features/uploads/upload-dropzone";
import styles from "@/features/projects/project-route.module.css";
import { useAudaisyClient } from "@/shared/api/client-context";

const ACCEPTED_FORMATS = [".pdf", ".txt", ".md"];

type ProjectState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      project: ProjectDetailResponse;
    };

export function ProjectRoute() {
  const { projectId = "" } = useParams();
  const client = useAudaisyClient();
  const [state, setState] = useState<ProjectState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      try {
        const project = await client.projects.get(projectId);

        if (!cancelled) {
          setState({
            status: "ready",
            project,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Unable to load project.",
          });
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [client, projectId]);

  if (state.status === "loading") {
    return (
      <section className={styles.projectPage}>
        <div className={styles.statusPanel}>
          <h1 className="section-title">Loading project</h1>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className={styles.projectPage}>
        <div className={styles.statusPanel}>
          <h1 className="section-title">Project unavailable</h1>
          <p className="body-sm">{state.message}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.projectPage}>
      <header className={styles.projectHeader}>
        <h1 className={styles.projectTitle}>{state.project.title}</h1>
      </header>

      <div className={styles.uploadStage}>
        <UploadDropzone
          acceptedFormats={ACCEPTED_FORMATS}
          onUpload={async (file) => {
            const response = await client.projects.importFile(state.project.id, file);
            setState((current) =>
              current.status === "ready"
                ? {
                    ...current,
                    project: response.project,
                  }
                : current,
            );
            return response;
          }}
        />
      </div>
    </section>
  );
}
