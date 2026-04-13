import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import type { LocalProfile, ProjectCard } from "@/shared/api/contracts-mirror";

type AppShellProps = {
  projects: ProjectCard[];
  profile?: LocalProfile;
  children: ReactNode;
};

const DEFAULT_PROFILE: LocalProfile = {
  name: "Raven",
  avatar: "sunflower-avatar",
};

export function AppShell({ projects, profile = DEFAULT_PROFILE, children }: AppShellProps) {
  const avatarLetter = profile.name.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-section">
          <p className="sidebar-label">Main</p>
          <nav className="sidebar-nav" aria-label="Primary">
            <Link className="sidebar-link" to="/library">
              Home
            </Link>
            <Link className="sidebar-link" to="/library?view=trash">
              Trash
            </Link>
            <Link className="sidebar-link" to="/library?view=jobs">
              Active Jobs
            </Link>
          </nav>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">Projects</p>
          <button className="sidebar-action" type="button" disabled>
            Start something new +
          </button>
          <nav className="sidebar-projects" aria-label="Projects">
            {projects.map((project) => (
              <Link className="sidebar-project-link" key={project.id} to={`/projects/${project.id}`}>
                {project.title}
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-section sidebar-footer">
          <p className="sidebar-label">Account</p>
          <nav className="sidebar-nav" aria-label="Secondary">
            <a className="sidebar-link" href="https://docs.audaisy.app" target="_blank" rel="noreferrer">
              Documentation
            </a>
            <Link className="sidebar-link" to="/library?view=settings">
              Settings
            </Link>
          </nav>
          <div className="profile-row">
            <div className="profile-avatar" aria-hidden="true">
              {avatarLetter}
            </div>
            <div className="profile-copy">
              <span className="profile-name">{profile.name}</span>
              <span className="profile-meta">macOS local profile</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-shell-content">{children}</main>
    </div>
  );
}
