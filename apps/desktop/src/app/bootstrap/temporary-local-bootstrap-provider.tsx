import type { ReactNode } from "react";

import {
  TemporaryLocalBootstrapContext,
  type TemporaryLocalBootstrapSupport,
} from "@/app/bootstrap/temporary-local-bootstrap";

type TemporaryLocalBootstrapProviderProps = {
  support: TemporaryLocalBootstrapSupport;
  children: ReactNode;
};

export function TemporaryLocalBootstrapProvider({
  support,
  children,
}: TemporaryLocalBootstrapProviderProps) {
  return (
    <TemporaryLocalBootstrapContext.Provider value={support}>{children}</TemporaryLocalBootstrapContext.Provider>
  );
}
