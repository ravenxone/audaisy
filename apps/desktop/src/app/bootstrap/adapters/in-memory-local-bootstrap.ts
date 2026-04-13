import type {
  TemporaryLocalBootstrapSupport,
  TemporaryLocalProfile,
} from "@/app/bootstrap/temporary-local-bootstrap";

type InMemoryTemporaryLocalBootstrapOptions = {
  profile?: TemporaryLocalProfile;
  getLocalProfileImpl?: () => Promise<TemporaryLocalProfile>;
};

const DEFAULT_TEMPORARY_LOCAL_PROFILE: TemporaryLocalProfile = {
  name: "Raven",
  avatar: "sunflower-avatar",
};

export function createInMemoryTemporaryLocalBootstrapSupport(
  options: InMemoryTemporaryLocalBootstrapOptions = {},
): TemporaryLocalBootstrapSupport {
  const profile = options.profile ?? DEFAULT_TEMPORARY_LOCAL_PROFILE;

  return {
    getLocalProfile: async () => (await options.getLocalProfileImpl?.()) ?? profile,
  };
}
