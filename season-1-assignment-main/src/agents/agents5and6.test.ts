/**
 * Agent 5 + Agent 6 — End-to-End Test Suite
 *
 * Tests:
 *   A. Unit/Mock LLM Tests:
 *      A1. Shortlist Notifier Email Generator (temp 0.6)
 *      A2. Question Generator (temp 0.7)
 * 
 *   B. Integration/DB Tests (requires active Supabase session & real job_role):
 *      B1. Create scored dummy application in the database (score >= 70)
 *      B2. Trigger notifyShortlistedCandidate() -> check status becomes "shortlisted"
 *      B3. Trigger generateInterviewQuestionsForApplication() -> check interview row is created with 8 questions
 */

import { runShortlistNotifierAgent, notifyShortlistedCandidate } from './shortlistNotifierAgent';
import { runQuestionGeneratorAgent, generateInterviewQuestionsForApplication } from './questionGeneratorAgent';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';

// ─── Assert Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`❌ ASSERTION FAILED: ${message}`);
}

function assertNonEmptyString(val: unknown, field: string): void {
  assert(typeof val === 'string' && val.trim().length > 0, `"${field}" must be a non-empty string`);
}

function assertQuestionsStructure(questions: any[]): void {
  assert(questions.length === 8, `Expected exactly 8 questions, got ${questions.length}`);
  questions.forEach((q, idx) => {
    assert(['technical', 'behavioral', 'gap-focused'].includes(q.category), `Question ${idx} has invalid category`);
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), `Question ${idx} has invalid difficulty`);
    assertNonEmptyString(q.question, `Question ${idx} text`);
    assertNonEmptyString(q.skill, `Question ${idx} skill`);
  });
}

// ─── A. Unit / LLM Only Tests ───────────────────────────────────────────────

async function testShortlistEmailLLM(): Promise<void> {
  console.log('  A1. Shortlist Notifier Email LLM Generator (temp 0.6)');
  const res = await runShortlistNotifierAgent(
    'Alice candidate',
    'Senior React Developer',
    'Jane Recruiter'
  );
  
  assertNonEmptyString(res.subject, 'subject');
  assertNonEmptyString(res.body, 'body');
  assert(!res.body.includes('70') && !res.body.includes('score'), 'Email should not mention scores/grades');
  assert(res.body.includes('Alice') && res.body.includes('React'), 'Email should be personalized');

  console.log('    ✅ Subject:', res.subject);
  console.log('    ✅ Body snippet:', res.body.slice(0, 100) + '…');
}

async function testQuestionGeneratorLLM(): Promise<void> {
  console.log('  A2. Question Generator LLM (temp 0.7)');
  const questions = await runQuestionGeneratorAgent(
    'Senior React Developer',
    'Build and maintain scalable dashboards using React, TypeScript, and state management.',
    ['React', 'TypeScript', 'State management'],
    ['Docker', 'Testing (Jest)'],
    'Strong candidate with excellent frontend skills, but has no experience with Docker or automated tests.'
  );

  assertQuestionsStructure(questions);
  console.log('    ✅ Generated exactly 8 valid questions');
  console.log('    🔍 Questions categories:', questions.map(q => q.category).join(', '));
}

// ─── B. DB / E2E Integration Tests ──────────────────────────────────────────

async function testEndToEndDB(realJobId: string): Promise<void> {
  console.log('\n  B. DB / E2E Integration tests');
  const hr_user_id = await getCurrentUser();

  // Create a dummy application with status "scored" and score = 85 (above threshold)
  console.log('    Creating scored dummy application in DB…');
  const scoreReasoning = JSON.stringify({
    match_score: 85,
    matched_skills: ['React', 'TypeScript'],
    missing_skills: ['Docker'],
    reasoning: 'Exceptional developer with strong React background.',
    advantage_notes: 'AWS certified.'
  });

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .insert({
      hr_user_id,
      job_id: realJobId,
      candidate_name: 'Test Candidate',
      candidate_email: 'antigravity.test.candidate@example.com',
      resume_text: 'Dummy resume text...',
      score: 85,
      score_reasoning: scoreReasoning,
      status: 'scored'
    })
    .select()
    .single();

  if (appErr || !app) {
    throw new Error(`Failed to create dummy application: ${appErr?.message}`);
  }
  console.log(`    ✅ Application created: ${app.id}`);

  // Test Agent 5 - Shortlist Notifier
  console.log('    [Agent 5] Notifying shortlisted candidate…');
  // Pass a dummy string for tokenOverride if Gmail credentials are not ready to prevent crash,
  // or let it try if the user is authenticated. We'll try running it.
  const agent5Res = await notifyShortlistedCandidate(app.id);
  console.log('    Agent 5 response:', agent5Res);
  
  // Verify application status changed to "shortlisted" in DB
  const { data: updatedApp } = await supabase
    .from('applications')
    .select('status')
    .eq('id', app.id)
    .single();

  assert(updatedApp?.status === 'shortlisted', `Expected status to be "shortlisted", got "${updatedApp?.status}"`);
  console.log('    ✅ Application status updated to "shortlisted" in DB');

  // Test Agent 6 - Question Generator
  console.log('    [Agent 6] Generating and saving interview questions…');
  const agent6Res = await generateInterviewQuestionsForApplication(app.id);
  assert(agent6Res.success, `Agent 6 failed: ${agent6Res.error}`);

  // Verify interview row was created in DB
  const { data: interview } = await supabase
    .from('interviews')
    .select('*')
    .eq('application_id', app.id)
    .single();

  assert(interview !== null, 'Interview row should have been created in DB');
  assert(interview.status === 'questions_ready', `Expected interview status to be "questions_ready", got "${interview.status}"`);
  
  const parsedQuestions = JSON.parse(interview.questions);
  assertQuestionsStructure(parsedQuestions);
  console.log('    ✅ Saved exactly 8 valid questions to the interviews table in DB');

  // Clean up
  console.log('    Cleaning up database rows…');
  await supabase.from('interviews').delete().eq('application_id', app.id);
  await supabase.from('applications').delete().eq('id', app.id);
  console.log('    ✅ Database cleaned up.');
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

export async function runAgent5And6Tests(realJobId?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Agent 5 (Shortlist Notifier) + Agent 6 (Question Gen) Test');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testShortlistEmailLLM();
    await testQuestionGeneratorLLM();
    
    if (realJobId) {
      await testEndToEndDB(realJobId);
    } else {
      console.log('\n  DB integration test SKIPPED. Pass a job ID to run: runAgent5And6Tests("<job_id>")');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ All Agent 5 + Agent 6 tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('\n❌ Tests failed:', err.message);
  }
}

if (typeof window === 'undefined') {
  runAgent5And6Tests().catch((e) => {
    console.error('Test suite failed:', e.message);
    process.exit(1);
  });
}
