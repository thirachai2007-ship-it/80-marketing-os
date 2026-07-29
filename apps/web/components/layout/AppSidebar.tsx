"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Beaker,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronRight,
  ShieldCheck,
  Settings,
  Sparkles,
} from "lucide-react";

type MenuItem = {
  title: string;
  href?: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;
  badge?: string;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    title: "OWNER",
    items: [
      {
        title: "Approval Center",
        href: "/",
        icon: ShieldCheck,
      },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      {
        title: "Content Intelligence",
        href: "/marketing/content-intelligence",
        icon: BrainCircuit,
      },
      {
        title: "Experiments",
        href: "/marketing/experiments",
        icon: Beaker,
      },
      {
        title: "Settings",
        href: "/settings/meta",
        icon: Settings,
      },
    ],
  },
];

function isMenuActive(pathname: string, href?: string) {
  if (!href) return false;

  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/marketing") {
    return pathname === "/marketing";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar flex h-screen w-[260px] shrink-0 flex-col overflow-hidden border-r border-slate-800/80">
      {/* Brand */}
      <div className="border-b border-white/10 px-5 py-6">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-2xl outline-none"
        >
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-500 text-white shadow-[0_12px_30px_rgba(20,184,166,0.32)]">
            <Boxes size={24} strokeWidth={2.2} />

            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0f172a] bg-emerald-400" />
          </div>

          <div className="min-w-0">
            <h1 className="logo-font truncate text-[22px] font-bold text-white">
              80 AI OS
            </h1>

            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              Business Operating System
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {menuGroups.map((group) => (
          <section
            key={group.title}
            className="mb-7 last:mb-0"
          >
            <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              {group.title}
            </p>

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isMenuActive(pathname, item.href);

                const content = (
                  <>
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                          active
                            ? "bg-white/15 text-white"
                            : "bg-white/[0.035] text-slate-400 group-hover:bg-white/[0.07] group-hover:text-white",
                        ].join(" ")}
                      >
                        <Icon size={17} />
                      </div>

                      <span className="truncate text-[13px] font-medium">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {item.badge && !active && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
                          {item.badge}
                        </span>
                      )}

                      {active && (
                        <ChevronRight
                          size={15}
                          className="text-white/80"
                        />
                      )}
                    </div>
                  </>
                );

                if (!item.href) {
                  return (
                    <button
                      key={item.title}
                      type="button"
                      disabled
                      title={`${item.title} กำลังพัฒนา`}
                      className="group flex h-11 w-full cursor-not-allowed items-center justify-between rounded-xl px-2.5 text-left text-slate-400 opacity-75"
                    >
                      {content}
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className={[
                      "group relative flex h-11 w-full items-center justify-between overflow-hidden rounded-xl px-2.5 outline-none transition-all",
                      active
                        ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-[0_10px_25px_rgba(20,184,166,0.22)]"
                        : "text-slate-300 hover:bg-white/[0.065] hover:text-white",
                    ].join(" ")}
                  >
                    {active && (
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-white/90" />
                    )}

                    {content}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      {/* AI Engine status */}
      <div className="px-3 pb-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-inner">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
                <Bot size={20} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-white">
                    AI Engine
                  </p>

                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                </div>

                <p className="mt-1 text-[10px] text-slate-400">
                  Online and ready
                </p>
              </div>
            </div>

            <Sparkles
              size={15}
              className="mt-1 text-teal-300"
            />
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-teal-400 to-cyan-400" />
          </div>

          <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
            <span>System status</span>
            <span className="font-semibold text-emerald-400">
              Healthy
            </span>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          className="group flex w-full items-center justify-between rounded-2xl px-2.5 py-2.5 text-left hover:bg-white/[0.055]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-sm font-bold text-white shadow-lg">
              80
            </div>

            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">
                80t-shirt
              </p>

              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                Administrator
              </p>
            </div>
          </div>

          <Settings
            size={15}
            className="shrink-0 text-slate-500 transition-transform group-hover:rotate-45 group-hover:text-white"
          />
        </button>
      </div>
    </aside>
  );
}
