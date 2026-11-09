import { BrandMark } from "@/components/brand-mark";
import { ProvisioningStatus } from "@/components/provisioning-status/provisioning-status";

export default function CreatingApp() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex h-12 items-center border-border border-b px-4">
        <BrandMark />
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <ProvisioningStatus
          className="w-full max-w-lg"
          detail="Saving your prompt and opening a workspace…"
          title="Creating your app"
        />
      </div>
    </main>
  );
}
