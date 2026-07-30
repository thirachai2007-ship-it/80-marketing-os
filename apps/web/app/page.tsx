import AppShell from "@/components/layout/AppShell";
import OwnerApprovalCenter from "@/components/approval/OwnerApprovalCenter";
import CreativeApprovalPanel from "@/components/approval/CreativeApprovalPanel";

export default function HomePage() {
  return (
    <AppShell>
      <OwnerApprovalCenter />
      <CreativeApprovalPanel />
    </AppShell>
  );
}
