import fs from "fs";
import path from "path";

export function getProductKnowledge(product: string) {
  const filePath = path.join(
    process.cwd(),
    "knowledge",
    "products",
    `${product}.md`
  );

  return fs.readFileSync(filePath, "utf8");
}

export function buildContentPrompt(product: string) {
  const knowledge = getProductKnowledge(product);

  return `
You are the best Facebook Marketing Expert.

Use ONLY this company knowledge.

${knowledge}

Write a Facebook post that sells this product.

Requirements

- Hook
- Emotional
- CTA
- Suitable for Thailand
`;
}