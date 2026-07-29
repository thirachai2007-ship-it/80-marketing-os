import AppShell from "@/components/layout/AppShell";
import OwnerApprovalCenter from "@/components/approval/OwnerApprovalCenter";

export default function HomePage() {
  return (
    <AppShell>
      <OwnerApprovalCenter />
    </AppShell>
  );
}
