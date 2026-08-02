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

function getSalesContext(subject: string): { audience: string; benefit: string; concern: string } {
  if (subject === "งานสติกเกอร์") return {
    audience: "เจ้าของร้าน แบรนด์สินค้า ร้านอาหาร และธุรกิจที่ต้องการให้งานแพ็กเกจดูน่าเชื่อถือขึ้น",
    benefit: "ช่วยให้ลูกค้าจำแบรนด์ง่ายขึ้น สื่อสารข้อมูลบนสินค้าได้ชัด และทำให้งานดูเป็นมืออาชีพตั้งแต่แรกเห็น",
    concern: "สีไม่ตรง ขนาดไม่พอดี วัสดุไม่เหมาะกับพื้นผิว หรือสั่งมาแล้วใช้งานจริงไม่ได้",
  };
  if (subject === "ผ้ากันเปื้อน") return {
    audience: "ร้านอาหาร คาเฟ่ ทีมงานหน้าร้าน และธุรกิจที่อยากให้ภาพลักษณ์ของทีมดูเป็นชุดเดียวกัน",
    benefit: "ช่วยให้ทีมดูเรียบร้อย จดจำแบรนด์ได้ง่าย และเปลี่ยนเครื่องแต่งกายที่ใช้งานทุกวันให้เป็นพื้นที่สื่อสารแบรนด์",
    concern: "แบบไม่ตรงกับงานจริง ใส่แล้วเคลื่อนไหวไม่สะดวก หรืองานพิมพ์ไม่เด่นอย่างที่ต้องการ",
  };
  if (subject.includes("เสื้อ")) return {
    audience: "ทีมงาน ร้านค้า กลุ่มกิจกรรม เสื้อรุ่น และคนที่ต้องการทำเสื้อในแบบของตัวเอง",
    benefit: "ช่วยสร้างภาพจำให้ทีม ดูเป็นกลุ่มเดียวกัน และเปลี่ยนไอเดียหรือตัวตนของคุณให้กลายเป็นเสื้อที่หยิบมาใส่ได้จริง",
    concern: "เนื้อผ้าไม่เหมาะ ลายพิมพ์ไม่ตรงแบบ สีไม่เป็นอย่างที่คิด หรือเลือกวิธีผลิตไม่เหมาะกับจำนวนที่สั่ง",
  };
  return {
    audience: "ร้านค้า ทีมงาน และเจ้าของธุรกิจที่ต้องการงานสั่งผลิตให้ตรงกับการใช้งานจริง",
    benefit: "ช่วยเปลี่ยนไอเดียให้เป็นชิ้นงานที่สื่อสารแบรนด์และตอบโจทย์การใช้งานได้ชัดเจนขึ้น",
    concern: "รายละเอียดไม่ตรงแบบ งบประมาณบานปลาย หรือเลือกวัสดุและวิธีผลิตไม่เหมาะกับงาน",
  };
}

function buildContextualPrimaryTexts(text: string): Record<string, string> {
  const source = text.replace(/\s+/g, " ").trim();
  const subject = inferSubject(source);
  const offer = extractOffer(source);
  const facts = extractPostFacts(text);
  const sales = getSalesContext(subject);
  const factLines = facts.length > 0
    ? facts.map((fact) => `✓ ${fact}`).join("\n")
    : `✓ ดูรายละเอียด${subject}จากผลงานในโพสต์นี้`;
  const shortFacts = facts.slice(0, 3).map((fact) => `• ${fact}`).join("\n") || `• ส่งแบบและรายละเอียดงานมาให้ทีมงานประเมิน`;
  const offerLine = offer ? `ข้อมูลจากโพสต์นี้: ${offer}` : `ราคาและระยะผลิตขึ้นอยู่กับแบบ วัสดุ และจำนวนที่ต้องการ`;

  return {
    TRUST: [
      `✨ ${subject}ที่ดี ไม่ควรดูดีแค่ในรูป แต่ต้องตอบโจทย์ตอนนำไปใช้งานจริงด้วย`,
      `หากคุณกำลังมองหา${subject}สำหรับ${sales.audience} สิ่งสำคัญคือการคุยรายละเอียดให้เข้าใจตรงกันตั้งแต่ก่อนเริ่มผลิต ทั้งแบบ วัสดุ สี จำนวน และวันที่ต้องการใช้งาน เพราะรายละเอียดเล็ก ๆ เหล่านี้ส่งผลกับภาพรวมของงานโดยตรง`,
      `เหตุผลที่หลายคนเลือกดูผลงานจริงก่อนตัดสินใจ คือช่วยให้เห็นแนวทางของงานและตั้งคำถามกับทีมผลิตได้ตรงจุดมากขึ้น` ,
      factLines,
      `📩 ดูตัวอย่างในโพสต์นี้แล้วส่งแบบหรือไอเดียมาให้ทีมงานช่วยตรวจรายละเอียด พร้อมสอบถามราคาและระยะผลิตก่อนตัดสินใจได้เลย`,
    ].join("\n\n"),
    VALUE: [
      `💡 อย่าเลือก${subject}จากราคาเพียงอย่างเดียว เลือกจากความเหมาะสมกับงานแล้วงบของคุณจะคุ้มค่ากว่า`,
      `${sales.benefit} แต่แบบ วัสดุ และวิธีผลิตที่เหมาะกับแต่ละงานอาจไม่เหมือนกัน การแจ้งจำนวนและวัตถุประสงค์ให้ชัดจึงช่วยลดการเลือกผิดและทำให้ประเมินทางเลือกได้ตรงกว่า`,
      offerLine,
      shortFacts,
      `📩 ส่งแบบ จำนวน งบประมาณ และวันที่ต้องใช้มาในแชต ทีมงานจะช่วยแนะนำแนวทางที่เหมาะกับโจทย์ เพื่อให้คุณเปรียบเทียบก่อนสั่งจริง`,
    ].join("\n\n"),
    ACTION: [
      `🔥 มีไอเดียอยู่แล้ว แต่อยากรู้ว่าจะทำเป็น${subject}ได้แบบไหนและต้องเตรียมอะไรบ้าง?`,
      `ไม่จำเป็นต้องรู้เรื่องการผลิตทั้งหมดก่อนทักมา เพียงบอกว่าอยากนำงานไปใช้กับอะไร ต้องการประมาณกี่ชิ้น มีแบบแล้วหรือยัง และต้องใช้เมื่อไร ทีมงานก็สามารถเริ่มช่วยไล่รายละเอียดที่จำเป็นให้ได้`,
      `เหมาะสำหรับ${sales.audience} เพราะ${sales.benefit}` ,
      shortFacts,
      `📩 กดส่งข้อความแล้วแนบรูป ตัวอย่าง หรือไอเดียที่ชอบมาได้เลย พร้อมจำนวนที่ต้องการ เพื่อสอบถามราคาและขั้นตอนต่อไป`,
    ].join("\n\n"),
    PROBLEM_SOLUTION: [
      `⚠️ กลัวสั่ง${subject}แล้ว${sales.concern}? ปัญหาเหล่านี้ลดได้ด้วยการเช็กรายละเอียดก่อนเริ่มงาน`,
      `แทนที่จะรีบเลือกจากภาพหรือราคาที่เห็น ลองเริ่มจากวัตถุประสงค์ จำนวน งบประมาณ และวันใช้งานก่อน แล้วจึงเลือกแบบ วัสดุ และวิธีผลิตให้สัมพันธ์กัน วิธีนี้ช่วยให้คุยงานง่ายขึ้นและลดจุดที่อาจเข้าใจไม่ตรงกัน`,
      offerLine,
      factLines,
      `📩 ส่งโจทย์ของคุณมาทางแชต ทีมงานจะช่วยไล่สิ่งที่ต้องยืนยันและแนะนำทางเลือกให้พิจารณาก่อนสั่งผลิตจริง`,
    ].join("\n\n"),
    PROOF: [
      `👀 ก่อนตัดสินใจสั่ง${subject} ลองดูผลงานจริงและรายละเอียดในโพสต์นี้ให้ครบ`,
      `ภาพตัวอย่างช่วยให้เห็นแนวทางของงานได้ชัดกว่าคำโฆษณาเพียงอย่างเดียว คุณสามารถใช้ตัวอย่างนี้เป็นจุดเริ่มต้น แล้วบอกส่วนที่อยากเก็บ ส่วนที่อยากเปลี่ยน และลักษณะการใช้งานของคุณ เพื่อให้ทีมงานเข้าใจภาพเดียวกัน`,
      `${sales.benefit} จึงควรเลือกงานที่เข้ากับตัวตนและวัตถุประสงค์ของคุณจริง ๆ`,
      shortFacts,
      `📩 หากชอบแนวทางนี้ ส่งภาพตัวอย่าง แบบ หรือรายละเอียดที่ต้องการมาคุยราคา จำนวน และระยะผลิตกับทีมงานก่อนได้`,
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
    const needsSalesRewrite = usedGenericFallback || copy.primaryText.trim().length < 400;
    if (needsSalesRewrite && contextualPrimaryTexts[copy.angle]) {
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
