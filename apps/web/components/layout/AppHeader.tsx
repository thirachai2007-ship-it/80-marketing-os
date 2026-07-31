"use client";

import { usePathname } from "next/navigation";

import {
  Bell,
  ChevronDown,
  Menu,
  Search,
} from "lucide-react";

const pageTitles: Record<
  string,
  {
    title: string;
    subtitle: string;
  }
> = {
  "/": {
    title: "Owner Command Center",
    subtitle: "รายงานและ Dark Post ที่พร้อมให้คุณเปิดใน Meta",
  },
  "/marketing": {
    title: "Marketing AI",
    subtitle: "สร้างคอนเทนต์และแคมเปญด้วย AI",
  },
  "/settings/meta": {
    title: "Meta Integration",
    subtitle: "จัดการการเชื่อมต่อและสถานะข้อมูล Meta",
  },
  "/settings/meta/page-ad-account-mapping": {
    title: "Page–Ad Account Mapping",
    subtitle:
      "กำหนดบัญชีโฆษณาหลักให้แต่ละ Facebook Page",
  },
};

function getPageInfo(pathname: string) {
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }

  if (pathname.startsWith("/marketing")) {
    return pageTitles["/marketing"];
  }

  if (pathname.startsWith("/settings")) {
    return pageTitles["/settings/meta"];
  }

  return {
    title: "80 AI OS",
    subtitle: "Business Operating System",
  };
}

export default function AppHeader() {
  const pathname = usePathname();
  const pageInfo = getPageInfo(pathname);

  return (
    <header className="app-header flex h-[72px] shrink-0 items-center justify-between px-6">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          aria-label="เปิดเมนู"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
        >
          <Menu size={19} />
        </button>

        <div className="min-w-0">
          <h1 className="heading-font truncate pb-1.5 text-[22px] font-bold leading-[1.2] text-slate-900">
            {pageInfo.title}
          </h1>

          <p className="truncate text-[10px] text-slate-500">
            {pageInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="hidden h-10 w-[300px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 lg:flex">
          <Search
            size={16}
            className="shrink-0 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search anything..."
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />

          <kbd className="mono-font rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] text-slate-400 shadow-sm">
            ⌘ K
          </kbd>
        </div>

        {/* Notification */}
        <button
          type="button"
          aria-label="การแจ้งเตือน"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
        >
          <Bell size={17} />

          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
        </button>

        {/* Profile */}
        <button
          type="button"
          className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-2.5 pr-3 shadow-sm hover:bg-slate-50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-sm font-bold text-white shadow-md">
            80
          </div>

          <div className="hidden min-w-0 text-left sm:block">
            <p className="truncate text-[11px] font-semibold text-slate-900">
              80t-shirt
            </p>

            <p className="truncate text-[9px] text-slate-400">
              Administrator
            </p>
          </div>

          <ChevronDown
            size={14}
            className="hidden text-slate-400 sm:block"
          />
        </button>
      </div>
    </header>
  );
}
