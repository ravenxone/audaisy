import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { createInMemoryTemporaryLocalBootstrapSupport } from "@/app/bootstrap/adapters/in-memory-local-bootstrap";
import { createAppRoutes } from "@/app/routes/create-app-routes";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";
import "@/shared/styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

const client = createInMemoryAudaisyClient();
const temporaryLocalBootstrapSupport = createInMemoryTemporaryLocalBootstrapSupport();

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>{createAppRoutes({ client, temporaryLocalBootstrapSupport })}</BrowserRouter>
  </StrictMode>,
);
