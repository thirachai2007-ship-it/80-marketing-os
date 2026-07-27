import { openai } from "@/lib/openai";
import { buildContentPrompt } from "@/lib/marketing/generator";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      product,
      contentType,
      tone,
      keyword,
    } = body;

    const prompt = buildContentPrompt({
      product,
      contentType,
      tone,
      keyword,
    });

    const response = await openai.responses.create({
      model: "gpt-5.5",
      input: prompt,
    });

    return Response.json({
      result: response.output_text,
    });

  } catch (err) {
    console.error(err);

    return Response.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}