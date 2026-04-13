import { avatarOptions, homeShellAssets } from "@/assets/home-shell-assets";

describe("home shell assets", () => {
  it("exposes the expected manifest entries", () => {
    expect(homeShellAssets.brand.daisy).toBeTruthy();
    expect(homeShellAssets.shell.toggle).toBeTruthy();
    expect(homeShellAssets.shell.home).toBeTruthy();
    expect(homeShellAssets.shell.trash).toBeTruthy();
    expect(homeShellAssets.shell.activeJobs).toBeTruthy();
    expect(homeShellAssets.shell.sampleProject).toBeTruthy();
    expect(homeShellAssets.shell.startSomethingNew).toBeTruthy();
    expect(homeShellAssets.shell.documentation).toBeTruthy();
    expect(homeShellAssets.shell.settings).toBeTruthy();
    expect(avatarOptions.length).toBeGreaterThanOrEqual(12);
  });
});
