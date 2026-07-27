"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({
  children,
}: AppShellProps) {
  const pathname = usePathname();

  const isDashboard = pathname === "/";

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F7FB]">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader />

        <main
          className={[
            "min-h-0 flex-1 px-6 py-4",
            isDashboard
              ? "overflow-hidden"
              : "overflow-y-auto",
          ].join(" ")}
        >
          <div
            className={[
              "mx-auto max-w-[1700px]",
              isDashboard ? "h-full" : "min-h-full",
            ].join(" ")}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}