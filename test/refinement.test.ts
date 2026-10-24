import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_TEXT_REFINEMENT_MAX_INPUT_CHARS,
  composeRefinementPrompt,
  getRefinementPromptPreset,
  refineMarkdownLocally,
  stripOuterMarkdownFence,
  validateRefinedMarkdown,
  type AiTextRefinementSettings,
} from "../shared/ai-text/refinement.ts";
import {
  RefinementAbortError,
  refineAiTextMarkdown,
  type AiTextRefinementInput,
} from "../server/ai-text/refinement.ts";

const AGENT_SETTINGS: AiTextRefinementSettings = {
  mode: "agent",
  agentId: "pi",
  model: "claude-sonnet",
  promptPresetId: "faithful",
  prompt: "",
};

function fakePaseo(handle: Record<string, unknown>) {
  const calls: Array<{ created: any; archived: number }> = [];
  return {
    calls,
    paseo: {
      agents: {
        create: async (input: any) => {
          const record = { created: input, archived: 0 };
          calls.push(record);
          return {
            ...handle,
            archive: async () => {
              record.archived += 1;
            },
          };
        },
      },
    },
  };
}

function refineInput(
  overrides: Partial<AiTextRefinementInput> = {},
): AiTextRefinementInput {
  return {
    paseo: fakePaseo({ waitForFinish: async () => ({ status: "idle" }) }).paseo,
    settings: AGENT_SETTINGS,
    workspaceRootPath: "/workspace",
    fileName: "guide.pdf",
    language: "en",
    markdown: "# Title\n\nA paragraph with enough content to survive validation.\n",
    timeoutMs: 1_000,
    ...overrides,
  };
}

describe("ai-text refinement: prompt composition", () => {
  it("fills the faithful prompt tokens", () => {
    const { systemPrompt, prompt } = composeRefinementPrompt({
      presetId: "faithful",
      fileName: "guide.pdf",
      language: "",
      markdown: "# Hello",
    });
    assert.match(systemPrompt, /careful document transcription editor/);
    assert.match(prompt, /File: guide\.pdf/);
    assert.match(prompt, /Document language: auto/);
    assert.match(prompt, /# Hello/);
  });

  it("uses the tables preset when selected", () => {
    const { systemPrompt } = composeRefinementPrompt({
      presetId: "tables",
      fileName: "guide.pdf",
      language: "en",
      markdown: "text",
    });
    assert.match(systemPrompt, /Table rules:/);
  });

  it("uses a custom prompt and keeps the faithful system prompt", () => {
    const { systemPrompt, prompt } = composeRefinementPrompt({
      presetId: "custom",
      customPrompt: "Rewrite {{fileName}}\n\n{{markdown}}",
      fileName: "guide.pdf",
      language: "en",
      markdown: "# Hello",
    });
    assert.match(systemPrompt, /careful document transcription editor/);
    assert.equal(prompt, "Rewrite guide.pdf\n\n# Hello");
  });

  it("falls back to faithful when a custom prompt is blank", () => {
    const { prompt } = composeRefinementPrompt({
      presetId: "custom",
      customPrompt: "   ",
      fileName: "guide.pdf",
      language: "en",
      markdown: "body",
    });
    assert.match(prompt, /Repair the structure/);
    assert.match(prompt, /body/);
  });

  it("falls back to the first preset for an unknown id", () => {
    assert.equal(getRefinementPromptPreset("missing").id, "faithful");
  });
});

describe("ai-text refinement: output validation", () => {
  it("strips a fence that wraps the whole answer", () => {
    assert.equal(
      stripOuterMarkdownFence("```markdown\n# Title\n\nBody\n```"),
      "# Title\n\nBody",
    );
    assert.equal(stripOuterMarkdownFence("```\nplain\n```"), "plain");
  });

  it("keeps fences that are part of the document", () => {
    const content = "# Title\n\n```ts\nconst x = 1;\n```\n";
    assert.equal(stripOuterMarkdownFence(content), content.trim());
  });

  it("rejects empty output", () => {
    const result = validateRefinedMarkdown("# Title", "   ");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /empty/);
  });

  it("rejects output far shorter than the parsed document", () => {
    const input = "word ".repeat(100);
    const result = validateRefinedMarkdown(input, "Too short.");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /much shorter/);
  });

  it("accepts output that keeps most of the content", () => {
    const input = "word ".repeat(100);
    const output = "word ".repeat(40);
    const result = validateRefinedMarkdown(input, output);
    assert.equal(result.ok, true);
    assert.equal(result.markdown.trim(), output.trim());
  });

  it("ignores whitespace when comparing lengths", () => {
    const input = "abc def ghi jkl";
    const result = validateRefinedMarkdown(input, "abcdefghij kl");
    assert.equal(result.ok, true);
  });
});

describe("ai-text refinement: local cleanup", () => {
  it("normalizes line endings, trailing spaces, and blank lines", () => {
    const input = "# Title   \r\n\r\n\r\n\r\nText here   \r\n## Next\r\n";
    const output = refineMarkdownLocally(input);
    assert.equal(output, "# Title\n\nText here\n\n## Next\n");
  });

  it("keeps code fences verbatim and adds spacing before them", () => {
    const input = "Before\n```ts\nconst x = 1;\n```\nAfter";
    const output = refineMarkdownLocally(input);
    assert.equal(
      output,
      "Before\n\n```ts\nconst x = 1;\n```\nAfter\n",
    );
    assert.ok(output.includes("const x = 1;"));
  });

  it("separates a table from surrounding paragraphs", () => {
    const input = "Intro\n| a | b |\n| --- | --- |\n| 1 | 2 |\nOutro";
    const output = refineMarkdownLocally(input);
    assert.equal(
      output,
      "Intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nOutro\n",
    );
  });

  it("drops control characters", () => {
    const output = refineMarkdownLocally("A\u0000B\u0007C");
    assert.equal(output, "ABC\n");
  });
});

describe("ai-text refinement: agent mode", () => {
  it("returns agent output and records provenance on success", async () => {
    const { paseo, calls } = fakePaseo({
      waitForFinish: async () => ({
        status: "idle",
        lastMessage:
          "```markdown\n# Cleaned\n\nBody text that is long enough.\n```",
      }),
    });
    const outcome = await refineAiTextMarkdown(
      refineInput({ paseo, settings: AGENT_SETTINGS }),
    );
    assert.equal(
      outcome.markdown,
      "# Cleaned\n\nBody text that is long enough.\n",
    );
    assert.equal(outcome.provenance.mode, "agent");
    assert.equal(outcome.provenance.didRun, true);
    assert.equal(outcome.provenance.agentId, "pi");
    assert.equal(outcome.provenance.model, "claude-sonnet");
    assert.deepEqual(outcome.warnings, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.created.config.provider, "pi/claude-sonnet");
    assert.equal(calls[0]!.created.cwd, "/workspace");
    assert.equal(calls[0]!.created.autoArchive, true);
    assert.equal(calls[0]!.archived, 1);
  });

  it("resolves the provider default model when the profile leaves it empty", async () => {
    const fake = fakePaseo({
      waitForFinish: async () => ({
        status: "idle",
        lastMessage: "# Cleaned\n\nBody text with plenty of words.",
      }),
    });
    const paseo = {
      ...fake.paseo,
      providers: {
        waitForReady: async () => ({
          providers: [
            { id: "pi", available: true, defaultModel: "pi-default-model" },
          ],
        }),
      },
    };
    const outcome = await refineAiTextMarkdown(
      refineInput({
        paseo,
        settings: { ...AGENT_SETTINGS, model: "  " },
      }),
    );
    assert.equal(
      fake.calls[0]!.created.config.provider,
      "pi/pi-default-model",
    );
    assert.equal(outcome.provenance.model, "pi-default-model");
    assert.equal(outcome.provenance.didRun, true);
  });

  it("falls back when the selected agent has no default model", async () => {
    let created = 0;
    const paseo = {
      agents: {
        create: async () => {
          created += 1;
          return { waitForFinish: async () => ({ status: "idle" }) };
        },
      },
    };
    const outcome = await refineAiTextMarkdown(
      refineInput({
        paseo,
        settings: { ...AGENT_SETTINGS, model: "" },
      }),
    );
    assert.equal(created, 0);
    assert.match(outcome.provenance.fallbackReason ?? "", /no default model/);
    assert.equal(outcome.provenance.didRun, false);
  });

  it("falls back to the local clean-up on timeout", async () => {
    const { paseo, calls } = fakePaseo({
      waitForFinish: async () => ({ status: "timeout" }),
    });
    const outcome = await refineAiTextMarkdown(refineInput({ paseo }));
    assert.equal(outcome.provenance.didRun, false);
    assert.match(outcome.provenance.fallbackReason ?? "", /time limit/);
    assert.match(outcome.warnings[0] ?? "", /skipped/);
    assert.ok(outcome.markdown.endsWith("\n"));
    assert.equal(calls[0]!.archived, 1);
  });

  it("falls back when the agent reports an error", async () => {
    const { paseo } = fakePaseo({
      waitForFinish: async () => ({
        status: "error",
        error: "provider crashed",
      }),
    });
    const outcome = await refineAiTextMarkdown(refineInput({ paseo }));
    assert.equal(outcome.provenance.fallbackReason, "provider crashed");
    assert.equal(outcome.provenance.didRun, false);
  });

  it("falls back when the agent asks for permission", async () => {
    const { paseo } = fakePaseo({
      waitForFinish: async () => ({ status: "permission" }),
    });
    const outcome = await refineAiTextMarkdown(refineInput({ paseo }));
    assert.match(outcome.provenance.fallbackReason ?? "", /permission/);
  });

  it("falls back when the agent returns no text", async () => {
    const { paseo } = fakePaseo({
      waitForFinish: async () => ({ status: "idle", lastMessage: "" }),
    });
    const outcome = await refineAiTextMarkdown(refineInput({ paseo }));
    assert.match(outcome.provenance.fallbackReason ?? "", /no text/);
  });

  it("falls back when the agent output fails validation", async () => {
    const { paseo } = fakePaseo({
      waitForFinish: async () => ({ status: "idle", lastMessage: "Short." }),
    });
    const outcome = await refineAiTextMarkdown(refineInput({ paseo }));
    assert.match(outcome.provenance.fallbackReason ?? "", /much shorter/);
  });

  it("falls back when creating the agent throws", async () => {
    const paseo = {
      agents: {
        create: async () => {
          throw new Error("no provider");
        },
      },
    };
    const outcome = await refineAiTextMarkdown(
      refineInput({ paseo, settings: AGENT_SETTINGS }),
    );
    assert.equal(outcome.provenance.fallbackReason, "no provider");
  });

  it("skips the agent above the input size cap", async () => {
    let created = 0;
    const paseo = {
      agents: {
        create: async () => {
          created += 1;
          return { waitForFinish: async () => ({ status: "idle" }) };
        },
      },
    };
    const outcome = await refineAiTextMarkdown(
      refineInput({
        paseo,
        markdown: "x".repeat(AI_TEXT_REFINEMENT_MAX_INPUT_CHARS + 1),
      }),
    );
    assert.equal(created, 0);
    assert.match(outcome.provenance.fallbackReason ?? "", /larger than/);
  });

  it("falls back when no agent is selected", async () => {
    let created = 0;
    const paseo = {
      agents: {
        create: async () => {
          created += 1;
          return { waitForFinish: async () => ({ status: "idle" }) };
        },
      },
    };
    const outcome = await refineAiTextMarkdown(
      refineInput({
        paseo,
        settings: { ...AGENT_SETTINGS, agentId: "  " },
      }),
    );
    assert.equal(created, 0);
    assert.match(outcome.provenance.fallbackReason ?? "", /no agent/);
  });

  it("rejects cancellation while the agent runs and still archives it", async () => {
    const controller = new AbortController();
    let archived = 0;
    const paseo = {
      agents: {
        create: async () => ({
          waitForFinish: () => new Promise(() => undefined),
          archive: async () => {
            archived += 1;
          },
        }),
      },
    };
    const pending = refineAiTextMarkdown(
      refineInput({ paseo, signal: controller.signal }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await assert.rejects(pending, RefinementAbortError);
    assert.equal(archived, 1);
  });

  it("archives an agent created after cancellation", async () => {
    const controller = new AbortController();
    let archived = 0;
    let finishCreate: (() => void) | null = null;
    const paseo = {
      agents: {
        create: () =>
          new Promise((resolve) => {
            finishCreate = () => {
              resolve({
                waitForFinish: () => new Promise(() => undefined),
                archive: async () => {
                  archived += 1;
                },
              });
            };
          }),
      },
    };
    const pending = refineAiTextMarkdown(
      refineInput({ paseo: paseo as never, signal: controller.signal }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await assert.rejects(pending, RefinementAbortError);
    assert.equal(archived, 0);
    finishCreate!();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(archived, 1);
  });

  it("does not call an agent for none or local modes", async () => {
    for (const mode of ["none", "local"] as const) {
      let created = 0;
      const paseo = {
        agents: {
          create: async () => {
            created += 1;
            return { waitForFinish: async () => ({ status: "idle" }) };
          },
        },
      };
      const outcome = await refineAiTextMarkdown(
        refineInput({
          paseo,
          settings: { ...AGENT_SETTINGS, mode },
        }),
      );
      assert.equal(created, 0);
      assert.equal(outcome.provenance.mode, mode);
      assert.equal(outcome.provenance.didRun, false);
    }
  });

  it("leaves Markdown untouched in none mode", async () => {
    const input = "  raw\n\n\n";
    const outcome = await refineAiTextMarkdown(
      refineInput({
        settings: { ...AGENT_SETTINGS, mode: "none" },
        markdown: input,
      }),
    );
    assert.equal(outcome.markdown, input);
  });
});
