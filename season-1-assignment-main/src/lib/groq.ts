import Groq from 'groq-sdk';
import type { AIScoreResult, FraudResult, InterviewQuestion, Candidate, JobRole } from '../types';

const normalizeList = (value: string[] | string | null | undefined): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

const groqClient = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '',
  dangerouslyAllowBrowser: true,
});

import { getBenchmarksForRole } from '../services/aiRankingService';

const MODEL = 'llama-3.3-70b-versatile';

let isGroqRunning = false;
const scoreCache = new Map<string, AIScoreResult>();

const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Local heuristic pre-scoring based on text matching.
 */
export function calculateLocalScore(resumeText: string): number {
  const text = resumeText.toLowerCase();
  let score = 0;

  if (text.includes("react")) score += 30;
  if (text.includes("javascript")) score += 20;
  if (text.includes("typescript")) score += 15;
  if (text.includes("tailwind")) score += 10;
  if (text.includes("github")) score += 10;
  if (text.includes("portfolio")) score += 10;
  if (text.includes("internship")) score += 20;
  if (text.includes("project")) score += 15;

  return score;
}

/**
 * High-Quality Bulk Comparative Ranking Engine
 * Compares ALL candidates together to find the Top 10 best fits.
 */
export async function bulkScoreCandidates(
  candidates: any[],
  job: any
): Promise<AIScoreResult[]> {
  if (candidates.length === 0) return [];

  return safeGroqRequest(async () => {
    // Construct High-Detail Dossier
    const dossier = candidates.map((c, index) => `
CANDIDATE ${index + 1}
Name: ${c.name}
Email: ${c.email}
Phone: ${c.phone || "Not provided"}
Summary: ${c.summary || "No summary provided"}
Resume Snapshot:
${c.rawText.slice(0, 3500)}
-----------------------------------
`).join("\n");

    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a senior technical recruiter and ATS architect.

Compare ALL provided resumes against each other for the ${job.title} role.

STRICT RULE:
- Return ONLY valid JSON.
- Do NOT include explanations, markdown code blocks, or conversational text.
- Rank ALL candidates from best to worst.
- Return ONLY the TOP 10 candidates.
- Use a realistic, comparative ATS score distribution (e.g., 96, 92, 89, 85, 81...).
- Generate a UNIQUE, detailed "unique_reason" (min 2 sentences).
- Generate UNIQUE "strengths" and "weaknesses" list (min 3 items each).
- Never use placeholder labels like "Candidate 1". Use the "exact_name" and "exact_email" from the provided dossier.

JSON Schema (Array of Objects):
[
  {
    "rank": number,
    "exact_name": "string",
    "exact_email": "string",
    "score": number,
    "unique_reason": "string",
    "strengths": ["string"],
    "weaknesses": ["string"]
  }
]`,
        },
        {
          role: 'user',
          content: `JOB ROLE: ${job.title || "Unknown Role"}\nJD Summary: ${job.description || "No description provided"}\nRequired Skills: ${
            (Array.isArray(job.required_skills) ? job.required_skills : (typeof job.required_skills === 'string' ? job.required_skills.split(',') : [])).join(", ")
          }\n\nCandidates dossier:\n${dossier}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0].message.content || '';
    console.log("AI RAW RESPONSE:", rawContent);

    try {
      const parsed = JSON.parse(rawContent);
      const results = Array.isArray(parsed) ? parsed : (parsed.candidates || parsed.results || []);
      
      if (!Array.isArray(results) || results.length === 0) {
        console.error("AI returned empty results array:", parsed);
        return [];
      }

      return results.slice(0, 10).map((r: any) => ({
        rank: r.rank,
        name: r.exact_name,
        email: r.exact_email,
        score: r.score,
        summary: r.summary || "",
        reason: r.unique_reason,
        strengths: r.strengths,
        weaknesses: r.weaknesses,
        match_percentage: r.score 
      }));
    } catch (e) {
      console.error("Bulk scoring parse error. Raw Output:", rawContent);
      return [];
    }
  });
}

export const safeGroqRequest = async (
  requestFn: () => Promise<any>,
  retries = 5
) => {
  while (isGroqRunning) {
    await delay(2000);
  }

  isGroqRunning = true;

  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await delay(2000); // base safety delay
        return await requestFn();
      } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.message?.includes("rate_limit_exceeded");
        const isQuotaExceeded = error?.message?.includes("quota") || error?.message?.includes("limit");

        if (isRateLimit && !isQuotaExceeded && attempt < retries) {
          const backoff = Math.pow(2, attempt) * 2000;
          console.warn(`Groq Rate limit hit. Retrying in ${backoff}ms (Attempt ${attempt}/${retries})`);
          await delay(backoff);
          continue;
        }

        // Fail fast on quota/hard limits
        if (isQuotaExceeded) {
          console.error("Groq Quota or Token Limit Exceeded. Falling back to local scoring immediately.");
        }
        throw error;
      }
    }
  } finally {
    isGroqRunning = false;
  }
};

// ─── Anonymize resume before AI scoring (Bias-Free Screening) ───────────────
export async function anonymizeResume(rawText: string): Promise<string> {
  return safeGroqRequest(async () => {
    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a bias-free resume anonymizer. Remove ALL personally identifiable information that could introduce bias:
- Candidate's full name (replace with [CANDIDATE])
- Gender pronouns
- Profile photos references
- College/university names (replace with [UNIVERSITY])
- Location/city/country
- Age or date of birth
Keep all technical skills, experience years, project descriptions, certifications, companies worked at, and achievements.
Return only the anonymized text.`,
        },
        { role: 'user', content: rawText },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    });
    return completion.choices[0].message.content || rawText;
  });
}

// ─── Extract structured data from resume text ────────────────────────────────
export async function extractResumeData(rawText: string): Promise<Partial<Candidate>> {
  return safeGroqRequest(async () => {
    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `Extract structured data from this resume. Return a valid JSON object with these exact fields:
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "summary": "2-3 sentence professional summary",
  "score": 0,
  "skills": ["array of skill strings"],
  "projects": ["array of project description strings"],
  "years_experience": "string (e.g. '5+ years')",
  "raw_text": "the full original resume text",
  "education": "highest education string",
  "certifications": ["array of certification strings"],
  "companies": ["array of previous company name strings"],
  "tech_stack": ["array of specific technology strings"],
  "keywords": ["array of important keywords"]
}
Be thorough. Extract as much data as possible. Fill raw_text with the input text provided. Return ONLY valid JSON.`,
        },
        { role: 'user', content: rawText },
      ],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    try {
      const content = completion.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);
      return {
        name: parsed.name || "Unknown Candidate",
        email: parsed.email || "",
        phone: parsed.phone || "",
        summary: parsed.summary || "",
        skills: parsed.skills || [],
        projects: parsed.projects || [],
        years_experience: String(parsed.years_experience || ""),
        education: parsed.education || "",
        certifications: parsed.certifications || [],
        companies: parsed.companies || [],
        tech_stack: parsed.tech_stack || [],
        keywords: parsed.keywords || [],
        raw_text: rawText 
      };
    } catch (err) {
      console.error("AI Data Extraction failed, using safe defaults:", err);
      return { 
        name: "Unknown Candidate",
        raw_text: rawText,
        email: "",
        phone: "",
        summary: "",
        skills: [],
        tech_stack: [],
        projects: [],
        years_experience: ""
      };
    }
  });
}

// ─── Score candidate against job description ──────────────────────────────────
export async function scoreCandidate(
  anonymizedText: string,
  jobRole: Partial<JobRole>,
  candidateEmail?: string // Added for caching
): Promise<AIScoreResult> {
  // 1. Check Cache
  const cacheKey = `${candidateEmail || anonymizedText.slice(0, 100)}:${jobRole.id}`;
  if (scoreCache.has(cacheKey)) {
    console.log("Returning cached score for:", candidateEmail);
    return scoreCache.get(cacheKey)!;
  }

  return safeGroqRequest(async () => {
    const benchmarks = getBenchmarksForRole(jobRole.title || '');
    const jobDesc = `
Role: ${jobRole.title}
Required Skills: ${normalizeList(jobRole.required_skills).join(', ')}
Preferred Tools: ${normalizeList(jobRole.preferred_tools).join(', ')}
Experience Level: ${jobRole.experience_level}
Benchmarks: ${benchmarks.join(', ')}
${jobRole.description ? `Description: ${jobRole.description}` : ''}
`.trim();

    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an expert HR AI that scores resumes objectively. 
Evaluate this resume against both the provided job description and the standard industry expectations for the specified role.
Identify missing critical skills even if not explicitly mentioned in the JD.

Return a JSON object with EXACTLY these fields:
{
  "jdMatchScore": number (0-100),
  "industryFitScore": number (0-100),
  "projectRelevanceScore": number (0-100),
  "experienceDepthScore": number (0-100),
  "communicationScore": number (0-100),
  "summary": "2 sentence summary",
  "reason": "AI verdict and fit reason",
  "strengths": ["list of strengths"],
  "missing_skills": ["list of missing skills"],
  "industryFit": "summary of industry alignment",
  "recommendation": "final AI verdict"
}
Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `JOB DESCRIPTION:\n${jobDesc}\n\nCANDIDATE RESUME:\n${anonymizedText.slice(0, 5000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    try {
      const content = completion.choices[0].message.content || '{}';
      const r = JSON.parse(content);
      
      // Multi-dimensional Weighted Score calculation
      const score = Math.round(
        (r.jdMatchScore || 0) * 0.4 +
        (r.industryFitScore || 0) * 0.3 +
        (r.projectRelevanceScore || 0) * 0.2 +
        (r.communicationScore || 0) * 0.1
      );

      const result: AIScoreResult = {
        rank: 0,
        name: r.name || 'Unknown',
        score: score,
        weaknesses: r.weaknesses || [],
        match_percentage: r.jdMatchScore || r.match_percentage || 0,
        summary: r.summary || 'No summary available.',
        reason: r.reason || 'Score calculated based on skill match.',
        strengths: r.strengths || [],
        missing_skills: r.missing_skills || [],
        jdMatchScore: r.jdMatchScore || 0,
        industryFitScore: r.industryFitScore || 0,
        projectRelevanceScore: r.projectRelevanceScore || 0,
        experienceDepthScore: r.experienceDepthScore || 0,
        communicationScore: r.communicationScore || 0,
        industryFit: r.industryFit || 'No industry fit summary.',
        recommendation: r.recommendation || 'No recommendation provided.'
      };

      // 2. Save to Cache
      scoreCache.set(cacheKey, result);
      return result;
    } catch (e) {
      console.error("Scoring parse error:", e);
      return { 
        score: 0, match_percentage: 0, summary: '', reason: 'Failed to score', 
        strengths: [], missing_skills: [], jdMatchScore: 0, industryFitScore: 0,
        projectRelevanceScore: 0, experienceDepthScore: 0, communicationScore: 0,
        industryFit: '', recommendation: ''
      };
    }
  });
}

// ─── Detect fraud / fake resume ───────────────────────────────────────────────
export async function detectFraud(rawText: string): Promise<FraudResult> {
  return safeGroqRequest(async () => {
    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a fraud detection system for resumes. Analyze the resume for suspicious patterns.
Check for:
1. Excessive keyword stuffing beyond natural usage
2. Unrealistic experience claims (e.g., 10 years experience but graduated 3 years ago)
3. Obviously copied or template resume content
4. Inconsistent dates or timeline gaps
5. Implausible number of certifications or skills for claimed experience level

Return JSON with:
{
  "risk_level": "low" | "medium" | "high",
  "reasons": ["list of specific suspicious patterns found, or empty array if clean"]
}

Be conservative - only flag actual red flags, not minor issues. Return ONLY valid JSON.`,
        },
        { role: 'user', content: rawText.slice(0, 4000) },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    try {
      const content = completion.choices[0].message.content || '{}';
      const result = JSON.parse(content);
      return {
        risk_level: result.risk_level || 'low',
        reasons: result.reasons || [],
      };
    } catch {
      return { risk_level: 'low', reasons: [] };
    }
  });
}

// ─── Generate interview questions ─────────────────────────────────────────────
export async function generateInterviewQuestions(
  candidate: Partial<Candidate>,
  jobRole: Partial<JobRole>
): Promise<InterviewQuestion[]> {
  return safeGroqRequest(async () => {
    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a senior technical interviewer. Generate targeted interview questions based on the candidate's actual skills and the job requirements.
Return a JSON array of question objects:
[
  {
    "skill": "skill or topic name",
    "question": "the interview question",
    "difficulty": "easy" | "medium" | "hard"
  }
]
Generate 6-10 questions. Mix technical depth, practical application, and behavioral questions. Return ONLY valid JSON array.`,
        },
        {
          role: 'user',
          content: `Job Role: ${jobRole.title}\nRequired Skills: ${normalizeList(jobRole.required_skills).join(', ')}\nCandidate Skills: ${normalizeList(candidate.skills).join(', ')}\nCandidate Projects: ${normalizeList(candidate.projects).slice(0, 3).join('; ')}\nExperience: ${candidate.years_experience} years`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    try {
      const content = completion.choices[0].message.content || '[]';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return [];
    } catch {
      return [];
    }
  });
}

export default groqClient;
