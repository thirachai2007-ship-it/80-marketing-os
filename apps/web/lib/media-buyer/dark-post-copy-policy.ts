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

export function ensureThreeDarkPostCopies(
  inputCopies: DarkPostCopyInput[],
  fallbackText: string,
): DarkPostCopyInput[] {
  const copies = inputCopies.slice(0, 5).map((copy) => ({ ...copy }));
  const baseText =
    copies[0]?.primaryText.trim() ||
    fallbackText.trim() ||
    "รับผลิตงานพิมพ์สั่งทำตามความต้องการของคุณ";

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

  return copies.slice(0, 5);
}
