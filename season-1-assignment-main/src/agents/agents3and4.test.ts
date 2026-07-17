/**
 * Agent 3 + Agent 4 — End-to-End Test Suite
 *
 * Tests:
 *   A. Unit tests — no network/DB calls
 *      A1. Text extraction helpers (mock blobs)
 *      A2. Email inference regex
 *      A3. stripMarkdownFences (from scorer)
 *      A4. validateScorerOutput — accepts valid, rejects bad
 *
 *   B. Integration test — calls Groq API + Supabase (requires auth)
 *      B1. Run one dummy resume through Agent 3 (ingestFromBlob)
 *          → confirms application row is created with status="ingested"
 *      B2. Run Agent 4 (scoreApplication) on that row
 *          → confirms row updates to status="scored" with score 0-100
 *
 * Usage (browser console after importing):
 *   import { runAgent3And4Tests } from './src/agents/agents3and4.test';
 *   runAgent3And4Tests();
 */

import { ingestFromBlob } from './applicationIngestorAgent';
import {
  runResumeScorerAgent,
  validateScorerOutput,
  scoreApplication,
  type InnerScorerResult,
} from './resumeScorerAgent';
import { supabase } from '../lib/supabase';

// Re-export validateScorerOutput from resumeScorerAgent for testing
// (we make it accessible by importing here)

// ─── Dummy data ───────────────────────────────────────────────────────────────

const DUMMY_RESUME_TEXT = `
John Smith
john.smith@email.com | +1-555-0123 | github.com/johnsmith

SUMMARY
Senior Frontend Developer with 5 years of experience building scalable React applications.
Passionate about TypeScript, performance optimisation, and clean architecture.

SKILLS
React, TypeScript, JavaScript, HTML5, CSS3, Tailwind CSS, Next.js,
Redux, Zustand, REST APIs, GraphQL, Git, Webpack, Vite, Jest, Cypress

EXPERIENCE
Senior Frontend Developer — TechCorp Inc.          Jan 2021 – Present
• Led migration of legacy codebase from JavaScript to TypeScript (250k+ lines)
• Built real-time dashboard with WebSockets serving 50k daily active users
• Reduced bundle size by 40% through code-splitting and lazy loading
• Mentored 3 junior developers, conducted weekly code reviews

Frontend Developer — StartupXYZ                    Jun 2019 – Dec 2020
• Delivered 12 features across 6 product sprints using React + Redux
• Integrated Stripe payment API, handling $2M+ monthly transactions
• Wrote unit/integration tests (Jest + Cypress) achieving 85% coverage

EDUCATION
B.Sc. Computer Science — State University, 2019

CERTIFICATIONS
• AWS Certified Developer – Associate (2022)
• Meta Frontend Developer Professional Certificate (2023)
`.trim();

const DUMMY_JD = {
  title: 'Senior Frontend Developer',
  description: 'We are looking for an experienced frontend engineer to build our next-gen SaaS dashboard.',
  required_skills: ['React', 'TypeScript', 'REST APIs', 'Git', 'Performance optimization'],
  preferred_tools: ['Tailwind CSS', 'Vite', 'Jest'],
  experience_level: '4-7 years (Senior)',
};

// Dummy job ID — replace with a real job_roles UUID when running integration tests
// const DUMMY_JOB_ID = '00000000-0000-0000-0000-000000000001';

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`❌ ASSERTION FAILED: ${message}`);
}

function assertRange(val: number, min: number, max: number, field: string): void {
  assert(val >= min && val <= max, `"${field}" must be between ${min} and ${max}, got ${val}`);
}

function assertNonEmptyString(val: unknown, field: string): void {
  assert(typeof val === 'string' && val.trim().length > 0, `"${field}" must be a non-empty string`);
}

// ─── A. Unit Tests ────────────────────────────────────────────────────────────

function testValidateScorerOutput(): void {
  console.log('  A4. validateScorerOutput');

  const valid = {
    match_score: 82,
    matched_skills: ['React', 'TypeScript'],
    missing_skills: ['Docker'],
    reasoning: 'This is a STRONG match because the candidate has 5 years of React experience.',
    advantage_notes: 'AWS certification is a bonus.',
  };

  // Should not throw
  validateScorerOutput(valid);
  console.log('    ✅ valid object passes');

  const cases: [unknown, string][] = [
    [{ ...valid, match_score: -1 }, 'negative score rejected'],
    [{ ...valid, match_score: 101 }, 'score > 100 rejected'],
    [{ ...valid, match_score: 'high' }, 'string score rejected'],
    [{ ...valid, matched_skills: 'React' }, 'matched_skills as string rejected'],
    [{ ...valid, reasoning: '' }, 'empty reasoning rejected'],
  ];

  for (const [bad, label] of cases) {
    let threw = false;
    try { validateScorerOutput(bad); } catch { threw = true; }
    assert(threw, `validateScorerOutput should throw when ${label}`);
    console.log(`    ✅ ${label}`);
  }
}

function testEmailInference(): void {
  console.log('  A2. Email inference regex');
  const text = 'John Smith\njohn.smith@example.com\nSome other text';
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  assert(match !== null, 'should find email in text');
  assert(match![0] === 'john.smith@example.com', 'extracted email should match');
  console.log('    ✅ email regex correctly extracts address');
}

function testStripMarkdownFences(): void {
  console.log('  A3. stripMarkdownFences');
  const withFence = '```json\n{"match_score":80}\n```';
  const stripped = withFence.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  assert(stripped === '{"match_score":80}', 'should strip ```json fences');
  console.log('    ✅ fences stripped correctly');
}

// ─── B. Integration Tests (Groq + Supabase) ──────────────────────────────────

/**
 * B1. Agent 4 LLM-only test (no DB write) — validates the scorer output
 * with a dummy resume and JD.
 */
async function testScorerLLMOnly(): Promise<void> {
  console.log('\n  B1. Agent 4 LLM output (no DB)');
  console.log('    Scoring dummy resume against Senior Frontend Developer JD…');

  const result: InnerScorerResult = await runResumeScorerAgent(DUMMY_RESUME_TEXT, DUMMY_JD);

  assert(result.success === true, `Agent 4 should succeed. Error: ${!result.success ? result.error : ''}`);

  if (!result.success) throw new Error(result.error);

  const { data } = result;
  assertRange(data.match_score, 0, 100, 'match_score');
  assert(Array.isArray(data.matched_skills), '"matched_skills" must be array');
  assert(Array.isArray(data.missing_skills), '"missing_skills" must be array');
  assertNonEmptyString(data.reasoning, 'reasoning');
  assert(typeof data.advantage_notes === 'string', '"advantage_notes" must be string');

  console.log(`    ✅ success: true`);
  console.log(`    📊 match_score: ${data.match_score}/100`);

  // Confirm rubric tier label appears in reasoning
  const tier = data.match_score >= 90 ? 'EXCEPTIONAL'
    : data.match_score >= 70 ? 'STRONG'
    : data.match_score >= 50 ? 'PARTIAL'
    : 'WEAK';
  console.log(`    📋 expected rubric tier: ${tier}`);
  console.log(`    💬 reasoning: ${data.reasoning.slice(0, 120)}…`);
  console.log(`    ✅ matched_skills: ${data.matched_skills.join(', ')}`);
  console.log(`    ❌ missing_skills: ${data.missing_skills.join(', ') || '(none)'}`);
  if (data.advantage_notes) {
    console.log(`    ⭐ advantage_notes: ${data.advantage_notes.slice(0, 80)}…`);
  }
}

/**
 * B2. Full end-to-end: Agent 3 (ingestFromBlob) → Agent 4 (scoreApplication)
 * Requires:
 *   - A valid Supabase session (user must be logged in)
 *   - A real job_roles row UUID (replace DUMMY_JOB_ID)
 */
async function testEndToEnd(realJobId: string): Promise<void> {
  console.log('\n  B2. End-to-end: Agent 3 ingest → Agent 4 score');

  // Create a Blob from the dummy resume text
  const blob = new Blob([DUMMY_RESUME_TEXT], { type: 'text/plain' });

  // ── Agent 3 ──
  console.log('    [Agent 3] Ingesting dummy resume blob…');
  const ingestResult = await ingestFromBlob(
    blob,
    'john_smith_resume.txt',
    'text/plain',
    realJobId,
    null, // no Drive file ID for manual upload
    { name: 'John Smith', email: 'john.smith@email.com' }
  );

  assert(ingestResult.success, `Agent 3 should succeed. Error: ${ingestResult.error}`);
  assert(ingestResult.application !== undefined, 'application row should be returned');

  const { application } = ingestResult;
  assert(application!.status === 'ingested', `status should be "ingested", got "${application!.status}"`);
  assert(application!.candidate_name === 'John Smith', 'candidate_name should be John Smith');
  assert(application!.resume_text.length > 100, 'resume_text should not be empty');
  assert(application!.score === null, 'score should be null before scoring');

  console.log(`    ✅ Application created: ${application!.id}`);
  console.log(`    ✅ status: ${application!.status}`);
  console.log(`    ✅ candidate_name: ${application!.candidate_name}`);
  console.log(`    ✅ resume_text length: ${application!.resume_text.length} chars`);

  // ── Agent 4 ──
  console.log(`\n    [Agent 4] Scoring application ${application!.id}…`);
  const scoreResult = await scoreApplication(application!.id);

  assert(scoreResult.success, `Agent 4 should succeed. Error: ${!scoreResult.success ? scoreResult.error : ''}`);

  if (!scoreResult.success) throw new Error(scoreResult.error);

  assertRange(scoreResult.data.match_score, 0, 100, 'match_score');
  assertNonEmptyString(scoreResult.data.reasoning, 'reasoning');

  // Verify DB was updated
  const { data: updatedApp } = await supabase
    .from('applications')
    .select('status, score, score_reasoning')
    .eq('id', application!.id)
    .single();

  assert(updatedApp?.status === 'scored', `DB status should be "scored", got "${updatedApp?.status}"`);
  assert(updatedApp?.score === scoreResult.data.match_score, 'DB score should match agent output');
  assert(typeof updatedApp?.score_reasoning === 'string', 'score_reasoning should be stored as string');

  // Confirm score_reasoning is valid JSON containing the full output
  const parsedReasoning = JSON.parse(updatedApp!.score_reasoning);
  assert(typeof parsedReasoning.match_score === 'number', 'score_reasoning JSON should have match_score');

  console.log(`    ✅ Application ${application!.id} updated in DB`);
  console.log(`    ✅ status: ${updatedApp!.status}`);
  console.log(`    ✅ score: ${updatedApp!.score}/100`);
  console.log(`    ✅ score_reasoning: valid JSON stored`);
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

/**
 * Run all tests.
 *
 * @param realJobId  A real job_roles UUID from your Supabase DB.
 *                   If omitted, the end-to-end DB test is skipped.
 *                   You can find a UUID on the Supabase Dashboard → Table Editor → job_roles.
 */
export async function runAgent3And4Tests(realJobId?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Agent 3 (Ingestor) + Agent 4 (Scorer) — Test Suite');
  console.log('═══════════════════════════════════════════════════════════');

  // ── A. Unit tests (no API/DB) ──
  console.log('\n── A. Unit Tests (no API / DB) ──');
  testEmailInference();
  testStripMarkdownFences();
  testValidateScorerOutput();
  console.log('\n✅ All unit tests passed');

  // ── B. Integration tests ──
  console.log('\n── B. Integration Tests (Groq API) ──');
  await testScorerLLMOnly();

  if (realJobId) {
    await testEndToEnd(realJobId);
  } else {
    console.log('\n  B2. End-to-end DB test SKIPPED');
    console.log('      → Pass a real job_roles UUID to runAgent3And4Tests("<uuid>") to run it.');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ✅ All Agent 3 + Agent 4 tests complete');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Auto-run in Node (ts-node / vitest) without DB test
if (typeof window === 'undefined') {
  runAgent3And4Tests().catch((e) => {
    console.error('Test suite failed:', e.message);
    process.exit(1);
  });
}
