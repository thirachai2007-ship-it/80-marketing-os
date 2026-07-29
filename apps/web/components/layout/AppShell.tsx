import type { ReactNode } from "react";

import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F7FB]">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader />

        <main
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          <div className="mx-auto min-h-full max-w-[1700px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
