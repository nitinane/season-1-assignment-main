import { supabase } from '../lib/supabase';
import { bulkScoreCandidates } from '../lib/groq';
import { getCurrentUser } from './authService';

export const industryBenchmarks: Record<string, string[]> = {
  "Frontend Developer": [
    "React", "TypeScript", "JavaScript", "REST API integration", 
    "Responsive design", "State management", "Performance optimization", 
    "Git", "Deployment", "UI/UX fundamentals", "CSS/SASS"
  ],
  "Backend Developer": [
    "Node.js", "Express", "Database design", "Authentication", 
    "API security", "SQL", "System design", "Redis", "Docker", "Unit testing"
  ],
  "Fullstack Developer": [
    "React", "Node.js", "TypeScript", "SQL/NoSQL databases", 
    "API architecture", "Cloud services (AWS/Vercel)", "Deployment", 
    "Auth patterns", "Problem solving"
  ],
  "AI / Machine Learning Engineer": [
    "Python", "PyTorch/TensorFlow", "LLMs", "Prompt engineering", 
    "Data preprocessing", "Vectordb (Pinecone/Milvus)", "RAG pipelines",
    "Model deployment", "Mathematics", "Cloud GPUs"
  ],
  "Data Analyst": [
    "SQL", "Python/R", "Data visualization", "Tableau/PowerBI",
    "Statistics", "Excel (Advanced)", "Business acumen",
    "Critical thinking", "Data cleaning"
  ],
  "DevOps Engineer": [
    "Docker", "Kubernetes", "CI/CD pipelines", "Terraform",
    "Cloud providers (AWS/GCP/Azure)", "Monitoring (Prometheus/Grafana)",
    "Linux administration", "Networking", "Security"
  ]
};

export const getBenchmarksForRole = (title: string): string[] => {
  const lower = title.toLowerCase();
  
  if (lower.includes('frontend')) return industryBenchmarks["Frontend Developer"];
  if (lower.includes('backend')) return industryBenchmarks["Backend Developer"];
  if (lower.includes('fullstack')) return industryBenchmarks["Fullstack Developer"];
  if (lower.includes('ai') || lower.includes('machine learning') || lower.includes('llm')) 
    return industryBenchmarks["AI / Machine Learning Engineer"];
  if (lower.includes('data')) return industryBenchmarks["Data Analyst"];
  if (lower.includes('devops') || lower.includes('infra')) return industryBenchmarks["DevOps Engineer"];
  
  // Default to a general technical benchmark if no keyword matches
  return [
    "Problem solving", "Technical communication", "System understanding",
    "Core tooling", "Version control", "Professional experience"
  ];
};

const normalizeToArray = (value: any): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const aiRankingService = {
  /**
   * Orchestrates the full AI ranking pipeline for a specific job role.
   * Compares all candidates in the database for this job.
   */
  async processRankingPipeline(jobId: string) {
    const hr_user_id = await getCurrentUser();
    
    // 1. Fetch Job Role Details
    const { data: job, error: jobErr } = await supabase
      .from('job_roles')
      .select('*')
      .eq('id', jobId)
      .eq('hr_user_id', hr_user_id)
      .single();
    
    if (jobErr || !job) throw new Error('Job role not found or access denied');

    // 🛡️ NORMALIZE JOB FIELDS
    const requiredSkills = normalizeToArray(job.required_skills);
    const preferredTools = normalizeToArray(job.preferred_tools);
    const normalizedJob = { ...job, required_skills: requiredSkills, preferred_tools: preferredTools };

    // 2. Fetch all candidates for this HR user (or specifically for this job if tagged)
    // Note: Candidates aren't technically linked to jobs in the candidates table, 
    // but we rank them all against this specific job's JD.
    const { data: allCandidates, error: candErr } = await supabase
      .from('candidates')
      .select('*')
      .eq('hr_user_id', hr_user_id);
      
    if (candErr) throw candErr;
    if (!allCandidates || allCandidates.length === 0) return [];

    // 3. Transform for Groq Bulk Engine
    const formattedCandidates = allCandidates.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      summary: c.summary || c.raw_text?.slice(0, 500),
      rawText: c.raw_text || "",
    }));

    // 4. Trigger Bulk AI Ranking (Batching to top 20 for safety)
    const batchCandidates = formattedCandidates.slice(0, 20);
    let aiResults: any[] = [];
    
    try {
      aiResults = await bulkScoreCandidates(batchCandidates, normalizedJob);
    } catch (err) {
      console.error("Critical AI Ranking Error:", err);
    }

    // 🌟 FALLBACK SYSTEM: If AI fails, use Heuristic Skills matching
    if (!aiResults || aiResults.length === 0) {
      console.warn("AI Ranking failed or returned empty. Using Heuristic Fallback.");
      const lowerRequiredSkills = requiredSkills.map((s: string) => s.toLowerCase());
      
      aiResults = batchCandidates.map((c, index) => {
        const candidateSkills = (c.summary + " " + c.rawText).toLowerCase();
        let matchCount = 0;
        lowerRequiredSkills.forEach((s: string) => {
          if (candidateSkills.includes(s)) matchCount++;
        });

        const score = lowerRequiredSkills.length > 0 
          ? Math.min(90, Math.round((matchCount / lowerRequiredSkills.length) * 100))
          : 50;

        return {
          rank: index + 1,
          exact_name: c.name,
          exact_email: c.email,
          score: score,
          unique_reason: "Heuristic match based on listed skills and resume keywords.",
          strengths: ["Matching skills found in resume"],
          weaknesses: ["Manual review recommended (AI Fallback active)"],
          match_percentage: score,
          reason: "Heuristic match based on listed skills and resume keywords."
        };
      }).sort((a, b) => b.score - a.score);
    }

    // 5. Clear stale shortlist for this job
    await supabase
      .from('shortlisted_candidates')
      .delete()
      .eq('job_id', jobId)
      .eq('hr_user_id', hr_user_id);

    // 6. Save top 10 results
    const resultsToSave = aiResults.slice(0, 10).map((res, index) => {
      const originalCandidate = allCandidates.find(c => c.name === res.name || c.email === res.email);
      return {
        hr_user_id,
        job_id: jobId,
        candidate_id: originalCandidate?.id,
        candidate_name: originalCandidate?.name || res.name,
        candidate_email: originalCandidate?.email || res.email,
        score: res.score,
        rank: index + 1,
        resume_text: originalCandidate?.raw_text || res.summary,
        reason: res.reason,
        strengths: originalCandidate?.skills || res.strengths,
        weaknesses: originalCandidate?.missing_skills || res.weaknesses || [],
        local_score: res.score,
      };
    });

    const { data: saved, error: saveErr } = await supabase
      .from('shortlisted_candidates')
      .insert(resultsToSave)
      .select();

    if (saveErr) throw saveErr;
    return saved;
  }
};
