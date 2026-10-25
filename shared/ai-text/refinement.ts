import { z } from 'zod';

/**
 * How the parsed Markdown is post-processed before it is stored.
 * - `none`: store the engine output as-is.
 * - `local`: normalize whitespace and block spacing with no model.
 * - `agent`: spawn a Paseo agent with the profile prompt (opt-in).
 */
export const aiTextRefinementModeSchema = z.enum(['none', 'local', 'agent']);
export type AiTextRefinementMode = z.infer<typeof aiTextRefinementModeSchema>;

export const aiTextRefinementSettingsSchema = z.object({
  mode: aiTextRefinementModeSchema.default('local'),
  agentId: z.string().default('pi'),
  /** Empty means the agent provider's default model. */
  model: z.string().default(''),
  promptPresetId: z.string().default('faithful'),
  /** Used only by the `custom` preset. */
  prompt: z.string().default(''),
});
export type AiTextRefinementSettings = z.infer<typeof aiTextRefinementSettingsSchema>;

export const DEFAULT_AI_TEXT_REFINEMENT: AiTextRefinementSettings =
  aiTextRefinementSettingsSchema.parse({});

export const aiTextRefinementPromptPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  systemPrompt: z.string(),
  userPromptTemplate: z.string(),
});
export type AiTextRefinementPromptPreset = z.infer<typeof aiTextRefinementPromptPresetSchema>;

const FAITHFUL_SYSTEM_PROMPT = [
  'You are a careful document transcription editor.',
  'You receive Markdown produced by a document parser and return the same document with structure repaired.',
  'Rules:',
  '- Preserve every sentence, number, name, and citation. Never summarize, paraphrase, or invent content.',
  '- Fix heading levels, list markers, paragraph breaks, and escaped characters.',
  '- Keep tables as Markdown tables. Keep formulas as LaTeX. Keep code fences intact.',
  '- Remove repeated page headers, page footers, and page numbers only when they are clearly furniture.',
  '- Do not add commentary, explanations, or a preface. Return only the corrected Markdown.',
].join('\n');

const FAITHFUL_USER_PROMPT = [
  'File: {{fileName}}',
  'Document language: {{language}}',
  '',
  'Repair the structure of this parsed document:',
  '',
  '{{markdown}}',
].join('\n');

const TABLES_SYSTEM_PROMPT = [
  FAITHFUL_SYSTEM_PROMPT,
  '',
  'Table rules:',
  '- Rebuild each table as GitHub-flavored Markdown with one header row and a separator row.',
  '- Preserve cell text exactly, including units and footnotes.',
  '- Never merge columns or drop empty cells to make a table look cleaner.',
].join('\n');

const TABLES_USER_PROMPT = [
  'File: {{fileName}}',
  'Document language: {{language}}',
  '',
  'Repair this document, paying particular attention to tables:',
  '',
  '{{markdown}}',
].join('\n');

export const AI_TEXT_REFINEMENT_PROMPT_PRESETS: readonly AiTextRefinementPromptPreset[] = [
  {
    id: 'faithful',
    label: 'Faithful clean-up',
    description:
      'Repairs structure without changing wording. Safest default for records and reference documents.',
    systemPrompt: FAITHFUL_SYSTEM_PROMPT,
    userPromptTemplate: FAITHFUL_USER_PROMPT,
  },
  {
    id: 'tables',
    label: 'Faithful + table repair',
    description: 'Same as faithful, with explicit rules for rebuilding Markdown tables.',
    systemPrompt: TABLES_SYSTEM_PROMPT,
    userPromptTemplate: TABLES_USER_PROMPT,
  },
  {
    id: 'custom',
    label: 'Custom prompt',
    description:
      'Uses the prompt in this profile. Keep the {{markdown}} token so the document is included.',
    systemPrompt: '',
    userPromptTemplate: '{{markdown}}',
  },
];

export const DEFAULT_AI_TEXT_PROMPT_PRESET_ID = 'faithful';

/** Above this the agent pass is skipped: the prompt would not fit comfortably. */
export const AI_TEXT_REFINEMENT_MAX_INPUT_CHARS = 150_000;
/** A plausible refinement must keep at least this share of the input text. */
export const AI_TEXT_REFINEMENT_MIN_LENGTH_RATIO = 0.3;

export function getRefinementPromptPreset(presetId: string): AiTextRefinementPromptPreset {
  return (
    AI_TEXT_REFINEMENT_PROMPT_PRESETS.find((preset) => preset.id === presetId) ??
    AI_TEXT_REFINEMENT_PROMPT_PRESETS[0]
  );
}

function replaceTokens(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{\{\s*(fileName|language|markdown)\s*\}\}/g,
    (_match, key: string) => values[key] ?? '',
  );
}

export function composeRefinementPrompt(input: {
  presetId: string;
  customPrompt?: string;
  fileName: string;
  language: string;
  markdown: string;
}): { systemPrompt: string; prompt: string } {
  const preset = getRefinementPromptPreset(input.presetId);
  const values = {
    fileName: input.fileName,
    language: input.language.trim() || 'auto',
    markdown: input.markdown,
  };
  if (preset.id === 'custom') {
    const custom = (input.customPrompt ?? '').trim();
    if (!custom) {
      const fallback = AI_TEXT_REFINEMENT_PROMPT_PRESETS[0];
      return {
        systemPrompt: fallback.systemPrompt,
        prompt: replaceTokens(fallback.userPromptTemplate, values),
      };
    }
    return {
      systemPrompt: FAITHFUL_SYSTEM_PROMPT,
      prompt: replaceTokens(custom, values),
    };
  }
  return {
    systemPrompt: preset.systemPrompt,
    prompt: replaceTokens(preset.userPromptTemplate, values),
  };
}

/** Removes a fence that wraps the entire answer, which models often add. */
export function stripOuterMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return match?.[1] !== undefined ? match[1].trim() : trimmed;
}

export interface RefinedMarkdownValidation {
  ok: boolean;
  markdown: string;
  error?: string;
}

/**
 * An agent can return prose, a refusal, or a summary. Store parser output
 * instead of something shorter than a third of the source.
 */
export function validateRefinedMarkdown(
  inputMarkdown: string,
  rawOutput: string,
): RefinedMarkdownValidation {
  const markdown = stripOuterMarkdownFence(rawOutput);
  if (!markdown.trim()) {
    return { ok: false, markdown, error: 'Agent returned an empty document' };
  }
  const inputChars = inputMarkdown.replace(/\s+/g, '').length;
  const outputChars = markdown.replace(/\s+/g, '').length;
  if (inputChars > 0 && outputChars < Math.ceil(inputChars * AI_TEXT_REFINEMENT_MIN_LENGTH_RATIO)) {
    return {
      ok: false,
      markdown,
      error: 'Agent output was much shorter than the parsed document, so it was not used',
    };
  }
  return { ok: true, markdown };
}

/** No model, only structural spacing repairs. */
export function refineMarkdownLocally(rawMarkdown: string): string {
  const lines = rawMarkdown
    .replace(/\r\n/g, '\n')
    // Stripping control characters is the point of this regex.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/g, '')
    .split('\n')
    .map((line) => line.trimEnd());

  const out: string[] = [];
  let inCodeFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previous = out[out.length - 1] ?? '';
    if (line.trim().startsWith('```')) {
      if (!inCodeFence && previous.trim() !== '') out.push('');
      inCodeFence = !inCodeFence;
      out.push(line);
      continue;
    }
    if (inCodeFence) {
      out.push(line);
      continue;
    }
    if (
      (/^#{1,6}\s/.test(line) || /^>\s/.test(line)) &&
      previous.trim() !== '' &&
      !previous.startsWith('#') &&
      !previous.startsWith('>')
    ) {
      out.push('');
    }
    if (line.startsWith('|') && previous.trim() !== '' && !previous.startsWith('|')) {
      out.push('');
    }
    out.push(line);
    const next = lines[index + 1] ?? '';
    if (line.startsWith('|') && next.trim() !== '' && !next.startsWith('|')) {
      out.push('');
    }
  }
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
