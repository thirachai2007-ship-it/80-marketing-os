"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  File,
  LoaderCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type Attachment = {
  name: string;
  type: string;
  size: number;
  aiReadable: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  createdAt: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OwnerAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/media-buyer/owner-ai-chat", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          ok: boolean;
          messages?: ChatMessage[];
          error?: string;
        };
        if (!response.ok || !data.ok) throw new Error(data.error || "โหลดแชทไม่สำเร็จ");
        setMessages(data.messages ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "โหลดแชทไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!text.trim() && files.length === 0) || sending) return;
    const submittedText = text.trim();
    const submittedFiles = [...files];
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: submittedText,
      attachments: submittedFiles.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        aiReadable: !file.type.startsWith("video/"),
      })),
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);
    setText("");
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
    setSending(true);
    setError("");

    const form = new FormData();
    form.set("message", submittedText);
    submittedFiles.forEach((file) => form.append("files", file));

    try {
      const response = await fetch("/api/media-buyer/owner-ai-chat", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        ok: boolean;
        messages?: ChatMessage[];
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "ส่งข้อความไม่สำเร็จ");
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        ...(data.messages ?? []),
      ]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-112px)] max-w-[1450px] flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-[#071827] px-6 py-5 text-white">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg">
            <Bot size={25} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">คุยกับ 80 AI</h1>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <p className="mt-1 text-xs text-slate-300">
              ที่ปรึกษา Media Buyer, การตลาด และระบบ 80T-shirt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-200">
          <ShieldCheck size={15} />
          ที่ปรึกษาแบบ READ-ONLY · ไม่สร้างหรือแก้โฆษณาใน Meta
        </div>
      </header>

      <main className="flex-1 space-y-5 overflow-y-auto bg-slate-50/80 px-4 py-6 sm:px-8">
        {!loading && messages.length === 0 && (
          <div className="mx-auto mt-12 max-w-2xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-100 text-cyan-700">
              <Sparkles size={28} />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-slate-950">
              สั่งงานหรือปรึกษา AI ได้เลย
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              แนบภาพ วิดีโอ PDF Word หรือไฟล์ข้อมูล เพื่อวิเคราะห์แอด คอนเทนต์
              กลุ่มเป้าหมาย และแนวทางเพิ่ม ROAS
            </p>
          </div>
        )}
        {loading && (
          <div className="flex h-full items-center justify-center text-cyan-700">
            <LoaderCircle className="animate-spin" size={28} />
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[86%] rounded-3xl px-5 py-4 text-sm leading-7 shadow-sm sm:max-w-[72%] ${
                message.role === "user"
                  ? "rounded-br-md bg-gradient-to-br from-teal-500 to-cyan-600 text-white"
                  : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.attachments.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-white/20 pt-3">
                  {message.attachments.map((attachment) => (
                    <div key={`${message.id}-${attachment.name}`} className="flex items-center gap-2 text-xs">
                      <File size={14} />
                      <span className="truncate">{attachment.name}</span>
                      <span className="opacity-70">{formatBytes(attachment.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-3xl rounded-bl-md border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
              <LoaderCircle className="animate-spin text-cyan-600" size={18} />
              80 AI กำลังวิเคราะห์...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <form onSubmit={submit} className="border-t border-slate-200 bg-white p-4 sm:p-5">
        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex max-w-xs items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                <File size={14} className="shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-cyan-600">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`ลบ ${file.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-100">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime,.pdf,.docx,.txt,.csv,.json"
            className="hidden"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              setFiles((current) => [...current, ...selected].slice(0, 5));
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-cyan-700"
            aria-label="แนบไฟล์"
          >
            <Paperclip size={20} />
          </button>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={20_000}
            placeholder="สั่งงาน AI เช่น วิเคราะห์แอดนี้ ปรับกลุ่มเป้าหมาย หรือสรุปสิ่งที่ต้องทำวันนี้..."
            className="max-h-36 min-h-11 flex-1 resize-y bg-transparent px-1 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && files.length === 0)}
            className="app-button-primary h-11 w-11 shrink-0 rounded-xl"
            aria-label="ส่งข้อความ"
          >
            {sending ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
        <p className="mt-2 px-2 text-[10px] text-slate-400">
          Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่ · สูงสุด 5 ไฟล์ ไฟล์ละ 12 MB
        </p>
      </form>
    </div>
  );
}
