import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { readRuntimeBaseUrl, readRuntimeStartupError } from "@/app/bootstrap/runtime-bootstrap";
import { createAppRoutes } from "@/app/routes/create-app-routes";
import { createHttpAudaisyClient } from "@/shared/api/adapters/http-client";
import "@/shared/styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

const startupError = readRuntimeStartupError();
const runtimeBaseUrl = readRuntimeBaseUrl();

if (startupError) {
  createRoot(rootElement).render(
    <StrictMode>
      <main className="bootstrap-screen">
        <div className="status-panel">
          <h1 className="section-title">Startup issue</h1>
          <p className="body-text">{startupError}</p>
        </div>
      </main>
    </StrictMode>,
  );
} else {
  if (!runtimeBaseUrl) {
    throw new Error("Runtime base URL was not provided by the desktop shell.");
  }

  const client = createHttpAudaisyClient({ baseUrl: runtimeBaseUrl });

  createRoot(rootElement).render(
    <StrictMode>
      <BrowserRouter>{createAppRoutes({ client })}</BrowserRouter>
    </StrictMode>,
  );
}
