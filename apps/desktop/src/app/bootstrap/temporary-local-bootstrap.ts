import { createContext, useContext } from "react";

// Temporary app-local support until backend-owned shared contracts expose first-run profile readiness.
export type TemporaryLocalProfile = {
  name: string;
  avatar: string | null;
};

export type TemporaryLocalBootstrapSupport = {
  getLocalProfile: () => Promise<TemporaryLocalProfile>;
};

export const TemporaryLocalBootstrapContext = createContext<TemporaryLocalBootstrapSupport | null>(null);

export function useTemporaryLocalBootstrapSupport() {
  const support = useContext(TemporaryLocalBootstrapContext);

  if (!support) {
    throw new Error("Temporary local bootstrap support is not available in context.");
  }

  return support;
}
