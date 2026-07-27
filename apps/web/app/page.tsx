import AppShell from "@/components/layout/AppShell";

import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Megaphone,
  PackageCheck,
  Palette,
  Plus,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  WandSparkles,
} from "lucide-react";

const stats = [
  {
    title: "ยอดขายวันนี้",
    value: "฿328,540",
    change: "+12.5%",
    icon: Banknote,
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "ออเดอร์วันนี้",
    value: "248",
    change: "+8.3%",
    icon: ShoppingCart,
    iconClass: "bg-blue-50 text-blue-600",
  },
  {
    title: "ลูกค้าใหม่",
    value: "32",
    change: "+14.7%",
    icon: Users,
    iconClass: "bg-violet-50 text-violet-600",
  },
  {
    title: "กำไรวันนี้",
    value: "฿82,450",
    change: "+15.2%",
    icon: TrendingUp,
    iconClass: "bg-orange-50 text-orange-600",
  },
];

const activities = [
  {
    name: "Marketing AI",
    detail: "สร้างคอนเทนต์ 15 ชิ้น",
    time: "2 นาที",
    icon: Megaphone,
    iconClass: "bg-blue-50 text-blue-600",
  },
  {
    name: "Sales AI",
    detail: "วิเคราะห์ลูกค้า 24 ราย",
    time: "5 นาที",
    icon: ShoppingCart,
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  {
    name: "Graphic AI",
    detail: "ออกแบบงาน 8 ชิ้น",
    time: "12 นาที",
    icon: Palette,
    iconClass: "bg-violet-50 text-violet-600",
  },
  {
    name: "Production AI",
    detail: "วางแผนการผลิต",
    time: "18 นาที",
    icon: PackageCheck,
    iconClass: "bg-cyan-50 text-cyan-600",
  },
  {
    name: "Finance AI",
    detail: "วิเคราะห์รายได้",
    time: "25 นาที",
    icon: CircleDollarSign,
    iconClass: "bg-orange-50 text-orange-600",
  },
];

const agents = [
  {
    name: "Marketing AI",
    icon: Megaphone,
    iconClass: "bg-teal-50 text-teal-600",
  },
  {
    name: "Sales AI",
    icon: ShoppingCart,
    iconClass: "bg-orange-50 text-orange-600",
  },
  {
    name: "Graphic AI",
    icon: Palette,
    iconClass: "bg-violet-50 text-violet-600",
  },
  {
    name: "Production AI",
    icon: PackageCheck,
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  {
    name: "Finance AI",
    icon: CircleDollarSign,
    iconClass: "bg-blue-50 text-blue-600",
  },
];

const campaigns = [
  {
    title: "โปรโมชั่นเสื้อทีมองค์กร",
    budget: "฿12,450",
    roas: "2.45 ROAS",
    sales: "156",
    status: "Active",
    statusClass: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "ออกแบบลายใหม่ คอลเลกชัน 80",
    budget: "฿8,900",
    roas: "3.12 ROAS",
    sales: "89",
    status: "Active",
    statusClass: "bg-blue-50 text-blue-600",
  },
  {
    title: "โปรโมชันรับเปิดเทอม",
    budget: "฿5,200",
    roas: "1.78 ROAS",
    sales: "45",
    status: "Paused",
    statusClass: "bg-slate-100 text-slate-500",
  },
];

const quickActions = [
  {
    title: "สร้างคอนเทนต์",
    icon: WandSparkles,
    iconClass: "text-emerald-600",
    boxClass: "bg-emerald-50",
  },
  {
    title: "วิเคราะห์ข้อมูล",
    icon: BarChart3,
    iconClass: "text-blue-600",
    boxClass: "bg-blue-50",
  },
  {
    title: "สร้างแคมเปญ",
    icon: Megaphone,
    iconClass: "text-violet-600",
    boxClass: "bg-violet-50",
  },
  {
    title: "ออกแบบงาน",
    icon: Palette,
    iconClass: "text-orange-600",
    boxClass: "bg-orange-50",
  },
  {
    title: "รายงานสรุป",
    icon: FileText,
    iconClass: "text-teal-600",
    boxClass: "bg-teal-50",
  },
  {
    title: "เพิ่มลูกค้า",
    icon: Plus,
    iconClass: "text-cyan-600",
    boxClass: "bg-cyan-50",
  },
];

const tasks = [
  {
    title: "อนุมัติแบบเสื้อใหม่ 12 แบบ",
    status: "ด่วน",
    statusClass: "bg-rose-50 text-rose-600",
    time: "2 ชม.",
  },
  {
    title: "ตรวจสอบแคมเปญ Facebook",
    status: "ปานกลาง",
    statusClass: "bg-orange-50 text-orange-600",
    time: "4 ชม.",
  },
  {
    title: "สรุปรายงานยอดขายประจำวัน",
    status: "ปานกลาง",
    statusClass: "bg-orange-50 text-orange-600",
    time: "6 ชม.",
  },
  {
    title: "อัปเดตข้อมูลสินค้าใหม่",
    status: "ต่ำ",
    statusClass: "bg-emerald-50 text-emerald-600",
    time: "1 วัน",
  },
];

function SalesChart() {
  return (
    <div className="mt-3 min-h-0 flex-1">
      <div className="mb-2 flex items-end gap-3">
        <p className="mono-font text-2xl font-bold text-slate-900">
          ฿876,543
        </p>

        <div className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <ArrowUpRight size={13} />
          18.6%
        </div>
      </div>

      <div className="relative h-[155px] overflow-hidden rounded-xl bg-gradient-to-b from-white to-teal-50/40">
        <div className="absolute inset-0 flex flex-col justify-between py-2">
          {[150, 100, 50, 0].map((value) => (
            <div
              key={value}
              className="relative border-t border-dashed border-slate-200"
            >
              <span className="absolute -top-2.5 left-0 bg-white pr-1 text-[8px] text-slate-400">
                {value}K
              </span>
            </div>
          ))}
        </div>

        <svg
          viewBox="0 0 700 220"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          aria-label="กราฟยอดขาย 7 วันที่ผ่านมา"
        >
          <defs>
            <linearGradient
              id="salesAreaCompact"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#14b8a6"
                stopOpacity="0.28"
              />

              <stop
                offset="100%"
                stopColor="#14b8a6"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          <path
            d="M40 165 C95 145,130 178,185 125 C235 82,270 148,330 143 C390 135,420 88,480 103 C545 120,575 69,660 42 L660 220 L40 220 Z"
            fill="url(#salesAreaCompact)"
          />

          <path
            d="M40 165 C95 145,130 178,185 125 C235 82,270 148,330 143 C390 135,420 88,480 103 C545 120,575 69,660 42"
            fill="none"
            stroke="#14b8a6"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {[
            [40, 165],
            [145, 160],
            [230, 102],
            [330, 143],
            [445, 96],
            [545, 104],
            [660, 42],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle
                cx={x}
                cy={y}
                r="7"
                fill="#ffffff"
              />

              <circle
                cx={x}
                cy={y}
                r="4"
                fill="#14b8a6"
              />
            </g>
          ))}
        </svg>

        <div className="absolute inset-x-6 bottom-1 flex justify-between text-[8px] text-slate-400">
          <span>16 พ.ค.</span>
          <span>17 พ.ค.</span>
          <span>18 พ.ค.</span>
          <span>19 พ.ค.</span>
          <span>20 พ.ค.</span>
          <span>21 พ.ค.</span>
          <span>22 พ.ค.</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="animate-fade-in grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1.12fr)_minmax(0,0.88fr)] gap-4 overflow-hidden">
        {/* Heading */}
        <section className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-teal-600">
              Business overview
            </p>

            <h1 className="heading-font mt-1 text-[28px] font-bold leading-none text-slate-900">
              Dashboard
            </h1>

            <p className="mt-1.5 text-xs text-slate-500">
              ภาพรวมธุรกิจและการทำงานของ 80t-shirt วันนี้
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Sparkles
              size={15}
              className="text-teal-500"
            />

            <div>
              <p className="text-[10px] font-semibold text-slate-700">
                AI System Ready
              </p>

              <p className="text-[8px] text-slate-400">
                ทุกระบบทำงานปกติ
              </p>
            </div>

            <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          </div>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.title}
                className="app-card app-card-interactive px-4 py-3"
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.iconClass}`}
                  >
                    <Icon size={17} />
                  </div>

                  <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-600">
                    <ArrowUpRight size={10} />
                    {stat.change}
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-slate-500">
                  {stat.title}
                </p>

                <p className="mono-font mt-0.5 text-[20px] font-bold leading-none tracking-tight text-slate-900">
                  {stat.value}
                </p>

                <p className="mt-1.5 text-[8px] text-slate-400">
                  เทียบกับเมื่อวาน
                </p>
              </article>
            );
          })}
        </section>

        {/* Middle */}
        <section className="grid min-h-0 grid-cols-[1.45fr_1fr_0.9fr] gap-4">
          {/* Chart */}
          <article className="app-card flex min-h-0 flex-col p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  ยอดขาย 7 วันที่ผ่านมา
                </h2>

                <p className="mt-0.5 text-[9px] text-slate-500">
                  สรุปยอดขายล่าสุดของธุรกิจ
                </p>
              </div>

              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] text-slate-600 hover:bg-slate-50">
                7 วันล่าสุด
              </button>
            </div>

            <SalesChart />
          </article>

          {/* Activity */}
          <article className="app-card min-h-0 overflow-hidden p-4">
            <div className="flex items-center gap-2">
              <Sparkles
                size={15}
                className="text-teal-500"
              />

              <h2 className="text-sm font-bold text-slate-900">
                AI Activity
              </h2>
            </div>

            <p className="mt-0.5 text-[9px] text-slate-500">
              การทำงานล่าสุดของระบบ AI
            </p>

            <div className="mt-2 divide-y divide-slate-100">
              {activities.map((activity) => {
                const Icon = activity.icon;

                return (
                  <div
                    key={activity.name}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${activity.iconClass}`}
                      >
                        <Icon size={14} />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-semibold text-slate-800">
                          {activity.name}
                        </p>

                        <p className="truncate text-[8px] text-slate-400">
                          {activity.detail}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 text-[8px] text-slate-400">
                      {activity.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </article>

          {/* Agents */}
          <article className="app-card min-h-0 overflow-hidden p-4">
            <div className="flex items-center gap-2">
              <Bot
                size={15}
                className="text-teal-500"
              />

              <h2 className="text-sm font-bold text-slate-900">
                AI Agents
              </h2>
            </div>

            <p className="mt-0.5 text-[9px] text-slate-500">
              สถานะระบบผู้ช่วย AI
            </p>

            <div className="mt-2 space-y-1.5">
              {agents.map((agent) => {
                const Icon = agent.icon;

                return (
                  <div
                    key={agent.name}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${agent.iconClass}`}
                      >
                        <Icon size={13} />
                      </div>

                      <div>
                        <p className="text-[9px] font-semibold text-slate-800">
                          {agent.name}
                        </p>

                        <p className="text-[7px] text-slate-400">
                          พร้อมใช้งาน
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[8px] font-semibold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-teal-300 bg-white text-[9px] font-semibold text-teal-600 hover:bg-teal-50">
              <Bot size={12} />
              จัดการ AI Agents
            </button>
          </article>
        </section>

        {/* Bottom */}
        <section className="grid min-h-0 grid-cols-[1.35fr_0.95fr_0.95fr] gap-4">
          {/* Campaigns */}
          <article className="app-card min-h-0 overflow-hidden p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  แคมเปญล่าสุด
                </h2>

                <p className="text-[8px] text-slate-500">
                  ผลลัพธ์ของแคมเปญการตลาด
                </p>
              </div>

              <button className="text-[9px] font-semibold text-teal-600">
                ดูทั้งหมด
              </button>
            </div>

            <div className="mt-1.5 divide-y divide-slate-100">
              {campaigns.map((campaign, index) => (
                <div
                  key={campaign.title}
                  className="grid grid-cols-[38px_1fr_auto] items-center gap-3 py-2"
                >
                  <div
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded-xl",
                      index === 0
                        ? "bg-slate-900"
                        : index === 1
                          ? "bg-teal-600"
                          : "bg-slate-200",
                    ].join(" ")}
                  >
                    <Megaphone
                      size={15}
                      className={
                        index === 2
                          ? "text-slate-600"
                          : "text-white"
                      }
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[9px] font-semibold text-slate-800">
                        {campaign.title}
                      </p>

                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${campaign.statusClass}`}
                      >
                        {campaign.status}
                      </span>
                    </div>

                    <div className="mt-1 flex gap-3 text-[7px] text-slate-400">
                      <span>{campaign.budget}</span>
                      <span>{campaign.roas}</span>
                      <span>{campaign.sales} ยอดขาย</span>
                    </div>
                  </div>

                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                    •••
                  </button>
                </div>
              ))}
            </div>
          </article>

          {/* Quick Actions */}
          <article className="app-card min-h-0 overflow-hidden p-4">
            <h2 className="text-sm font-bold text-slate-900">
              Quick Actions
            </h2>

            <p className="text-[8px] text-slate-500">
              เครื่องมือที่ใช้งานบ่อย
            </p>

            <div className="mt-2 grid grid-cols-3 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    key={action.title}
                    className={`group min-h-[60px] rounded-xl border border-slate-100 p-2 text-left hover:-translate-y-0.5 hover:shadow-sm ${action.boxClass}`}
                  >
                    <Icon
                      size={15}
                      className={action.iconClass}
                    />

                    <p className="mt-2 text-[8px] font-semibold text-slate-700">
                      {action.title}
                    </p>
                  </button>
                );
              })}
            </div>
          </article>

          {/* Tasks */}
          <article className="app-card min-h-0 overflow-hidden p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  งานที่ต้องดำเนินการ
                </h2>

                <p className="text-[8px] text-slate-500">
                  รายการงานล่าสุด
                </p>
              </div>

              <button className="text-[9px] font-semibold text-teal-600">
                ดูทั้งหมด
              </button>
            </div>

            <div className="mt-1 divide-y divide-slate-100">
              {tasks.map((task) => (
                <div
                  key={task.title}
                  className="flex gap-2 py-2"
                >
                  <button className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white">
                    <CheckCircle2
                      size={10}
                      className="text-transparent hover:text-teal-500"
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[9px] font-medium text-slate-700">
                      {task.title}
                    </p>

                    <div className="mt-1 flex items-center justify-between">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${task.statusClass}`}
                      >
                        {task.status}
                      </span>

                      <span className="flex items-center gap-1 text-[7px] text-slate-400">
                        <Clock3 size={9} />
                        {task.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}