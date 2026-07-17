/**
 * Agent 2 — Social Poster Test Suite
 *
 * Tests:
 *   A. Unit/Mock LLM Tests:
 *      A1. LinkedIn Post draft generator (temp 0.7)
 * 
 *   B. Integration/DB Tests (requires active Supabase session):
 *      B1. Create a dummy job role in DB
 *      B2. Run generateAndSaveSocialDraft() -> verify social_draft column updated in DB
 */

import { runSocialPosterAgent, generateAndSaveSocialDraft } from './socialPosterAgent';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';

// ─── Assert Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`❌ ASSERTION FAILED: ${message}`);
}

function assertNonEmptyString(val: unknown, field: string): void {
  assert(typeof val === 'string' && val.trim().length > 0, `"${field}" must be a non-empty string`);
}

// ─── A. Unit / LLM Only Tests ───────────────────────────────────────────────

async function testSocialPosterLLM(): Promise<void> {
  console.log('  A1. LinkedIn Post LLM Generator (temp 0.7)');
  const res = await runSocialPosterAgent(
    'Lead Security Architect',
    '8+ years',
    ['Cloud Security', 'Kubernetes', 'OAuth2', 'Threat Modeling'],
    ['AWS Security Hub', 'Snyk'],
    'We are seeking an expert Security Architect to safeguard our cloud-native financial platform.'
  );

  assertNonEmptyString(res.post_copy, 'post_copy');
  assertNonEmptyString(res.image_prompt, 'image_prompt');
  assert(res.post_copy.includes('Security Architect'), 'Post copy should mention job title');
  assert(res.post_copy.includes('#'), 'Post copy should include hashtags');

  console.log('    ✅ LinkedIn Post Copy snippet:', res.post_copy.slice(0, 150) + '…');
  console.log('    ✅ Suggested Image Prompt:', res.image_prompt);
}

// ─── B. DB / E2E Integration Tests ──────────────────────────────────────────

async function testEndToEndDB(): Promise<void> {
  console.log('\n  B. DB / E2E Integration tests');
  const hr_user_id = await getCurrentUser();

  console.log('    Creating dummy job role in DB…');
  const { data: job, error: jobErr } = await supabase
    .from('job_roles')
    .insert({
      hr_user_id,
      title: 'Temporary Test Developer',
      required_skills: ['React', 'TypeScript'],
      preferred_tools: ['Vite'],
      experience_level: '2-4 years',
      description: 'Test JD description'
    })
    .select()
    .single();

  if (jobErr || !job) {
    throw new Error(`Failed to create dummy job role: ${jobErr?.message}`);
  }
  console.log(`    ✅ Job role created: ${job.id}`);

  // Test Agent 2 - Social Poster
  console.log('    [Agent 2] Generating and saving social post draft…');
  const agent2Res = await generateAndSaveSocialDraft(job.id);
  assert(agent2Res.success && agent2Res.draft !== undefined, `Draft generation failed: ${agent2Res.error}`);

  // Verify social_draft was saved in DB
  const { data: updatedJob } = await supabase
    .from('job_roles')
    .select('social_draft')
    .eq('id', job.id)
    .single();

  assert(updatedJob?.social_draft !== null, 'social_draft column should not be null in DB');
  const savedDraft = updatedJob!.social_draft as any;
  assert(savedDraft.post_copy === agent2Res.draft!.post_copy, 'Saved post copy mismatch');
  assert(savedDraft.image_prompt === agent2Res.draft!.image_prompt, 'Saved image prompt mismatch');
  console.log('    ✅ Saved social draft verified in DB');

  // Clean up
  console.log('    Cleaning up database rows…');
  await supabase.from('job_roles').delete().eq('id', job.id);
  console.log('    ✅ Database cleaned up.');
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

export async function runAgent2Tests(runDb: boolean = false): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Agent 2 (Social Poster) Test Suite');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testSocialPosterLLM();
    
    if (runDb) {
      await testEndToEndDB();
    } else {
      console.log('\n  DB integration test SKIPPED. Pass true to run: runAgent2Tests(true)');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ Agent 2 tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('\n❌ Tests failed:', err.message);
  }
}

if (typeof window === 'undefined') {
  runAgent2Tests(true).catch((e) => {
    console.error('Test suite failed:', e.message);
    process.exit(1);
  });
}
