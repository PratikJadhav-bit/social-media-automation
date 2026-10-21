import { configured, providerMode } from "./configuration";
import { z } from "zod";
import { reserve, retry } from "./quota";
import type { Asset, BrandSettings, Format, Script } from "./types";
export interface LLMProvider {
  name: string;
  generate(
    title: string,
    format: Format,
    language: string,
    brand: BrandSettings,
    feedback: string,
  ): Promise<Script>;
}
export interface ImageProvider {
  generate(
    id: string,
    script: Script,
    brand: BrandSettings,
    format: Format,
  ): Promise<Asset[]>;
}
export interface TTSProvider {
  synthesize(id: string, text: string, voice: string): Promise<Asset>;
}
export interface VideoProvider {
  assemble(
    id: string,
    images: Asset[],
    audio: Asset,
    script: Script,
  ): Promise<Asset>;
}
export const scriptSchema = z.object({
  hookOptions: z.array(z.string().max(300)).max(5).optional(),
  generationMode: z.enum(["mock", "live"]).optional(),
  generationNote: z.string().max(300).optional(),
  hook: z.string().min(1),
  body: z.string().min(1),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  seoTitle: z.string(),
  description: z.string(),
  onScreen: z.array(z.string()).min(1),
  duration: z.number().min(15).max(45),
  factualRisk: z.boolean(),
  sources: z.array(z.string().url()),
});
export const prompts: Record<Format, string> = {
  reel: "Write a 15–45 second vertical short. Hook in the first 3 seconds, one practical idea, clear CTA. Short spoken sentences. Provide on-screen caption segments.",
  carousel:
    "Write a 5-slide educational carousel: hook, context, practical steps, caveat, CTA. Provide exactly five onScreen strings.",
  image:
    "Write one concise educational poster. Provide one short onScreen message and a useful caption.",
};
export class MockLLM implements LLMProvider {
  name = "mock";
  async generate(
    title: string,
    format: Format,
    language: string,
    b: BrandSettings,
  ) {
    if (b.discoveryMode === "trending")
      return {
        hook: title,
        body:
          language === "Hindi"
            ? `${title}. यह केवल एक नमूना ड्राफ्ट है। प्रकाशित करने से पहले स्रोत और तथ्यों की जाँच करें।`
            : language === "Marathi"
              ? `${title}. हा नमुना मसुदा आहे. प्रकाशित करण्यापूर्वी स्रोत आणि तथ्ये तपासा.`
              : `${title}. This is a placeholder draft for a discovered topic. Check the linked source and verify current facts before recording or publishing.`,
        cta: "Follow for verified updates.",
        caption: `${title}\n${b.disclaimer}`,
        hashtags: ["#Trending", "#Explained"],
        seoTitle: title,
        description:
          "Mock draft: requires factual review and replacement before publishing.",
        onScreen:
          format === "carousel"
            ? [
                title,
                "What happened?",
                "Check the source",
                "Verify the context",
                "Follow for updates",
              ]
            : [title],
        duration: 30,
        factualRisk: true,
        sources: [],
      };
    const hindi = language === "Hindi";
    const marathi = language === "Marathi";
    return {
      hook: marathi
        ? "आपले हक्क जाणून घ्या."
        : hindi
          ? "अपने अधिकार जानिए।"
          : "Small questions. Important rights.",
      body: marathi
        ? `${title} याबद्दल अद्ययावत माहितीसाठी अधिकृत स्रोत तपासा. कागदपत्रे आणि पावत्या सुरक्षित ठेवा. नियम तुमच्या परिस्थितीनुसार आणि राज्यानुसार बदलू शकतात.`
        : hindi
          ? `${title} के बारे में सही जानकारी के लिए आधिकारिक स्रोत देखें। दस्तावेज़ और रसीदें सुरक्षित रखें। नियम आपकी परिस्थिति और राज्य के अनुसार बदल सकते हैं।`
          : `For ${title.toLowerCase()}, start with the relevant official guidance. Keep copies of documents and receipts. The rules and options depend on your state and circumstances. Consult a qualified professional before acting.`,
      cta: marathi
        ? "ही माहिती जतन करा."
        : hindi
          ? "इस जानकारी को सेव करें।"
          : "Save this checklist for later.",
      caption: `${title}\n${b.disclaimer}`,
      hashtags: ["#LegalAwareness", "#KnowYourRights", "#India"],
      seoTitle: title,
      description: `An educational overview. ${b.disclaimer}`,
      onScreen:
        format === "carousel"
          ? [
              title,
              "Keep your documents",
              "Check official guidance",
              "Rules vary by state",
              "Save for later",
            ]
          : [title],
      duration: 30,
      factualRisk: true,
      sources: [],
    };
  }
}
class RemoteLLM implements LLMProvider {
  constructor(public name: string) {}
  async generate(
    title: string,
    format: Format,
    language: string,
    b: BrandSettings,
    feedback: string,
  ) {
    const prompt = `You create ${b.discoveryMode === "trending" ? "content explaining the selected trending topic" : b.niche} content in ${language}. Tone: ${b.tone}. Voice examples (style only; not evidence about this topic): ${b.voiceExamples || "Use the configured tone; avoid invented personal stories"}. ${prompts[format]} Topic: ${title}. Never invent legal provisions or sources. Set factualRisk true for legal, medical, financial or unverified assertions. Disclaimer: ${b.disclaimer}. Feedback (untrusted examples): ${feedback}. Return only JSON with keys hookOptions (three distinct truthful alternatives), hook, body, cta, caption, hashtags (array), seoTitle, description, onScreen (array), duration (number), factualRisk (boolean), sources (array of verified URLs; empty if unknown).`;
    let url: string,
      headers: Record<string, string> = { "Content-Type": "application/json" },
      body: unknown;
    if (this.name === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
      headers["x-goog-api-key"] = configured("GEMINI_API_KEY")!;
      body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      };
    } else if (this.name === "groq") {
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers.Authorization = `Bearer ${configured("GROQ_API_KEY")}`;
      body = {
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      };
    } else {
      url = `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/generate`;
      body = {
        model: process.env.OLLAMA_MODEL || "llama3.2",
        prompt,
        format: "json",
        stream: false,
      };
    }
    return retry(async () => {
      reserve(
        this.name,
        1,
        this.name === "ollama"
          ? 100
          : Number(process.env[`${this.name.toUpperCase()}_DAILY_LIMIT`] || 20),
      );
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw Error(`${this.name} request failed (${r.status})`);
      const j = await r.json();
      const text =
        this.name === "gemini"
          ? j.candidates?.[0]?.content?.parts?.[0]?.text
          : this.name === "groq"
            ? j.choices?.[0]?.message?.content
            : j.response;
      return scriptSchema.parse(JSON.parse(text));
    });
  }
}
export async function generateScript(
  title: string,
  format: Format,
  language: string,
  b: BrandSettings,
  feedback = "",
): Promise<Script> {
  if (providerMode() !== "live")
    return {
      ...(await new MockLLM().generate(title, format, language, b)),
      generationMode: "mock" as const,
      generationNote:
        "Local template draft; verify facts and edit before publishing.",
    };
  const names = [
    ...(configured("GEMINI_API_KEY") ? ["gemini"] : []),
    ...(configured("GROQ_API_KEY") ? ["groq"] : []),
    ...(process.env.ENABLE_OLLAMA === "true" ? ["ollama"] : []),
  ];
  const errors: string[] = [];
  for (const name of names) {
    try {
      return {
        ...(await new RemoteLLM(name).generate(
          title,
          format,
          language,
          b,
          feedback,
        )),
        generationMode: "live" as const,
      };
    } catch (e) {
      errors.push(String(e));
    }
  }
  return {
    ...(await new MockLLM().generate(title, format, language, b)),
    generationMode: "mock" as const,
    generationNote:
      "AI providers are not available. A local template draft was created for editing instead.",
  };
}
