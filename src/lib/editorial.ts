import { spawn } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Script } from "./types";

export type EditorialPlatform = "instagram" | "youtube" | "linkedin";
export const editorialTools = [
  "hook",
  "beats",
  "humanize",
  "style",
  "caption",
  "title",
  "instagram-outliers",
  "youtube-outliers",
  "retention",
  "chapters",
  "edit",
] as const;
export type EditorialTool = (typeof editorialTools)[number];
const root = () => path.resolve(/*turbopackIgnore: true*/ "vendor");
const files: Record<EditorialTool, string> = {
  hook: "instagram-agent-skill/skills/ig-reel/hookscore.py",
  beats: "instagram-agent-skill/skills/ig-reel/beats.py",
  humanize: "linkedin-agent-skill/skills/li-human/humanize.py",
  style: "linkedin-agent-skill/skills/li-human/detect.py",
  caption: "instagram-agent-skill/skills/ig-caption/caption.py",
  title: "youtube-agent-skill/skills/yt-package/title.py",
  "instagram-outliers": "instagram-agent-skill/skills/ig-viral/swipe.py",
  "youtube-outliers": "youtube-agent-skill/skills/yt-viral/swipe.py",
  retention: "youtube-agent-skill/skills/yt-retention/retention.py",
  chapters: "youtube-agent-skill/skills/yt-chapters/chapters.py",
  edit: "youtube-agent-skill/skills/yt-edit/deadair.py",
};

function python(file: string, args: string[], input: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      /*turbopackIgnore: true*/
      process.env.PYTHON_BIN ||
        (process.platform === "win32" ? "python" : "python3"),
      [file, ...args],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      },
    );
    let out = "";
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
      if (out.length > 2_000_000) child.kill();
    });
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        Error(
          "Local editorial tools need Python 3. Install Python or configure PYTHON_BIN.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(
          Error(
            code === null
              ? "Editorial analysis timed out; use a smaller input."
              : "The tool could not read this input. Check the format instructions and retry.",
          ),
        );
      }
    });
    child.stdin.end(input);
  });
}

export async function runEditorial(
  tool: EditorialTool,
  input: string,
  options: {
    platform?: EditorialPlatform;
    title?: string;
    thumbnail?: string;
    duration?: number;
  } = {},
) {
  // Executables are fixed here; callers cannot select commands, paths or output destinations.
  if (
    ["hook", "humanize", "style", "beats"].includes(tool) &&
    /[\p{Script=Devanagari}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Arabic}\p{Script=Han}]/u.test(
      input,
    )
  )
    return tool === "humanize"
      ? {
          text: input,
          report: {
            note: "The original script is preserved. English-specific cleanup is skipped for this language.",
          },
        }
      : {
          supported: false,
          note: "These heuristics are designed for English. Review this language manually; no misleading score has been assigned.",
        };
  let file = files[tool];
  if (!file) throw Error("Choose a supported editorial tool.");
  if (tool === "hook" && options.platform === "youtube")
    file = "youtube-agent-skill/skills/yt-script/hookscore.py";
  const args = ["--json"];
  let temporary: string | undefined;
  try {
    if (tool === "title")
      args.push(
        "--title",
        options.title || input,
        "--thumb",
        options.thumbnail || "",
      );
    else if (
      ["youtube-outliers", "retention", "chapters", "edit"].includes(tool)
    ) {
      temporary = await mkdtemp(path.join(tmpdir(), "autopilot-editorial-"));
      const extension =
        tool === "youtube-outliers"
          ? ".json"
          : tool === "retention"
            ? ".csv"
            : ".srt";
      const source = path.join(temporary, `input${extension}`);
      await writeFile(source, input, "utf8");
      args.push(source);
      if (tool === "retention")
        args.push("--duration", String(options.duration || 30));
    } else {
      args.push("-");
      if (tool === "beats")
        args.push("--target", String(options.duration || 30));
    }
    const result = await python(
      path.join(/*turbopackIgnore: true*/ root(), file),
      args,
      input,
    );
    // A scratch path is never useful to a browser or exported report.
    if (result && typeof result === "object" && "source" in result)
      (result as { source: string }).source = "Provided draft";
    return result;
  } finally {
    if (
      temporary &&
      path.dirname(path.resolve(temporary)) === path.resolve(tmpdir()) &&
      path.basename(temporary).startsWith("autopilot-editorial-")
    )
      await rm(temporary, { recursive: true, force: true });
  }
}

export async function hookLibrary(platform: EditorialPlatform) {
  const file =
    platform === "instagram"
      ? "instagram-agent-skill/skills/ig-reel/hooks.json"
      : platform === "youtube"
        ? "youtube-agent-skill/skills/yt-script/hooks.json"
        : "linkedin-agent-skill/skills/li-post/hooks.json";
  return JSON.parse(
    await readFile(path.join(/*turbopackIgnore: true*/ root(), file), "utf8"),
  );
}

export async function editorialBrief(
  format: string,
  platform?: EditorialPlatform,
) {
  const library = await hookLibrary(
    platform || (format === "reel" ? "instagram" : "linkedin"),
  );
  return JSON.stringify({
    rules: library.rules,
    formulas: library.hooks.map(
      (hook: {
        name: string;
        template?: string;
        shape?: string;
        trap?: string;
      }) => ({
        name: hook.name,
        shape: hook.template || hook.shape,
        avoid: hook.trap,
      }),
    ),
    instructions:
      "Use a fitting formula with verified facts only; examples are illustrations, never facts about this topic. Three alternative hooks. One promise and one CTA. Short, varied sentences. Reels need a hook, stake, body, payoff and loop. Carousels need one idea per slide. Titles and thumbnail words complement each other. Use the configured tone and voice examples; do not invent personal stories, results, prices or statistics.",
  });
}

export type EditorialReport = {
  status: "ready" | "limited";
  notes: string[];
  tools: Record<string, unknown>;
};
export async function reviewScript(
  s: Script,
  language: string,
): Promise<EditorialReport> {
  if (language !== "English")
    return {
      status: "limited",
      notes: [
        "English hook and style heuristics are skipped for this language; its script is preserved for human review.",
      ],
      tools: {},
    };
  const inputs: [
    EditorialTool,
    string,
    {
      title?: string;
      thumbnail?: string;
      duration?: number;
      platform?: EditorialPlatform;
    }?,
  ][] = [
    ["hook", (s.hookOptions?.length ? s.hookOptions : [s.hook]).join("\n")],
    ["beats", `${s.hook}\n${s.body}\n${s.cta}`, { duration: s.duration }],
    ["caption", `${s.caption}\n${s.hashtags.join(" ")}`],
    [
      "title",
      s.seoTitle,
      { title: s.seoTitle, thumbnail: s.onScreen[0] || "" },
    ],
    ["style", `${s.hook}\n${s.body}\n${s.cta}`],
  ];
  const results = await Promise.allSettled(
    inputs.map(([tool, text, options]) => runEditorial(tool, text, options)),
  );
  const tools: Record<string, unknown> = {},
    notes: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") tools[inputs[index][0]] = result.value;
    else notes.push(String(result.reason).replace(/^Error: /, ""));
  });
  return {
    status: notes.length ? "limited" : "ready",
    notes: [...new Set(notes)],
    tools,
  };
}
