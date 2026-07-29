import type { Metadata } from "next";

import AppShell from "@/components/layout/AppShell";
import PageAdAccountMappingPanel from "@/components/settings/PageAdAccountMappingPanel";

export const metadata: Metadata = {
  title:
    "Page–Ad Account Mapping | 80 AI OS",
  description:
    "กำหนดบัญชีโฆษณาหลักให้แต่ละ Facebook Page สำหรับ Linkage และ Historical Insight Backfill",
};

export default function PageAdAccountMappingPage() {
  return (
    <AppShell>
      <PageAdAccountMappingPanel />
    </AppShell>
  );
}
