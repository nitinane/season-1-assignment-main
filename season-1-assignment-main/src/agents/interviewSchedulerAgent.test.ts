/**
 * Agent 7 — Interview Scheduler Test Suite
 *
 * Tests:
 *   A. Unit/Mock LLM Tests:
 *      A1. Invite Email Generator (temp 0.3)
 * 
 *   B. Integration/DB Tests (requires active Supabase session & real job_role):
 *      B1. Create a dummy application in DB
 *      B2. Run scheduleInterview() -> verify interviews row updated + status "scheduled"
 *      B3. Verify applications row status updated to "interview_scheduled"
 */

import { runInterviewSchedulerAgent, scheduleInterview } from './interviewSchedulerAgent';
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

async function testInviteEmailLLM(): Promise<void> {
  console.log('  A1. Invite Email LLM Generator (temp 0.3)');
  const res = await runInterviewSchedulerAgent(
    'Bob Candidate',
    'Senior Product Manager',
    'Wednesday, October 15, 2026 at 2:00 PM EST',
    'Jane Recruiter'
  );
  
  assertNonEmptyString(res.subject, 'subject');
  assertNonEmptyString(res.body, 'body');
  assert(res.body.includes('Bob') && res.body.includes('Product Manager'), 'Email should be personalized');
  assert(res.body.includes('Wednesday') && res.body.includes('2:00 PM'), 'Email should include scheduled date/time');
  assert(!res.body.includes('?') && !res.body.includes('technical') && !res.body.includes('behavioral'), 'Email should NOT include questions');

  console.log('    ✅ Subject:', res.subject);
  console.log('    ✅ Body snippet:', res.body.slice(0, 120) + '…');
}

// ─── B. DB / E2E Integration Tests ──────────────────────────────────────────

async function testEndToEndDB(realJobId: string): Promise<void> {
  console.log('\n  B. DB / E2E Integration tests');
  const hr_user_id = await getCurrentUser();

  console.log('    Creating dummy application in DB…');
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .insert({
      hr_user_id,
      job_id: realJobId,
      candidate_name: 'Bob Candidate',
      candidate_email: 'antigravity.test.bob@example.com',
      resume_text: 'Dummy resume...',
      status: 'shortlisted'
    })
    .select()
    .single();

  if (appErr || !app) {
    throw new Error(`Failed to create dummy application: ${appErr?.message}`);
  }
  console.log(`    ✅ Application created: ${app.id}`);

  // Test Agent 7 - Interview Scheduler
  console.log('    [Agent 7] Scheduling interview…');
  const scheduledTime = new Date(Date.now() + 86400000 * 2).toISOString(); // 2 days from now
  const agent7Res = await scheduleInterview(app.id, scheduledTime);
  console.log('    Agent 7 response:', agent7Res);

  // Verify interviews table was updated
  const { data: interview } = await supabase
    .from('interviews')
    .select('*')
    .eq('application_id', app.id)
    .single();

  assert(interview !== null, 'Interview row should have been created in DB');
  assert(interview.status === 'scheduled', `Expected status "scheduled", got "${interview.status}"`);
  assert(new Date(interview.scheduled_at).getTime() === new Date(scheduledTime).getTime(), 'scheduled_at time mismatch');
  console.log('    ✅ Interview row verified in DB');

  // Verify application status updated to "interview_scheduled"
  const { data: updatedApp } = await supabase
    .from('applications')
    .select('status')
    .eq('id', app.id)
    .single();

  assert(updatedApp?.status === 'interview_scheduled', `Expected status "interview_scheduled", got "${updatedApp?.status}"`);
  console.log('    ✅ Application status updated to "interview_scheduled" in DB');

  // Clean up
  console.log('    Cleaning up database rows…');
  await supabase.from('interviews').delete().eq('application_id', app.id);
  await supabase.from('applications').delete().eq('id', app.id);
  console.log('    ✅ Database cleaned up.');
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

export async function runAgent7Tests(realJobId?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Agent 7 (Interview Scheduler) Test Suite');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testInviteEmailLLM();
    
    if (realJobId) {
      await testEndToEndDB(realJobId);
    } else {
      console.log('\n  DB integration test SKIPPED. Pass a job ID to run: runAgent7Tests("<job_id>")');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ Agent 7 tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('\n❌ Tests failed:', err.message);
  }
}

if (typeof window === 'undefined') {
  runAgent7Tests().catch((e) => {
    console.error('Test suite failed:', e.message);
    process.exit(1);
  });
}
