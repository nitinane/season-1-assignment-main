const fs = require('fs');
const path = 'c:\\Users\\Nitin\\OneDrive\\Desktop\\mahadev\\hireflow-ai\\src\\lib\\groq.ts';
let content = fs.readFileSync(path, 'utf8');

const newBulkScoreFunction = `export async function bulkScoreCandidates(
  candidates: any[],
  job: any
): Promise<AIScoreResult[]> {
  if (candidates.length === 0) return [];

  return safeGroqRequest(async () => {
    // Construct High-Detail Dossier
    const dossier = candidates.map((c, index) => \`
CANDIDATE \${index + 1}
Name: \${c.name}
Email: \${c.email}
Phone: \${c.phone || "Not provided"}
Summary: \${c.summary || "No summary provided"}
Resume Snapshot:
\${c.rawText.slice(0, 3500)}
-----------------------------------
\` ).join("\\n");

    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: \`You are a senior technical recruiter and ATS architect.

Compare ALL provided resumes against each other for the \${job.title} role.

STRICT RULE:
- Return ONLY valid JSON.
- Do NOT include explanations, markdown code blocks, or conversational text.
- Rank ALL candidates from best to worst.
- Return ONLY the TOP 10 candidates.
- Use a realistic, comparative ATS score distribution (e.g., 96, 92, 89, 85, 81...).
- Generate a UNIQUE, detailed "unique_reason" (min 2 sentences).
- Generate "strengths" and "weaknesses" list (min 3 items each).
- Use the "exact_name" and "exact_email" from input.

JSON Schema:
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
]\`,
        },
        {
          role: 'user',
          content: \`JOB ROLE: \${job.title || "Unknown Role"}\\nJD Summary: \${job.description || "No description provided"}\\nRequired Skills: \${(job.required_skills || []).join(", ")}\\n\\nCandidates dossier:\\n\${dossier}\`,
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
`;

const startMarker = 'export async function bulkScoreCandidates';
const endMarker = '    } catch (e) {\\n      console.error(\"Bulk scoring parse error. Raw Output:\", rawContent);\\n      return [];\\n    }\\n  });\\n}';


// Find the end of the existing function
const startIndex = content.indexOf(startMarker);
// Look for the last closing brace of the safeGroqRequest and the function
const functionEndIndex = content.indexOf('  });', startIndex) + 8; // approximate

if (startIndex === -1) {
    console.error('Start marker not found');
    process.exit(1);
}

// Safer replacement: search for the whole function block
const regex = /export async function bulkScoreCandidates[\s\S]*?}\n}/;
content = content.replace(regex, newBulkScoreFunction);

fs.writeFileSync(path, content);
console.log('Update successful');
