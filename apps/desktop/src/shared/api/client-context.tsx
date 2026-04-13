import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { AudaisyClient } from "@/shared/api/client";

const AudaisyClientContext = createContext<AudaisyClient | null>(null);

type AudaisyClientProviderProps = {
  client: AudaisyClient;
  children: ReactNode;
};

export function AudaisyClientProvider({ client, children }: AudaisyClientProviderProps) {
  return <AudaisyClientContext.Provider value={client}>{children}</AudaisyClientContext.Provider>;
}

export function useAudaisyClient() {
  const client = useContext(AudaisyClientContext);

  if (!client) {
    throw new Error("Audaisy client is not available in context.");
  }

  return client;
}
