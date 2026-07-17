export interface HRUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  google_access_token?: string;
  created_at: string;
}

export interface JobRole {
  id: string;
  hr_user_id: string;
  title: string;
  required_skills: string[];
  preferred_tools: string[];
  experience_level?: string;
  experience_range?: string;
  location?: string;
  description: string;
  status: string;
  candidate_count?: number;
  shortlisted_count?: number;
  created_at: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  score: number;
  summary: string;
  skills: string[];
  projects: string[];
  years_experience: string;
  education: string;
  certifications: string[];
  companies: string[];
  tech_stack: string[];
  keywords: string[];
  raw_text: string;
  resume_url?: string;
  received_at: string;
  hr_user_id: string;
  created_at: string;
}

export interface ShortlistedCandidate {
  id: string;
  candidate_id: string;
  job_id: string;
  score: number;
  match_percentage?: number;
  summary?: string;
  reason: string;
  strengths: string[];
  weaknesses: string[];
  missing_skills?: string[];
  rank: number;
  candidate_name?: string;
  candidate_email?: string;
  resume_text?: string;
  local_score?: number;
  interview_questions?: InterviewQuestion[];
  email_status?: 'pending' | 'sent' | 'failed';
  created_at: string;
  candidate?: Candidate;
}

export interface DuplicateFlag {
  id: string;
  candidate_id: string;
  duplicate_of_id: string;
  reason: string;
  created_at: string;
}

export interface FraudFlag {
  id: string;
  candidate_id: string;
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
  created_at: string;
  candidates?: Candidate;
}

export interface InterviewQuestion {
  skill: string;
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SentEmail {
  id: string;
  candidate_id: string;
  hr_user_id: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  email_body: string;
}

export interface AnalyticsData {
  total_applications: number;
  shortlisted: number;
  rejected: number;
  duplicates: number;
  frauds: number;
  avg_score: number;
  skill_distribution: Record<string, number>;
  applications_over_time: { date: string; count: number }[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers: { name: string; value: string }[];
    parts?: GmailPart[];
    body?: { data: string; size: number };
  };
  internalDate: string;
}

export interface GmailPart {
  partId: string;
  mimeType: string;
  filename: string;
  body: {
    attachmentId?: string;
    data?: string;
    size: number;
  };
  parts?: GmailPart[];
}

export interface ParsedResume {
  rawText: string;
  candidateData: Partial<Candidate>;
}

export interface AIScoreResult {
  rank: number;
  name: string;
  email?: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  reason: string;
  match_percentage?: number;
  summary?: string;
  missing_skills?: string[];
  jdMatchScore?: number;
  industryFitScore?: number;
  projectRelevanceScore?: number;
  experienceDepthScore?: number;
  communicationScore?: number;
  industryFit?: string;
  recommendation?: string;
}

export interface FraudResult {
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export type ProcessingStep =
  | 'idle'
  | 'fetching_emails'
  | 'downloading_attachments'
  | 'parsing_resumes'
  | 'anonymizing'
  | 'ai_scoring'
  | 'detecting_duplicates'
  | 'detecting_fraud'
  | 'shortlisting'
  | 'complete'
  | 'error';

export interface ProcessingState {
  step: ProcessingStep;
  progress: number;
  total: number;
  current: number;
  message: string;
}
