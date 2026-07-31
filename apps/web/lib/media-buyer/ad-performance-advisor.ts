export const TARGET_ROAS = 5;

export type AdPerformanceInput = {
  spendSatang: number;
  revenueSatang: number;
  messages: number;
  impressions: number;
  clicks: number;
  frequency: number | null;
};

export type AdRecommendation = {
  status: "CONTINUE" | "IMPROVE" | "CONSIDER_STOP" | "COLLECT_DATA";
  label: string;
  reason: string;
  nextAction: string;
  roas: number | null;
  roasGap: number | null;
  ctr: number | null;
  costPerMessageSatang: number | null;
  fatigueRisk: boolean;
};

export function adviseAdPerformance(input: AdPerformanceInput): AdRecommendation {
  const roas = input.spendSatang > 0 && input.revenueSatang > 0
    ? input.revenueSatang / input.spendSatang
    : null;
  const ctr = input.impressions > 0 ? (input.clicks / input.impressions) * 100 : null;
  const costPerMessageSatang = input.messages > 0
    ? Math.round(input.spendSatang / input.messages)
    : null;
  const fatigueRisk = (input.frequency ?? 0) >= 3.5 && (ctr ?? 100) < 1;
  const roasGap = roas === null ? null : Math.max(0, TARGET_ROAS - roas);

  if (input.spendSatang < 10_000 || input.impressions < 1_000) {
    return {
      status: "COLLECT_DATA",
      label: "เก็บข้อมูลต่อ",
      reason: "ยอดใช้จ่ายหรือจำนวนการแสดงผลยังน้อยเกินไป การรีบตัดสินอาจทำให้ปิดแอดที่ยังไม่มีโอกาสเรียนรู้",
      nextAction: "ติดตามต่อโดยยังไม่สรุปว่าเป็นแอดดีหรือแอดเสีย",
      roas,
      roasGap,
      ctr,
      costPerMessageSatang,
      fatigueRisk,
    };
  }

  if (roas !== null && roas >= TARGET_ROAS && !fatigueRisk) {
    return {
      status: "CONTINUE",
      label: "ควรไปต่อ",
      reason: `ROAS ${roas.toFixed(2)} ถึงเป้าหมาย ${TARGET_ROAS.toFixed(0)} เท่า และยังไม่พบสัญญาณความล้าชัดเจน`,
      nextAction: "รักษาแอดเดิมและเตรียมครีเอทีฟสำรองไว้ทดสอบ ไม่ต้องรีบเปลี่ยนตัวที่กำลังทำผลงาน",
      roas,
      roasGap,
      ctr,
      costPerMessageSatang,
      fatigueRisk,
    };
  }

  if (
    input.spendSatang >= 50_000 &&
    (input.messages === 0 || (roas !== null && roas < 1))
  ) {
    return {
      status: "CONSIDER_STOP",
      label: "พิจารณาหยุด",
      reason: input.messages === 0
        ? "มีค่าโฆษณาสะสมพอสมควรแต่ยังไม่มีแชท จึงมีความเสี่ยงใช้เงินต่อโดยไม่ได้ผลลัพธ์"
        : `ROAS ${roas?.toFixed(2)} ต่ำกว่า 1 เท่าและห่างจากเป้าหมาย ${TARGET_ROAS} เท่ามาก`,
      nextAction: "ตรวจ Attribution และยอดขายก่อน หากข้อมูลถูกต้องให้หยุดตัวเดิมและนำครีเอทีฟใหม่ขึ้นทดสอบแทน",
      roas,
      roasGap,
      ctr,
      costPerMessageSatang,
      fatigueRisk,
    };
  }

  const reason = fatigueRisk
    ? `ความถี่ ${(input.frequency ?? 0).toFixed(2)} สูง ขณะที่ CTR ${(ctr ?? 0).toFixed(2)}% ต่ำ มีสัญญาณครีเอทีฟอ่อนล้า`
    : roas === null
      ? "ยังไม่มีข้อมูลยอดขายที่ผูกกับแอด จึงประเมิน ROAS 5 เท่าไม่ได้"
      : `ROAS ${roas.toFixed(2)} ยังต่ำกว่าเป้าหมาย ${TARGET_ROAS} เท่าอยู่ ${roasGap?.toFixed(2)} เท่า`;

  return {
    status: "IMPROVE",
    label: "ควรปรับปรุง",
    reason,
    nextAction: fatigueRisk
      ? "เปลี่ยนภาพหรือวิดีโอและ Hook โดยคงข้อเสนอหลักไว้ แล้วนำตัวใหม่ขึ้นทดสอบเทียบ"
      : "ตรวจข้อเสนอ ข้อความ CTA กลุ่มเป้าหมาย และทดสอบครีเอทีฟใหม่ก่อนเพิ่มงบ",
    roas,
    roasGap,
    ctr,
    costPerMessageSatang,
    fatigueRisk,
  };
}
