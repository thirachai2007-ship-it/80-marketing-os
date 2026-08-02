export type DarkPostCopyInput = {
  angle: string;
  angleName: string;
  primaryText: string;
  headline: string;
  description: string | null;
  callToAction: string;
};

const VARIANTS = [
  {
    angle: "TRUST",
    angleName: "ความน่าเชื่อถือ",
    suffix: "ดูผลงานจริงและคุยรายละเอียดกับทีมงานได้เลย",
    headline: "งานสั่งทำที่คุยรายละเอียดได้",
  },
  {
    angle: "VALUE",
    angleName: "คุณค่าและความคุ้มค่า",
    suffix: "ส่งแบบและจำนวนมาให้เราช่วยแนะนำทางเลือกที่เหมาะกับงานของคุณ",
    headline: "เปลี่ยนไอเดียให้เป็นงานจริง",
  },
  {
    angle: "ACTION",
    angleName: "กระตุ้นให้ทักแชต",
    suffix: "ทักแชตตอนนี้เพื่อสอบถามรายละเอียดและรับคำแนะนำก่อนสั่งผลิต",
    headline: "ส่งแบบมาประเมินงานทางแชต",
  },
  {
    angle: "PROBLEM_SOLUTION",
    angleName: "ปัญหาและทางออก",
    suffix: "บอกโจทย์ งบประมาณ และวันที่ต้องการใช้งาน ทีมงานจะช่วยแนะนำแบบ วัสดุ และวิธีผลิตที่เหมาะสมก่อนตัดสินใจ",
    headline: "มีโจทย์แบบไหน ให้เราช่วยวางงาน",
  },
  {
    angle: "PROOF",
    angleName: "ผลงานจริงและความมั่นใจ",
    suffix: "ดูตัวอย่างงานจริงก่อนสั่งผลิต สอบถามรายละเอียด ราคา และระยะเวลาทางแชตได้โดยไม่มีข้อผูกมัด",
    headline: "ดูผลงานจริงก่อนตัดสินใจสั่งผลิต",
  },
] as const;

const GENERIC_HEADLINES: Set<string> = new Set(VARIANTS.map((variant) => variant.headline));

function inferSubject(text: string): string {
  const normalized = text.toLowerCase();
  if (/สติกเกอร์|ฉลาก|label|sticker/.test(normalized)) return "งานสติกเกอร์";
  if (/ผ้ากันเปื้อน|apron/.test(normalized)) return "ผ้ากันเปื้อน";
  if (/\bdtg\b|ดีทีจี/.test(normalized)) return "เสื้อพิมพ์ DTG";
  if (/cotton|คอตตอน/.test(normalized)) return "เสื้อ Cotton พิมพ์ลาย";
  if (/เสื้อ|พิมพ์ลาย|ไมโคร|กีฬา/.test(normalized)) return "เสื้อพิมพ์ลาย";
  return "งานสั่งผลิต";
}

function extractOffer(text: string): string | null {
  const compact = text.replace(/\s+/g, " ");
  const patterns = [
    /(?:เริ่ม(?:ต้น)?|ราคา(?:เริ่มต้น)?)[^\n.!?]{0,25}?\d[\d,.]*\s*(?:บาท|บ\.|-)/i,
    /(?:ขั้นต่ำ|สั่งขั้นต่ำ)[^\n.!?]{0,20}?\d+\s*(?:ตัว|ชิ้น|แผ่น|ใบ)?/i,
    /(?:ผลิต|จัดส่ง|ส่งงาน)[^\n.!?]{0,20}?\d+\s*วัน/i,
    /(?:ส่งฟรี|ออกแบบฟรี|มีไซซ์)[^\n.!?]{0,28}/i,
  ];
  for (const pattern of patterns) {
    const match = compact.match(pattern)?.[0]?.trim();
    if (match) return match.replace(/[|•]+$/g, "").slice(0, 42);
  }
  return null;
}

function textHash(text: string): number {
  let hash = 0;
  for (const character of text) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}

function buildContextualHeadlines(text: string): string[] {
  const subject = inferSubject(text);
  const offer = extractOffer(text);
  const candidates = [
    `${subject}สั่งทำให้ตรงกับงานของคุณ`,
    `ดูผลงาน${subject}จริงก่อนสั่ง`,
    `ขอราคา${subject}พร้อมคำแนะนำ`,
    `เลือก${subject}ให้เหมาะกับการใช้งาน`,
    `มีแบบแล้ว เริ่มทำ${subject}ได้เลย`,
    `${subject}ที่คุยรายละเอียดได้ทุกจุด`,
    `เปรียบเทียบแบบและวัสดุ${subject}ก่อนผลิต`,
    `ให้ทีมงานช่วยวาง${subject}จากโจทย์ของคุณ`,
  ];
  if (offer) candidates.unshift(`${subject} · ${offer}`);
  const offset = textHash(text) % candidates.length;
  return Array.from({ length: candidates.length }, (_, index) => candidates[(index + offset) % candidates.length]);
}

function extractPostFacts(text: string): string[] {
  const compact = text.replace(/\r/g, "\n");
  const fragments = compact
    .split(/\n+|(?<=[.!?])\s+|[|•]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 6 && part.length <= 110)
    .filter((part) => /ราคา|เริ่ม|ขั้นต่ำ|ผลิต|จัดส่ง|ส่งฟรี|ออกแบบ|ผ้า|วัสดุ|สกรีน|พิมพ์|ไซซ์|สี|รับประกัน|จำนวน|บาท|วัน/i.test(part));
  return Array.from(new Set(fragments.map((fact) => fact.toLowerCase())))
    .map((normalized) => fragments.find((fact) => fact.toLowerCase() === normalized)!)
    .slice(0, 5);
}

function buildContextualPrimaryTexts(text: string): Record<string, string> {
  const source = text.replace(/\s+/g, " ").trim();
  const subject = inferSubject(source);
  const offer = extractOffer(source);
  const facts = extractPostFacts(text);
  const factLines = facts.length > 0
    ? facts.map((fact) => `✓ ${fact}`).join("\n")
    : `✓ ดูรายละเอียด${subject}จากผลงานในโพสต์นี้`;
  const shortFacts = facts.slice(0, 3).map((fact) => `• ${fact}`).join("\n") || `• ส่งแบบและรายละเอียดงานมาให้ทีมงานประเมิน`;

  return {
    TRUST: [
      `ก่อนสั่ง${subject} ตรวจรายละเอียดจากงานจริงให้ครบก่อน`,
      factLines,
      `ดูผลงานในโพสต์นี้ แล้วทักแชตเพื่อยืนยันแบบ วัสดุ ราคา และระยะผลิตกับทีมงานอีกครั้ง`,
    ].join("\n\n"),
    VALUE: [
      offer ? `${offer} — ลองเทียบรายละเอียดให้เหมาะกับงานและงบของคุณ` : `${subject}แต่ละแบบเหมาะกับงบและการใช้งานไม่เหมือนกัน`,
      shortFacts,
      `ส่งแบบ จำนวน และวันที่ต้องใช้มาให้ทีมงานช่วยแนะนำทางเลือกก่อนตัดสินใจ`,
    ].join("\n\n"),
    ACTION: [
      `กำลังหา${subject}สำหรับงานของคุณอยู่หรือเปล่า?`,
      shortFacts,
      `ส่งรูปแบบหรือไอเดียมาในแชต พร้อมจำนวนที่ต้องการ ทีมงานจะช่วยสรุปรายละเอียดที่ต้องเช็กให้`,
    ].join("\n\n"),
    PROBLEM_SOLUTION: [
      `กังวลว่างาน${subject}จะไม่ตรงแบบ งบเกิน หรือเสร็จไม่ทันใช้งาน?`,
      factLines,
      `บอกโจทย์ งบประมาณ จำนวน และวันใช้งานทางแชต เพื่อเช็กทางเลือกที่เหมาะสมก่อนสั่ง`,
    ].join("\n\n"),
    PROOF: [
      `อย่าเพิ่งเลือก${subject}จากราคาอย่างเดียว ลองดูรายละเอียดและผลงานจริงในโพสต์นี้ก่อน`,
      shortFacts,
      `หากต้องการงานใกล้เคียงตัวอย่าง ส่งแบบมาคุยรายละเอียด ราคา และระยะเวลาผลิตได้โดยไม่มีข้อผูกมัด`,
    ].join("\n\n"),
  };
}

export function ensureThreeDarkPostCopies(
  inputCopies: DarkPostCopyInput[],
  fallbackText: string,
): DarkPostCopyInput[] {
  const copies = inputCopies.slice(0, 5).map((copy) => ({ ...copy }));
  const baseText =
    copies[0]?.primaryText.trim() ||
    fallbackText.trim() ||
    "รับผลิตงานพิมพ์สั่งทำตามความต้องการของคุณ";
  const contextualHeadlines = buildContextualHeadlines(`${fallbackText}\n${baseText}`);
  const contextualPrimaryTexts = buildContextualPrimaryTexts(`${fallbackText}\n${baseText}`);

  for (const variant of VARIANTS) {
    if (copies.length >= 5) break;
    if (copies.some((copy) => copy.angle === variant.angle)) continue;
    copies.push({
      angle: variant.angle,
      angleName: variant.angleName,
      primaryText: `${baseText}\n\n${variant.suffix}`,
      headline: variant.headline,
      description: null,
      callToAction: "SEND_MESSAGE",
    });
  }

  const usedHeadlines = new Set<string>();
  let contextualIndex = 0;
  for (const copy of copies) {
    const normalized = copy.headline.normalize("NFKC").trim().toLowerCase();
    const usedGenericFallback = GENERIC_HEADLINES.has(copy.headline.trim());
    if (usedGenericFallback && contextualPrimaryTexts[copy.angle]) {
      copy.primaryText = contextualPrimaryTexts[copy.angle];
    }
    if (!copy.headline.trim() || usedGenericFallback || usedHeadlines.has(normalized)) {
      while (usedHeadlines.has(contextualHeadlines[contextualIndex % contextualHeadlines.length].toLowerCase())) contextualIndex += 1;
      copy.headline = contextualHeadlines[contextualIndex % contextualHeadlines.length];
      contextualIndex += 1;
    }
    usedHeadlines.add(copy.headline.normalize("NFKC").trim().toLowerCase());
  }

  return copies.slice(0, 5);
}
