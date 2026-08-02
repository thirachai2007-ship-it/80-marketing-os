export const TARGET_ROAS = 5;

export type AdPerformanceInput = {
  spendSatang: number;
  revenueSatang: number;
  purchases: number;
  activeDays: number;
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
  confidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceLabel: string;
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
  const revenueAnomaly = input.revenueSatang > 0 && input.purchases === 0;
  const decisionReady = input.purchases >= 3 && input.activeDays >= 3;
  const confidence = decisionReady && input.impressions >= 3_000
    ? "HIGH"
    : input.purchases >= 2 && input.activeDays >= 2
      ? "MEDIUM"
      : "LOW";
  const confidenceLabel = confidence === "HIGH" ? "หลักฐานสูง" : confidence === "MEDIUM" ? "หลักฐานปานกลาง" : "หลักฐานยังน้อย";

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
      confidence,
      confidenceLabel,
    };
  }

  if (revenueAnomaly || (roas !== null && roas >= TARGET_ROAS && !decisionReady)) {
    return {
      status: "COLLECT_DATA",
      label: "เก็บข้อมูลต่อ",
      reason: revenueAnomaly
        ? `Meta ส่งมูลค่ายอดขาย ${Math.round(input.revenueSatang / 100).toLocaleString("th-TH")} บาท แต่ไม่พบจำนวน Purchase ที่ยืนยัน จึงยังห้ามใช้ ROAS ตัดสิน`
        : `ROAS ${roas?.toFixed(2)} สูง แต่มี Purchase ${input.purchases} ครั้ง และข้อมูล ${input.activeDays} วัน ยังไม่ถึงเกณฑ์ยืนยันอย่างน้อย 3 Purchase และ 3 วัน`,
      nextAction: "ตรวจ Purchase และ Attribution ใน Meta แล้วเก็บข้อมูลต่อ ห้ามเพิ่มงบหรือสรุปว่าเป็นแอดชนะจากยอดขายเพียงครั้งเดียว",
      roas,
      roasGap,
      ctr,
      costPerMessageSatang,
      fatigueRisk,
      confidence,
      confidenceLabel,
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
      confidence,
      confidenceLabel,
    };
  }

  if (
    decisionReady &&
    input.spendSatang >= 50_000 &&
    input.messages === 0
  ) {
    return {
      status: "CONSIDER_STOP",
      label: "พิจารณาหยุด",
      reason: "มีค่าโฆษณาสะสมพอสมควร มีข้อมูลอย่างน้อย 3 วัน และยังไม่มีแชท จึงมีความเสี่ยงใช้เงินต่อโดยไม่ได้ลูกค้าเป้าหมาย",
      nextAction: "ตรวจ Attribution และช่องทางแชทอีกครั้ง หากข้อมูลถูกต้องจึงพิจารณาหยุดตัวเดิมและนำครีเอทีฟใหม่ขึ้นทดสอบแทน",
      roas,
      roasGap,
      ctr,
      costPerMessageSatang,
      fatigueRisk,
      confidence,
      confidenceLabel,
    };
  }

  const reason = fatigueRisk
    ? `ความถี่ ${(input.frequency ?? 0).toFixed(2)} สูง ขณะที่ CTR ${(ctr ?? 0).toFixed(2)}% ต่ำ มีสัญญาณครีเอทีฟอ่อนล้า`
    : roas !== null && roas < 1 && input.messages > 0
      ? `Meta บันทึก ROAS ${roas.toFixed(2)} แต่แอดสร้าง ${input.messages.toLocaleString("th-TH")} แชท จึงยังสรุปไม่ได้ว่าแอดหาลูกค้าไม่ได้ เพราะยอดอาจเป็นมัดจำ ยอดปิดภายหลัง หรือรายได้บันทึกไม่ครบ`
    : roas === null
      ? "ยังไม่มีข้อมูลยอดขายที่ผูกกับแอด จึงประเมิน ROAS 5 เท่าไม่ได้"
      : `ROAS ${roas.toFixed(2)} ยังต่ำกว่าเป้าหมาย ${TARGET_ROAS} เท่าอยู่ ${roasGap?.toFixed(2)} เท่า`;

  return {
    status: "IMPROVE",
    label: "ควรปรับปรุง",
    reason,
    nextAction: fatigueRisk
      ? "เปลี่ยนภาพหรือวิดีโอและ Hook โดยคงข้อเสนอหลักไว้ แล้วนำตัวใหม่ขึ้นทดสอบเทียบ"
      : roas !== null && roas < 1 && input.messages > 0
        ? "ตรวจยอดมัดจำ ยอดปิดการขาย และจำนวนลูกค้าใหม่จากระบบร้านเทียบกับแชทก่อนตัดสินใจ พร้อมปรับครีเอทีฟหรือคุณภาพกลุ่มเป้าหมายหากแชทไม่ปิดการขาย"
      : "ตรวจข้อเสนอ ข้อความ CTA กลุ่มเป้าหมาย และทดสอบครีเอทีฟใหม่ก่อนเพิ่มงบ",
    roas,
    roasGap,
    ctr,
    costPerMessageSatang,
    fatigueRisk,
    confidence,
    confidenceLabel,
  };
}
