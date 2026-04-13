import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { ProjectCard } from "@audaisy/contracts";

import type { TemporaryLocalProfile } from "@/app/bootstrap/temporary-local-bootstrap";

type AppShellProps = {
  projects: ProjectCard[];
  profile: TemporaryLocalProfile;
  children: ReactNode;
};

export function AppShell({ projects, profile, children }: AppShellProps) {
  const profileName = profile.name.trim() || "Profile setup needed";
  const avatarLetter = profileName.charAt(0).toUpperCase() || "A";
  const profileMeta = profile.avatar ? "macOS local profile" : "Local profile still needs setup";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-section">
          <p className="sidebar-label">Main</p>
          <nav className="sidebar-nav" aria-label="Primary">
            <Link className="sidebar-link" to="/library">
              Home
            </Link>
            <span aria-disabled="true" className="sidebar-link sidebar-link-disabled">
              Trash
            </span>
            <span aria-disabled="true" className="sidebar-link sidebar-link-disabled">
              Active Jobs
            </span>
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
            <span aria-disabled="true" className="sidebar-link sidebar-link-disabled">
              Settings
            </span>
          </nav>
          <div className="profile-row">
            <div className="profile-avatar" aria-hidden="true">
              {avatarLetter}
            </div>
            <div className="profile-copy">
              <span className="profile-name">{profileName}</span>
              <span className="profile-meta">{profileMeta}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-shell-content">{children}</main>
    </div>
  );
}
