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
  existingPosts: number;
  darkPosts: number;
  activeAds: number;
  pausedAds: number;
};

const emptyState: DashboardState = {
  recommendedPosts: 0,
  analyzedPosts: 0,
  averageScore: 0,
  campaignsTracked: 0,
  existingPosts: 0,
  darkPosts: 0,
  activeAds: 0,
  pausedAds: 0,
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
          existingPosts: Number(content?.summary?.useExistingPost ?? 0),
          darkPosts: Number(content?.summary?.createDarkPost ?? 0),
          activeAds: Array.isArray(meta?.ads) ? meta.ads.filter((ad: { effectiveStatus?: string }) => ad.effectiveStatus === "ACTIVE").length : 0,
          pausedAds: Array.isArray(meta?.ads) ? meta.ads.filter((ad: { effectiveStatus?: string }) => ad.effectiveStatus !== "ACTIVE").length : 0,
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
            80 Marketing AI
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
        <Link href={workspaces[0].href} className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-teal-600">ภาพรวมโพสต์ 75 วัน</p><h2 className="mt-1 text-lg font-bold text-slate-950">โพสต์ที่ AI แนะนำ</h2></div><BrainCircuit className="text-teal-500" size={28}/></div>
          <div className="mt-5 flex items-center gap-6">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#14b8a6 0 ${state.analyzedPosts ? (state.existingPosts / state.analyzedPosts) * 100 : 0}%, #8b5cf6 0 ${state.analyzedPosts ? ((state.existingPosts + state.darkPosts) / state.analyzedPosts) * 100 : 0}%, #e2e8f0 0)` }}><div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl text-slate-950">{state.recommendedPosts}</strong><span className="text-[9px] text-slate-400">แนะนำ</span></div></div>
            <div className="min-w-0 flex-1 space-y-3 text-xs"><div><div className="flex justify-between"><span>ใช้โพสต์เดิม</span><b>{state.existingPosts}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal-500" style={{width: `${state.recommendedPosts ? state.existingPosts / state.recommendedPosts * 100 : 0}%`}}/></div></div><div><div className="flex justify-between"><span>สร้าง Dark Post</span><b>{state.darkPosts}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-500" style={{width: `${state.recommendedPosts ? state.darkPosts / state.recommendedPosts * 100 : 0}%`}}/></div></div><span className="inline-flex items-center gap-2 font-bold text-teal-700">ดูโพสต์และพรีวิว <ArrowRight size={14}/></span></div>
          </div>
        </Link>

        <Link href={workspaces[1].href} className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-blue-600">META READ-ONLY</p><h2 className="mt-1 text-lg font-bold text-slate-950">สถานะโฆษณาที่ซิงก์ล่าสุด</h2></div><BarChart3 className="text-blue-500" size={28}/></div>
          <div className="mt-6 flex h-40 items-end justify-center gap-8 border-b border-slate-200 px-5">
            {[{label:"ACTIVE",value:state.activeAds,color:"bg-emerald-500"},{label:"ไม่ ACTIVE",value:state.pausedAds,color:"bg-slate-400"}].map((bar) => { const max = Math.max(state.activeAds, state.pausedAds, 1); return <div key={bar.label} className="flex h-full w-24 flex-col items-center justify-end"><b className="mb-2 text-xl">{bar.value}</b><div className={`w-full rounded-t-2xl ${bar.color}`} style={{height:`${Math.max(8, bar.value / max * 105)}px`}}/><span className="mt-2 text-[10px] font-bold text-slate-500">{bar.label}</span></div>; })}
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-blue-700">ดูรายงานราย Ad พร้อมพรีวิว <ArrowRight size={14}/></p>
        </Link>

        <Link href={workspaces[2].href} className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-amber-600">วางแผนทุก 7 วัน</p><h2 className="mt-1 text-lg font-bold text-slate-950">ความพร้อมคอนเทนต์</h2></div><CalendarClock className="text-amber-500" size={28}/></div>
          <div className="mt-6 rounded-2xl bg-amber-50 p-5"><div className="flex items-end justify-between"><div><p className="text-xs text-amber-700">คะแนนเฉลี่ยของโพสต์</p><strong className="text-4xl text-amber-950">{state.averageScore}</strong><span className="text-sm text-amber-700"> / 100</span></div><div className="h-20 w-3 overflow-hidden rounded-full bg-white"><div className="w-full bg-amber-500" style={{height:`${state.averageScore}%`, marginTop:`${100-state.averageScore}%`}}/></div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500" style={{width:`${state.averageScore}%`}}/></div></div>
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-amber-700">ดูสิ่งที่แต่ละเพจกำลังขาด <ArrowRight size={14}/></p>
        </Link>

        <Link href={workspaces[3].href} className="group flex min-h-[260px] flex-col justify-between rounded-[28px] bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white shadow-lg transition hover:shadow-xl">
          <div><MessageCircleMore size={34}/><h2 className="mt-5 text-2xl font-bold">คุยกับ 80 Marketing AI</h2><p className="mt-3 text-sm leading-6 text-violet-100">ถามเรื่องแอด กลุ่มเป้าหมาย ผลโฆษณา หรือแนบภาพ วิดีโอ และเอกสารได้ทุกเมื่อ</p></div><span className="inline-flex items-center gap-2 text-sm font-bold">เปิดแชท <ArrowRight size={16}/></span>
        </Link>
      </section>

      <section className="flex gap-3 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-6 text-cyan-950">
        <Sparkles className="mt-0.5 shrink-0 text-cyan-700" size={20} />
        AI จะแนะนำสิ่งที่ควรทำพร้อมเหตุผล แต่การสร้างแคมเปญ แก้ไขแอด กำหนดงบ วันเวลา และการเปิดโฆษณา เป็นหน้าที่ของคุณใน Meta ทั้งหมด
      </section>
    </div>
  );
}
