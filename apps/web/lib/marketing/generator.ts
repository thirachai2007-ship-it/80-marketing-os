import fs from "fs";
import path from "path";

type PromptInput = {
  product: string;
  contentType: string;
  tone: string;
  keyword: string;
};

export function buildContentPrompt({
  product,
  contentType,
  tone,
  keyword,
}: PromptInput) {
  const knowledgePath = path.join(
    process.cwd(),
    "..",
    "..",
    "knowledge",
    "products",
    `${product}.md`
  );

  const knowledge = fs.readFileSync(knowledgePath, "utf8");

  return `
คุณคือ Marketing AI ของบริษัท 80T-Shirt

=========================
ข้อมูลสินค้า
=========================

${knowledge}

=========================
รายละเอียดงาน
=========================

สินค้า:
${product}

ประเภทคอนเทนต์:
${contentType}

โทน:
${tone}

Keyword:
${keyword}

=========================
สิ่งที่ต้องสร้าง
=========================

1. Headline
2. Facebook Caption
3. Call To Action
4. Hashtag 10 รายการ

เขียนให้น่าเชื่อถือ อ่านง่าย และกระตุ้นให้ลูกค้าทักแชท
`;
}