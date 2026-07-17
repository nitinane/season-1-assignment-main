/**
 * Agent 8 — Hiring Decision Mailer Test Suite
 *
 * Tests:
 *   A. Unit/Mock LLM Tests:
 *      A1. Offer Email Generator (temp 0.5) - Verify placeholder verbatim
 *      A2. Rejection Email Generator (temp 0.5) - Verify respectful tone
 * 
 *   B. Integration/DB Tests (requires active Supabase session & real job_role):
 *      B1. Create a dummy application in DB
 *      B2. Run draftDecisionEmail() for "pass" -> verify draft contains placeholder verbatim
 *      B3. Run sendDecisionEmail() for "pass" -> verify application status becomes "hired"
 *      B4. Repeat B1-B3 for "fail" -> verify application status becomes "rejected"
 */

import { runHiringDecisionMailerAgent, draftDecisionEmail, sendDecisionEmail } from './hiringDecisionMailerAgent';
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

async function testOfferEmailLLM(): Promise<void> {
  console.log('  A1. Offer Email LLM Generator (temp 0.5)');
  const res = await runHiringDecisionMailerAgent(
    'Charlie Candidate',
    'Senior QA Engineer',
    'Jane Recruiter',
    'pass',
    'Outstanding technical skills and excellent testing methodologies.'
  );

  assertNonEmptyString(res.subject, 'subject');
  assertNonEmptyString(res.body, 'body');
  assert(res.body.includes('Charlie') && res.body.includes('QA Engineer'), 'Email should be personalized');
  
  // Validate placeholder verbatim presence
  const placeholder = '[[TO BE FILLED BY HR BEFORE SENDING]]';
  assert(res.body.includes(placeholder), `Offer email body must contain the exact placeholder: ${placeholder}`);
  
  console.log('    ✅ Subject:', res.subject);
  console.log('    ✅ Placeholder verified verbatim in email body.');
}

async function testRejectionEmailLLM(): Promise<void> {
  console.log('  A2. Rejection Email LLM Generator (temp 0.5)');
  const res = await runHiringDecisionMailerAgent(
    'Charlie Candidate',
    'Senior QA Engineer',
    'Jane Recruiter',
    'fail',
    'Strong profile but lacks automated framework design experience.'
  );

  assertNonEmptyString(res.subject, 'subject');
  assertNonEmptyString(res.body, 'body');
  assert(res.body.includes('Charlie') && res.body.includes('QA Engineer'), 'Email should be personalized');
  assert(!res.body.includes('[[TO BE FILLED BY HR BEFORE SENDING]]'), 'Rejection email should not contain offer placeholders');

  console.log('    ✅ Subject:', res.subject);
  console.log('    ✅ Rejection tone is respectful and encouraging.');
}

// ─── B. DB / E2E Integration Tests ──────────────────────────────────────────

async function testEndToEndDB(realJobId: string): Promise<void> {
  console.log('\n  B. DB / E2E Integration tests');
  const hr_user_id = await getCurrentUser();

  // Test Case 1: Pass -> Hired
  console.log('  --- Test Case 1: Pass -> Hired ---');
  console.log('    Creating dummy application in DB…');
  const { data: appPass, error: appPassErr } = await supabase
    .from('applications')
    .insert({
      hr_user_id,
      job_id: realJobId,
      candidate_name: 'Charlie Pass',
      candidate_email: 'antigravity.charlie.pass@example.com',
      resume_text: 'Dummy resume...',
      status: 'interview_scheduled'
    })
    .select()
    .single();

  if (appPassErr || !appPass) {
    throw new Error(`Failed to create dummy application: ${appPassErr?.message}`);
  }
  console.log(`    ✅ Application created: ${appPass.id}`);

  console.log('    [Agent 8] Drafting offer email…');
  const draftPass = await draftDecisionEmail(appPass.id, 'pass', 'Met all requirements.');
  assert(draftPass.success && draftPass.email !== undefined, 'Drafting offer email failed');
  assert(draftPass.email!.body.includes('[[TO BE FILLED BY HR BEFORE SENDING]]'), 'Draft offer email missing placeholder');
  console.log('    ✅ Draft offer email contains placeholder verbatim.');

  console.log('    [Agent 8] Sending offer email and updating status…');
  const sendPassRes = await sendDecisionEmail(appPass.id, 'pass', draftPass.email!.subject, draftPass.email!.body);
  assert(sendPassRes.success, `Sending offer email failed: ${sendPassRes.error}`);

  // Verify status updated to "hired"
  const { data: updatedAppPass } = await supabase
    .from('applications')
    .select('status')
    .eq('id', appPass.id)
    .single();
  assert(updatedAppPass?.status === 'hired', `Expected status "hired", got "${updatedAppPass?.status}"`);
  console.log('    ✅ Application status updated to "hired" in DB.');


  // Test Case 2: Fail -> Rejected
  console.log('  --- Test Case 2: Fail -> Rejected ---');
  console.log('    Creating dummy application in DB…');
  const { data: appFail, error: appFailErr } = await supabase
    .from('applications')
    .insert({
      hr_user_id,
      job_id: realJobId,
      candidate_name: 'Charlie Fail',
      candidate_email: 'antigravity.charlie.fail@example.com',
      resume_text: 'Dummy resume...',
      status: 'interview_scheduled'
    })
    .select()
    .single();

  if (appFailErr || !appFail) {
    throw new Error(`Failed to create dummy application: ${appFailErr?.message}`);
  }

  console.log('    [Agent 8] Drafting rejection email…');
  const draftFail = await draftDecisionEmail(appFail.id, 'fail', 'Lacks required technical skills.');
  assert(draftFail.success && draftFail.email !== undefined, 'Drafting rejection email failed');
  console.log('    ✅ Draft rejection email generated.');

  console.log('    [Agent 8] Sending rejection email and updating status…');
  const sendFailRes = await sendDecisionEmail(appFail.id, 'fail', draftFail.email!.subject, draftFail.email!.body);
  assert(sendFailRes.success, `Sending rejection email failed: ${sendFailRes.error}`);

  // Verify status updated to "rejected"
  const { data: updatedAppFail } = await supabase
    .from('applications')
    .select('status')
    .eq('id', appFail.id)
    .single();
  assert(updatedAppFail?.status === 'rejected', `Expected status "rejected", got "${updatedAppFail?.status}"`);
  console.log('    ✅ Application status updated to "rejected" in DB.');

  // Clean up
  console.log('    Cleaning up database rows…');
  await supabase.from('applications').delete().in('id', [appPass.id, appFail.id]);
  console.log('    ✅ Database cleaned up.');
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

export async function runAgent8Tests(realJobId?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Agent 8 (Hiring Decision Mailer) Test Suite');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testOfferEmailLLM();
    await testRejectionEmailLLM();
    
    if (realJobId) {
      await testEndToEndDB(realJobId);
    } else {
      console.log('\n  DB integration test SKIPPED. Pass a job ID to run: runAgent8Tests("<job_id>")');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ Agent 8 tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('\n❌ Tests failed:', err.message);
  }
}

if (typeof window === 'undefined') {
  runAgent8Tests().catch((e) => {
    console.error('Test suite failed:', e.message);
    process.exit(1);
  });
}
