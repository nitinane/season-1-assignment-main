/**
 * Agent 2 — Social Poster (Draft Only)
 * 
 * Contract:
 *   - Input: structured Job description / JobRole details
 *   - Output JSON: { "post_copy": string, "image_prompt": string }
 *   - Temperature: 0.7
 *   - Save draft to job_roles row (social_draft column)
 */

import { get_groq_client, SMALL_MODEL } from '../lib/groq';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import { notify_hr } from '../services/notificationService';

export interface SocialDraftOutput {
  post_copy: string;
  image_prompt: string;
}

export interface Agent2Result {
  success: boolean;
  draft?: SocialDraftOutput;
  error?: string;
}

// Shared Groq client and model config

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function validateSocialDraftOutput(parsed: any): asserts parsed is SocialDraftOutput {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Response is not a JSON object');
  }
  if (typeof parsed.post_copy !== 'string' || parsed.post_copy.trim() === '') {
    throw new Error('Validation failed: "post_copy" is missing or empty');
  }
  if (typeof parsed.image_prompt !== 'string' || parsed.image_prompt.trim() === '') {
    throw new Error('Validation failed: "image_prompt" is missing or empty');
  }
}

const SYSTEM_PROMPT = `You are a creative marketing copywriter and recruiter.
Generate a compelling and highly engaging LinkedIn job post copy based on the job description.

Rules:
- Formulate an attractive, professionally styled LinkedIn post copy.
- Use emojis, formatting (like capitalizations, clear line breaks, and bullet points), and relevant hashtags.
- Include a clear call to action directing candidates on how to apply.
- Suggest a creative image prompt or visual description to accompany the post (e.g. an AI image generator prompt like "A sleek, modern illustration of a software developer collaborating at a desk, isometric style, tech vibes").
- Return ONLY JSON. Do not include markdown code fences, conversational preambles, or post-scripts.

The JSON MUST match this exact schema:
{
  "post_copy": "string — complete engaging LinkedIn post copy with spacing, emojis, and hashtags",
  "image_prompt": "string — a detailed image prompt or visual description for AI image generation"
}`;

export async function runSocialPosterAgent(
  title: string,
  experienceLevel: string,
  requiredSkills: string[],
  preferredTools: string[],
  description: string
): Promise<SocialDraftOutput> {
  const userPrompt = `Job Title: ${title}
Experience Level: ${experienceLevel}
Required Skills: ${requiredSkills.join(', ')}
Preferred Tools: ${preferredTools.join(', ')}
Job Description: ${description}`;

  const client = get_groq_client();
  const response = await client.chat.completions.create({
    model: SMALL_MODEL,
    temperature: 0.7,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const cleaned = stripMarkdownFences(raw);
  const parsed = JSON.parse(cleaned);

  validateSocialDraftOutput(parsed);
  return parsed;
}

/**
 * Executes Agent 2 end-to-end:
 *   1. Fetches the job role
 *   2. Generates the social draft via Groq
 *   3. Saves the draft to the job_roles table in the `social_draft` column
 */
export async function generateAndSaveSocialDraft(
  jobId: string
): Promise<Agent2Result> {
  try {
    const hr_user_id = await getCurrentUser();

    // Fetch the job role
    const { data: job, error: jobErr } = await supabase
      .from('job_roles')
      .select('*')
      .eq('id', jobId)
      .eq('hr_user_id', hr_user_id)
      .single();

    if (jobErr || !job) {
      return { success: false, error: `Job role not found: ${jobErr?.message || 'Unknown error'}` };
    }

    // Generate the social post draft
    const draft = await runSocialPosterAgent(
      job.title,
      job.experience_level || '',
      job.required_skills || [],
      job.preferred_tools || [],
      job.description || ''
    );

    // Save to the database
    const { error: updateErr } = await supabase
      .from('job_roles')
      .update({ social_draft: draft })
      .eq('id', jobId)
      .eq('hr_user_id', hr_user_id);

    if (updateErr) {
      return { success: false, error: `Failed to save social draft: ${updateErr.message}` };
    }

    // Trigger Agent 9 notification
    notify_hr(
      hr_user_id,
      'social_draft_created',
      `Social media post draft created for "${job.title}"`
    ).catch(console.error);

    return { success: true, draft };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
