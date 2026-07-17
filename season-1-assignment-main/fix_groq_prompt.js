const fs = require('fs');
const path = 'c:\\Users\\Nitin\\OneDrive\\Desktop\\mahadev\\hireflow-ai\\src\\lib\\groq.ts';

let content = fs.readFileSync(path, 'utf8');

const newSystemContent = `You are a senior technical recruiter and ATS architect.

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
]`;

// Replacing the content specifically
const systemPromptRegex = /content: \`You are a senior technical recruiter and ATS architect\.[\s\S]*?JSON Schema:[\s\S]*?}\`,/;
content = content.replace(systemPromptRegex, `content: \`${newSystemContent}\`,`);

// Temperature adjustment
content = content.replace('temperature: 0.2', 'temperature: 0.1');

fs.writeFileSync(path, content);
console.log('Successfully updated groq.ts prompts and temperature.');
