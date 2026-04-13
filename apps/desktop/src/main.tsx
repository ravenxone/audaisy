import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { createAppRoutes } from "@/app/routes/create-app-routes";
import { createInMemoryAudaisyClient } from "@/shared/api/adapters/in-memory-client";
import "@/shared/styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>{createAppRoutes(createInMemoryAudaisyClient())}</BrowserRouter>
  </StrictMode>,
);
