"use client";

import { Button } from "@/components/ui/button";
import {
  Copy,
  RefreshCcw,
  Sparkles,
} from "lucide-react";

type Props = {
  result?: string;
};

export default function ResultPanel({
  result,
}: Props) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,.08)]">

      {/* Header */}

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-3">

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500">

            <Sparkles className="text-white" size={22} />

          </div>

          <div>

            <h2 className="text-2xl font-bold text-slate-900">
              AI Result
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              GPT-5.5 Generated Content
            </p>

          </div>

        </div>

        <div className="flex gap-3">

          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl border-slate-200 hover:bg-slate-100"
          >
            <Copy size={18} />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl border-slate-200 hover:bg-slate-100"
          >
            <RefreshCcw size={18} />
          </Button>

        </div>

      </div>

      {/* Content */}

      <div className="mt-8 min-h-[560px] rounded-3xl border border-slate-200 bg-slate-50 p-8">

        {result ? (

          <pre className="whitespace-pre-wrap leading-8 text-slate-700">
            {result}
          </pre>

        ) : (

          <div className="flex h-[470px] flex-col items-center justify-center">

            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg">

              <Sparkles
                className="text-white"
                size={40}
              />

            </div>

            <h3 className="text-2xl font-bold text-slate-800">
              AI พร้อมสร้างคอนเทนต์
            </h3>

            <p className="mt-3 max-w-md text-center text-slate-500 leading-7">

              เลือกสินค้า ประเภทคอนเทนต์ และ Keyword
              จากนั้นกด <strong>Generate Content</strong>

              <br />

              GPT-5.5 จะสร้างข้อความให้อัตโนมัติ

            </p>

          </div>

        )}

      </div>

    </div>
  );
}