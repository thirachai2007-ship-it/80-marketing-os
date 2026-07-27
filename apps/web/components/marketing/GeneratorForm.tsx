"use client";

import { FormEvent, useState } from "react";
import {
  LoaderCircle,
  PenLine,
  Shirt,
  Sparkles,
  Type,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type GeneratorFormProps = {
  onResult: (result: string) => void;
};

export default function GeneratorForm({
  onResult,
}: GeneratorFormProps) {
  const [product, setProduct] = useState("aprons");
  const [contentType, setContentType] = useState("facebook");
  const [tone, setTone] = useState("ขายของ");
  const [keyword, setKeyword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generateContent(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!keyword.trim()) {
      setError("กรุณากรอก Keyword ก่อนสร้างคอนเทนต์");
      return;
    }

    setLoading(true);
    setError("");
    onResult("");

    try {
      const response = await fetch(
        "/api/marketing/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product,
            contentType,
            tone,
            keyword: keyword.trim(),
          }),
        },
      );

      const data = (await response.json()) as {
        result?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "ไม่สามารถสร้างคอนเทนต์ได้",
        );
      }

      if (!data.result) {
        throw new Error("AI ไม่ได้ส่งผลลัพธ์กลับมา");
      }

      onResult(data.result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={generateContent}
      className="app-card sticky top-4 flex max-h-[calc(100vh-120px)] min-h-0 flex-col overflow-hidden p-6"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="app-icon-box h-11 w-11 shrink-0">
          <Sparkles size={20} />
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">
            Generate Content
          </h2>

          <p className="mt-0.5 text-[11px] text-slate-500">
            AI จะสร้างคอนเทนต์จากข้อมูลที่คุณเลือก
          </p>
        </div>
      </div>

      {/* Fields */}
      <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1 pb-3">
        {/* Product */}
        <div>
          <label
            htmlFor="product"
            className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700"
          >
            <Shirt size={14} />
            สินค้า
          </label>

          <select
            id="product"
            value={product}
            onChange={(event) =>
              setProduct(event.target.value)
            }
            disabled={loading}
            className="app-input h-12 min-h-0 appearance-none text-sm"
          >
            <option value="aprons">
              ผ้ากันเปื้อน
            </option>
          </select>
        </div>

        {/* Content type */}
        <div>
          <label
            htmlFor="contentType"
            className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700"
          >
            <Type size={14} />
            ประเภทคอนเทนต์
          </label>

          <select
            id="contentType"
            value={contentType}
            onChange={(event) =>
              setContentType(event.target.value)
            }
            disabled={loading}
            className="app-input h-12 min-h-0 appearance-none text-sm"
          >
            <option value="facebook">
              Facebook
            </option>
            <option value="tiktok">
              TikTok
            </option>
            <option value="seo">
              SEO Article
            </option>
            <option value="line-oa">
              LINE OA
            </option>
          </select>
        </div>

        {/* Tone */}
        <div>
          <label
            htmlFor="tone"
            className="mb-2 block text-xs font-medium text-slate-700"
          >
            โทนการสื่อสาร
          </label>

          <select
            id="tone"
            value={tone}
            onChange={(event) =>
              setTone(event.target.value)
            }
            disabled={loading}
            className="app-input h-12 min-h-0 appearance-none text-sm"
          >
            <option value="ขายของ">
              ขายของ
            </option>
            <option value="มืออาชีพ">
              มืออาชีพ
            </option>
            <option value="เป็นกันเอง">
              เป็นกันเอง
            </option>
            <option value="พรีเมียม">
              พรีเมียม
            </option>
          </select>
        </div>

        {/* Keyword */}
        <div>
          <label
            htmlFor="keyword"
            className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700"
          >
            <PenLine size={14} />
            Keyword
          </label>

          <input
            id="keyword"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);

              if (error) {
                setError("");
              }
            }}
            disabled={loading}
            placeholder="เช่น ผ้ากันเปื้อนร้านกาแฟ"
            className="app-input h-12 min-h-0 text-sm"
          />

          {error && (
            <p
              role="alert"
              className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-600"
            >
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Fixed action */}
      <div className="shrink-0 border-t border-slate-100 bg-white pt-4">
        <Button
          type="submit"
          disabled={loading}
          className="app-button-primary h-12 w-full rounded-2xl text-sm"
        >
          {loading ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              กำลังสร้างคอนเทนต์...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Content
            </>
          )}
        </Button>
      </div>
    </form>
  );
}