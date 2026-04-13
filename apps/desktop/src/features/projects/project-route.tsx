import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { UploadDropzone } from "@/features/uploads/upload-dropzone";
import { useAudaisyClient } from "@/shared/api/client-context";
import type { ProjectResponse } from "@/shared/api/contracts-mirror";

const ACCEPTED_FORMATS = [".pdf", ".txt", ".md"];

type ProjectState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; project: ProjectResponse };

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
      <section className="page page-project">
        <div className="content-panel">
          <h1 className="section-title">Loading project</h1>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="page page-project">
        <div className="content-panel">
          <h1 className="section-title">Project unavailable</h1>
          <p className="body-sm">{state.message}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page page-project">
      <header className="page-header project-header">
        <div>
          <p className="eyebrow">Project</p>
          <h1 className="display-title">{state.project.title}</h1>
        </div>
      </header>

      <UploadDropzone
        acceptedFormats={ACCEPTED_FORMATS}
        onUpload={(file) => client.projects.importFile(state.project.id, file)}
      />
    </section>
  );
}
