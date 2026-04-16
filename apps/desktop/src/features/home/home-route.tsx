import { startTransition, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useWorkspaceSession } from "@/app/bootstrap/workspace-session";
import { useAudaisyClient } from "@/shared/api/client-context";
import { getModelFeatureCopy } from "@/shared/runtime/model-feature-copy";
import styles from "@/features/home/home-route.module.css";

const HOW_IT_WORKS = [
  {
    title: "Upload a file",
  },
  {
    title: "Check the imported text",
  },
  {
    title: "Generate audio and share!",
  },
];

type CreateProjectState = {
  loading: boolean;
  error: string | null;
};

export function HomeRoute() {
  const client = useAudaisyClient();
  const navigate = useNavigate();
  const {
    canRetryModelInstall,
    canStartModelInstall,
    canUseModelRequiredFeatures,
    downloadProgress,
    modelInstall,
    modelInstallActionError,
    modelInstallActionPending,
    runtimeStatus,
    runtimeBlockingIssues,
    startModelInstall,
  } = useWorkspaceSession();
  const [state, setState] = useState<CreateProjectState>({
    loading: false,
    error: null,
  });
  const modelPanel =
    !canUseModelRequiredFeatures && runtimeStatus
      ? getModelFeatureCopy(runtimeStatus, { actionErrorMessage: modelInstallActionError })
      : null;

  async function handleStartModelSetup() {
    await startModelInstall().catch(() => undefined);
  }

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
    <section className={styles.home}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Active Jobs</h1>
        <p className={styles.subtitle}>You have no jobs running at the moment</p>

        <div className={styles.ctaWrap}>
          <button className={styles.cta} disabled={state.loading} onClick={handleCreateProject} type="button">
            Get started
          </button>
          {state.loading ? <p className={styles.status}>Creating project...</p> : null}
        </div>

        {state.error ? (
          <section className={styles.errorBanner} role="alert">
            <p className={styles.errorText}>{state.error}</p>
            <button className={styles.retryButton} onClick={handleCreateProject} type="button">
              Retry
            </button>
          </section>
        ) : null}
      </div>

      {modelPanel ? (
        <section className={styles.modelPanel} data-testid="library-model-panel">
          <div className={styles.modelPanelHeader}>
            <h2 className={styles.modelTitle}>{modelPanel.label}</h2>
            {downloadProgress !== null ? <span className={styles.modelBadge}>{Math.round(downloadProgress * 100)}%</span> : null}
          </div>
          <p className={styles.modelBody}>{modelPanel.detail}</p>
          {runtimeBlockingIssues.length > 0 ? (
            <ul className={styles.modelIssues}>
              {runtimeBlockingIssues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {canStartModelInstall || canRetryModelInstall ? (
            <button className={styles.modelAction} disabled={modelInstallActionPending} onClick={() => void handleStartModelSetup()} type="button">
              {modelInstallActionPending ? "Starting setup..." : canRetryModelInstall ? "Retry setup" : "Start setup"}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className={styles.howItWorks}>
        <h2 className={styles.howHeading}>How it Works</h2>
        <div className={styles.cardGrid}>
          {HOW_IT_WORKS.map((item) => (
            <article className={styles.card} key={item.title}>
              <h3 className={styles.cardTitle}>{item.title}</h3>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
