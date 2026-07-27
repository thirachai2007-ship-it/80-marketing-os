"use client";

import { useState } from "react";

import AppShell from "@/components/layout/AppShell";
import GeneratorForm from "@/components/marketing/GeneratorForm";
import ResultPanel from "@/components/marketing/ResultPanel";

export default function MarketingPage() {
  const [result, setResult] = useState("");

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
        {/* Page heading */}
        <section className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">
            AI Marketing Workspace
          </p>

          <h1 className="heading-font mt-1 text-[30px] font-bold leading-[1.2] text-slate-900">
            Marketing AI
          </h1>

          <p className="mt-1.5 text-sm text-slate-500">
            AI Marketing Assistant powered by GPT-5.5
          </p>
        </section>

        {/* Workspace */}
        <section className="grid min-h-0 flex-1 grid-cols-12 gap-6">
          <div className="col-span-4 min-h-0">
            <GeneratorForm onResult={setResult} />
          </div>

          <div className="col-span-8 min-h-0">
            <ResultPanel result={result} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}