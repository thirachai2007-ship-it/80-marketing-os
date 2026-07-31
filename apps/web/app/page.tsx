import AppShell from "@/components/layout/AppShell";
import OwnerCommandCenter from "@/components/owner/OwnerCommandCenter";

export default function HomePage() {
  return (
    <AppShell>
      <OwnerCommandCenter />
    </AppShell>
  );
}
