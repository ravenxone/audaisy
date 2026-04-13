import { startTransition, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAudaisyClient } from "@/shared/api/client-context";

const HOW_IT_WORKS = [
  {
    title: "Upload a file",
    description: "Bring in a manuscript draft and let Audaisy prepare the first project workspace for it.",
  },
  {
    title: "Check the imported text",
    description: "Review the imported copy before the editor and narration tools take over in the next slice.",
  },
  {
    title: "Generate audio and share!",
    description: "Kick off local audio generation once the manuscript workspace is ready.",
  },
];

type CreateProjectState = {
  loading: boolean;
  error: string | null;
};

export function HomeRoute() {
  const client = useAudaisyClient();
  const navigate = useNavigate();
  const [state, setState] = useState<CreateProjectState>({
    loading: false,
    error: null,
  });

  async function handleCreateProject() {
    if (state.loading) {
      return;
    }

    setState({
      loading: true,
      error: null,
    });

    try {
      const project = await client.projects.create({
        title: "Your first Project",
      });

      startTransition(() => {
        navigate(`/projects/${project.id}`);
      });
    } catch {
      setState({
        loading: false,
        error: "Unable to create project. Please try again.",
      });
    }
  }

  return (
    <section className="page page-home">
      <div className="page-header">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="display-title">Active Jobs</h1>
        </div>

        <div className="cta-cluster">
          <button className="primary-cta" disabled={state.loading} onClick={handleCreateProject} type="button">
            Get started
          </button>
          {state.loading ? <p className="body-sm status-inline">Creating project...</p> : null}
        </div>
      </div>

      <section className="content-panel empty-state-panel">
        <p className="body-text">You have no jobs running at the moment</p>
      </section>

      {state.error ? (
        <section className="status-banner" role="alert">
          <p className="body-sm">{state.error}</p>
          <button className="secondary-button" onClick={handleCreateProject} type="button">
            Retry
          </button>
        </section>
      ) : null}

      <section className="how-it-works">
        <div className="section-heading">
          <h2 className="section-title">How it Works</h2>
        </div>
        <div className="how-it-works-grid">
          {HOW_IT_WORKS.map((item, index) => (
            <article className="content-panel how-card" key={item.title}>
              <span className="step-chip">0{index + 1}</span>
              <h3 className="section-title section-title-sm">{item.title}</h3>
              <p className="body-sm">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
