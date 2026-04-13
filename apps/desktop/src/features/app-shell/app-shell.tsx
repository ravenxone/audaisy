import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { ProjectCard } from "@audaisy/contracts";

import { homeShellAssets, resolveAvatarOption } from "@/assets/home-shell-assets";
import type { TemporaryLocalProfile } from "@/app/bootstrap/temporary-local-bootstrap";
import styles from "@/features/app-shell/app-shell.module.css";

type AppShellProps = {
  projects: ProjectCard[];
  profile: TemporaryLocalProfile;
  children: ReactNode;
};

export function AppShell({ projects, profile, children }: AppShellProps) {
  const profileName = profile.name.trim() || "Profile setup needed";
  const avatar = resolveAvatarOption(profile.avatar);
  const profileMeta = "youremail@gmail.com";
  const DaisyMark = homeShellAssets.brand.daisy.src;
  const ToggleIcon = homeShellAssets.shell.toggle.src;
  const HomeIcon = homeShellAssets.shell.home.src;
  const TrashIcon = homeShellAssets.shell.trash.src;
  const ActiveJobsIcon = homeShellAssets.shell.activeJobs.src;
  const SampleProjectIcon = homeShellAssets.shell.sampleProject.src;
  const StartSomethingNewIcon = homeShellAssets.shell.startSomethingNew.src;
  const DocumentationIcon = homeShellAssets.shell.documentation.src;
  const SettingsIcon = homeShellAssets.shell.settings.src;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Main</p>
          <nav aria-label="Primary" className={styles.navList}>
            <Link className={styles.navRow} to="/home">
              <img alt="" aria-hidden="true" className={styles.navIcon} src={HomeIcon} />
              <span>Home</span>
            </Link>
            <span aria-disabled="true" className={`${styles.navRow} ${styles.disabledRow}`}>
              <img alt="" aria-hidden="true" className={styles.navIcon} src={TrashIcon} />
              <span>Trash</span>
            </span>
            <span aria-disabled="true" className={`${styles.navRow} ${styles.disabledRow}`}>
              <img alt="" aria-hidden="true" className={styles.navIcon} src={ActiveJobsIcon} />
              <span>Active Jobs</span>
            </span>
          </nav>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionLabel}>Projects</p>
          <nav aria-label="Projects" className={styles.projectList}>
            {projects.map((project) => (
              <Link className={styles.projectLink} key={project.id} to={`/projects/${project.id}`}>
                <img alt="" aria-hidden="true" className={styles.navIcon} src={SampleProjectIcon} />
                <span>{project.title}</span>
              </Link>
            ))}
            <button className={styles.actionButton} type="button" disabled>
              <img alt="" aria-hidden="true" className={styles.navIcon} src={StartSomethingNewIcon} />
              <span>Start something new +</span>
            </button>
          </nav>
        </div>

        <div className={`${styles.section} ${styles.accountSection}`}>
          <p className={styles.sectionLabel}>Account</p>
          <nav aria-label="Secondary" className={styles.projectList}>
            <a className={styles.externalLink} href="https://docs.audaisy.app" target="_blank" rel="noreferrer">
              <img alt="" aria-hidden="true" className={styles.navIcon} src={DocumentationIcon} />
              <span>Documentation</span>
            </a>
            <span aria-disabled="true" className={`${styles.projectLink} ${styles.disabledRow}`}>
              <img alt="" aria-hidden="true" className={styles.navIcon} src={SettingsIcon} />
              <span>Settings</span>
            </span>
          </nav>
          <div className={styles.profileRow}>
            <div
              aria-hidden="true"
              className={styles.avatar}
              style={{ backgroundColor: avatar.background }}
            >
              <span>{avatar.emoji}</span>
            </div>
            <div className={styles.profileCopy}>
              <span className={styles.profileName}>{profileName}</span>
              <span className={styles.profileMeta}>{profileMeta}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <div className={styles.toolbar}>
          <span aria-label="Audaisy brand" className={styles.brand} role="img">
            <img alt="" aria-hidden="true" className={styles.brandIcon} src={DaisyMark} />
          </span>
          <button aria-label="Sidebar toggle" className={styles.toggleButton} type="button">
            <img alt="" aria-hidden="true" className={styles.toggleIcon} src={ToggleIcon} />
          </button>
        </div>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
