import { Link, matchPath, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import type { ProjectCard } from "@audaisy/contracts";

import type { WorkspaceProfile } from "@/app/bootstrap/workspace-session";
import { homeShellAssets, resolveAvatarOption } from "@/assets/home-shell-assets";
import styles from "@/features/app-shell/app-shell.module.css";

type AppShellProps = {
  projects: ProjectCard[];
  profile: WorkspaceProfile | null;
  creatingProject: boolean;
  deletingProjectId: string | null;
  projectActionError: string | null;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  children: ReactNode;
};

type MainNavItem = {
  key: "home" | "trash" | "downloads";
  label: string;
  iconSrc: string;
  to?: string;
  disabled?: boolean;
};

export function AppShell({
  projects,
  profile,
  creatingProject,
  deletingProjectId,
  projectActionError,
  onCreateProject,
  onDeleteProject,
  children,
}: AppShellProps) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const profileName = profile?.name.trim() || "Your Name";
  const avatar = resolveAvatarOption(profile?.avatarId ?? null);
  const profileMeta = "youremail@gmail.com";
  const DaisyMark = homeShellAssets.brand.daisy.src;
  const ToggleExpandedIcon = homeShellAssets.shell.toggle.expanded.src;
  const ToggleCollapsedIcon = homeShellAssets.shell.toggle.collapsed.src;
  const HomeIcon = homeShellAssets.shell.home.src;
  const TrashIcon = homeShellAssets.shell.trash.src;
  const DownloadsIcon = homeShellAssets.shell.downloads.src;
  const SampleProjectIcon = homeShellAssets.shell.sampleProject.src;
  const StartSomethingNewIcon = homeShellAssets.shell.startSomethingNew.src;
  const DocumentationIcon = homeShellAssets.shell.documentation.src;
  const SettingsIcon = homeShellAssets.shell.settings.src;
  const selectedMainKey = location.pathname === "/home" ? "home" : null;
  const selectedProjectId = matchPath("/projects/:projectId", location.pathname)?.params.projectId ?? null;
  const mainNavItems: MainNavItem[] = [
    { key: "home", label: "Home", iconSrc: HomeIcon, to: "/home" },
    { key: "trash", label: "Trash", iconSrc: TrashIcon, disabled: true },
    { key: "downloads", label: "Downloads", iconSrc: DownloadsIcon, disabled: true },
  ];

  const shellClassName = isSidebarOpen ? styles.shell : `${styles.shell} ${styles.shellCollapsed}`;
  const toolbarClassName = isSidebarOpen ? styles.toolbar : `${styles.toolbar} ${styles.toolbarCollapsed}`;
  const contentClassName = isSidebarOpen ? styles.content : `${styles.content} ${styles.contentCollapsed}`;
  const sidebarState = isSidebarOpen ? "expanded" : "collapsed";

  return (
    <div className={shellClassName} data-state={sidebarState}>
      <div className={styles.sidebarRail} data-state={sidebarState}>
        <aside aria-hidden={!isSidebarOpen} className={styles.sidebar} data-state={sidebarState} id="audaisy-sidebar">
          <div className={styles.sidebarTop}>
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Main</p>
              <nav aria-label="Primary" className={styles.navList}>
                {mainNavItems.map((item) => {
                  const className =
                    selectedMainKey === item.key ? `${styles.navRow} ${styles.activeRow}` : styles.navRow;

                  if (item.disabled) {
                    return (
                      <span aria-disabled="true" className={`${className} ${styles.disabledRow}`} key={item.key}>
                        <img alt="" aria-hidden="true" className={styles.navIcon} src={item.iconSrc} />
                        <span>{item.label}</span>
                      </span>
                    );
                  }

                  return (
                    <Link aria-current={selectedMainKey === item.key ? "page" : undefined} className={className} key={item.key} to={item.to ?? "/home"}>
                      <img alt="" aria-hidden="true" className={styles.navIcon} src={item.iconSrc} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className={styles.section}>
              <p className={styles.sectionLabel}>Projects</p>
              <nav aria-label="Projects" className={styles.projectList}>
                {projects.map((project) => (
                  <div className={styles.projectRow} key={project.id}>
                    <Link
                      aria-current={selectedProjectId === project.id ? "page" : undefined}
                      className={selectedProjectId === project.id ? `${styles.projectLink} ${styles.activeRow}` : styles.projectLink}
                      to={`/projects/${project.id}`}
                    >
                      <img alt="" aria-hidden="true" className={styles.navIcon} src={SampleProjectIcon} />
                      <span>{project.title}</span>
                    </Link>
                    <button
                      aria-label={`Delete project ${project.title}`}
                      className={styles.deleteProjectButton}
                      disabled={deletingProjectId === project.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteProject(project.id);
                      }}
                      type="button"
                    >
                      <img alt="" aria-hidden="true" className={styles.projectDeleteIcon} src={TrashIcon} />
                    </button>
                  </div>
                ))}
                <button
                  aria-busy={creatingProject}
                  className={styles.projectActionButton}
                  disabled={creatingProject}
                  onClick={onCreateProject}
                  type="button"
                >
                  <img alt="" aria-hidden="true" className={styles.navIcon} src={StartSomethingNewIcon} />
                  <span>Start something new +</span>
                </button>
              </nav>
              {projectActionError ? (
                <p className={styles.projectActionError} role="alert">
                  {projectActionError}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.sidebarBottom}>
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Account</p>
              <nav aria-label="Secondary" className={styles.projectList}>
                <a className={styles.externalLink} href="https://docs.audaisy.app" rel="noreferrer" target="_blank">
                  <img alt="" aria-hidden="true" className={styles.navIcon} src={DocumentationIcon} />
                  <span>Documentation</span>
                </a>
                <span aria-disabled="true" className={`${styles.projectLink} ${styles.disabledRow}`}>
                  <img alt="" aria-hidden="true" className={styles.navIcon} src={SettingsIcon} />
                  <span>Settings</span>
                </span>
              </nav>
            </div>
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
      </div>

      <div className={styles.workspace}>
        <div className={toolbarClassName}>
          <span aria-label="Audaisy brand" className={styles.brand} role="img">
            <img alt="" aria-hidden="true" className={styles.brandIcon} src={DaisyMark} />
          </span>
          <button
            aria-controls="audaisy-sidebar"
            aria-expanded={isSidebarOpen}
            aria-label="Sidebar toggle"
            className={styles.toggleButton}
            data-state={sidebarState}
            onClick={() => setIsSidebarOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className={styles.toggleIconStack}>
              <img alt="" className={`${styles.toggleIcon} ${styles.toggleIconExpanded}`} data-icon="expanded" src={ToggleExpandedIcon} />
              <img alt="" className={`${styles.toggleIcon} ${styles.toggleIconCollapsed}`} data-icon="collapsed" src={ToggleCollapsedIcon} />
            </span>
          </button>
        </div>
        <main className={contentClassName}>{children}</main>
      </div>
    </div>
  );
}
