/**
 * Agent 1 — JD Generator
 *
 * Contract (from PROJECT_SPEC.md §1):
 *   agent_function(input_data) -> { success: true, data: JDOutput }
 *                               | { success: false, error: string, raw_response?: string }
 *
 * Input : raw HR notes (free text) describing a role / business need
 * Output: { title, required_skills[], experience_level, responsibilities[], tools[] }
 * Temp  : 0.3
 */

import { get_groq_client, LARGE_MODEL } from '../lib/groq';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JDOutput {
  title: string;
  required_skills: string[];
  experience_level: string;
  responsibilities: string[];
  tools: string[];
}

export interface AgentSuccess {
  success: true;
  data: JDOutput;
}

export interface AgentFailure {
  success: false;
  error: string;
  raw_response?: string;
}

export type AgentResult = AgentSuccess | AgentFailure;

// Shared Groq client and model config

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strips markdown code fences before JSON.parse().
 * Handles ```json ... ``` and plain ``` ... ``` wrapping.
 */
export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * Validates that the required fields exist and are non-empty.
 * Throws a descriptive error if validation fails.
 */
export function validateJDOutput(parsed: unknown): asserts parsed is JDOutput {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.title || typeof obj.title !== 'string' || obj.title.trim() === '') {
    throw new Error('Validation failed: "title" is missing or empty');
  }

  if (
    !Array.isArray(obj.required_skills) ||
    (obj.required_skills as string[]).filter(Boolean).length === 0
  ) {
    throw new Error('Validation failed: "required_skills" is missing or empty');
  }

  if (
    !Array.isArray(obj.responsibilities) ||
    (obj.responsibilities as string[]).filter(Boolean).length === 0
  ) {
    throw new Error('Validation failed: "responsibilities" is missing or empty');
  }
}

// ─── Prompt Template ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert HR job description writer.

Given raw HR notes describing a role, extract and return a structured JSON job description.

Return ONLY JSON, no markdown fences, no explanations, no extra text.

The JSON MUST match this exact schema:
{
  "title": "string — official job title",
  "required_skills": ["string", "string", ...],
  "experience_level": "string — e.g. '2-4 years (Mid-level)'",
  "responsibilities": ["string", "string", ...],
  "tools": ["string", "string", ...]
}

Rules:
- "title" must be a clean, professional job title (non-empty)
- "required_skills" must list specific, concrete technical and soft skills (non-empty array)
- "experience_level" should be a human-readable range (e.g. "0-2 years (Junior)", "4-7 years (Senior)")
- "responsibilities" must list clear, actionable duties (non-empty array, at least 3 items)
- "tools" should list specific software, frameworks, or platforms (can be empty array if not specified)
- Infer missing details from context where reasonable
- Return ONLY valid JSON`;

// ─── Agent Function ───────────────────────────────────────────────────────────

/**
 * Agent 1: JD Generator
 *
 * @param hrNotes  Raw free-text notes from HR describing the role / business need
 * @returns        AgentResult — either { success: true, data: JDOutput }
 *                              or  { success: false, error, raw_response? }
 */
export async function runJDGeneratorAgent(hrNotes: string): Promise<AgentResult> {
  let raw = '';

  try {
    if (!hrNotes || hrNotes.trim() === '') {
      throw new Error('Input hrNotes cannot be empty');
    }

    const client = get_groq_client();
    const response = await client.chat.completions.create({
      model: LARGE_MODEL,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `HR Notes:\n${hrNotes.trim()}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    raw = response.choices[0]?.message?.content?.trim() ?? '';

    // Strip markdown fences before parsing
    const cleaned = stripMarkdownFences(raw);

    const parsed = JSON.parse(cleaned);

    // Validate required fields — throws if invalid
    validateJDOutput(parsed);

    return { success: true, data: parsed as JDOutput };
  } catch (e) {
    if (e instanceof SyntaxError) {
      return {
        success: false,
        error: `JSON parse error: ${e.message}`,
        raw_response: raw,
      };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      raw_response: raw || undefined,
    };
  }
}
