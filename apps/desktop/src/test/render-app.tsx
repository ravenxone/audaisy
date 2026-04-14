import { MemoryRouter, useLocation } from "react-router-dom";
import { render } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";

import { createAppRoutes } from "@/app/routes/create-app-routes";
import type { AudaisyClient } from "@/shared/api/client";

type RenderAppOptions = {
  client: AudaisyClient;
  initialEntries?: string[];
};

type RenderElementOptions = {
  initialEntries?: string[];
};

function MirrorLocation() {
  const location = useLocation();

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    window.history.replaceState({}, "", nextPath);
  }, [location]);

  return null;
}

export function renderApp({
  client,
  initialEntries = ["/"],
}: RenderAppOptions) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MirrorLocation />
      {createAppRoutes({ client })}
    </MemoryRouter>,
  );
}

export function renderWithElement(
  ui: ReactElement,
  { initialEntries = ["/"] }: RenderElementOptions = {},
) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}
