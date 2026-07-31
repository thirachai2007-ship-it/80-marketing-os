"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarClock,
  LoaderCircle,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type DashboardState = {
  recommendedPosts: number;
  analyzedPosts: number;
  averageScore: number;
  campaignsTracked: number;
};

const emptyState: DashboardState = {
  recommendedPosts: 0,
  analyzedPosts: 0,
  averageScore: 0,
  campaignsTracked: 0,
};

export default function OwnerCommandCenter() {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const [contentResponse, metaResponse] = await Promise.all([
          fetch("/api/media-buyer/content-analysis-results?page=1&pageSize=1", {
            cache: "no-store",
          }),
          fetch("/api/meta/ad-objects", { cache: "no-store" }),
        ]);
        const content = contentResponse.ok ? await contentResponse.json() : null;
        const meta = metaResponse.ok ? await metaResponse.json() : null;
        setState({
          recommendedPosts:
            Number(content?.summary?.useExistingPost ?? 0) +
            Number(content?.summary?.createDarkPost ?? 0),
          analyzedPosts: Number(content?.summary?.total ?? 0),
          averageScore: Number(content?.summary?.averageScore ?? 0),
          campaignsTracked: Number(meta?.totals?.campaigns ?? 0),
        });
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const workspaces = [
    {
      title: "โพสต์และ Dark Post ที่แนะนำ",
      description:
        "ดูพรีวิวภาพหรือวิดีโอ พร้อมข้อความโฆษณา จุดแข็ง จุดอ่อน อายุ จังหวัด และความสนใจ",
      href: "/marketing/content-intelligence/results",
      icon: BrainCircuit,
      accent: "from-teal-500 to-cyan-500",
    },
    {
      title: "รายงานคุณภาพโฆษณารายวัน",
      description:
        "อ่านผลทุกบัญชีโฆษณาที่เชื่อมต่อ พร้อมคำแนะนำว่าควรปรับภาพ วิดีโอ ข้อความ หรือกลุ่มเป้าหมายอย่างไร",
      href: "/marketing/ad-health",
      icon: BarChart3,
      accent: "from-blue-500 to-indigo-500",
    },
    {
      title: "แผนแอดใหม่และคอนเทนต์",
      description:
        "รายการงานที่ควรเตรียมทุก 7 วัน และสิ่งที่แต่ละเพจกำลังขาด เพื่อส่งต่อให้ทีมคอนเทนต์",
      href: "/marketing/content-plan",
      icon: CalendarClock,
      accent: "from-amber-500 to-orange-500",
    },
    {
      title: "คุยกับ 80 Marketing AI",
      description:
        "ถามเรื่องแอด กลุ่มเป้าหมาย ยอดขาย หรือแนบภาพ วิดีโอ และเอกสารเพื่อขอคำปรึกษาได้ทุกเมื่อ",
      href: "/marketing/ai-chat",
      icon: MessageCircleMore,
      accent: "from-violet-500 to-fuchsia-500",
    },
  ];

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[34px] bg-[#071827] p-7 text-white shadow-2xl sm:p-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
            <ShieldCheck size={14} />
            READ-ONLY MARKETING ADVISOR
          </div>
          <h1 className="heading-font mt-5 text-3xl font-bold sm:text-4xl">
            80 Marketing AI วิเคราะห์และแนะนำ คุณเป็นผู้ทำโฆษณาใน Meta
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            ระบบอ่านข้อมูลโพสต์ย้อนหลัง 75 วันและผลโฆษณาจาก Meta เพื่อช่วยคัดโพสต์
            เตรียม Dark Post Preview แนะนำกลุ่มเป้าหมาย และบอกสิ่งที่ควรปรับปรุง
            โดยจะไม่สร้างหรือแก้ไขโฆษณาใน Meta
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["วิเคราะห์แล้ว", state.analyzedPosts, "โพสต์ในฐานข้อมูล 75 วัน"],
          ["แนะนำให้พิจารณา", state.recommendedPosts, "Existing Post หรือ Dark Post"],
          ["คะแนนเฉลี่ย", state.averageScore, "คะแนนคัดกรอง ไม่ใช่คำรับรองยอดขาย"],
          ["แคมเปญที่ติดตาม", state.campaignsTracked, "อ่านจาก Meta โดยไม่แก้ไข"],
        ].map(([label, value, detail]) => (
          <article key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">
              {loading ? <LoaderCircle className="animate-spin text-cyan-600" size={26} /> : Number(value).toLocaleString("th-TH")}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {workspaces.map(({ title, description, href, icon: Icon, accent }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
                <Icon size={23} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-cyan-700">
                  เปิดดู <ArrowRight size={15} className="transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="flex gap-3 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-6 text-cyan-950">
        <Sparkles className="mt-0.5 shrink-0 text-cyan-700" size={20} />
        AI จะแนะนำสิ่งที่ควรทำพร้อมเหตุผล แต่การสร้างแคมเปญ แก้ไขแอด กำหนดงบ วันเวลา และการเปิดโฆษณา เป็นหน้าที่ของคุณใน Meta ทั้งหมด
      </section>
    </div>
  );
}
