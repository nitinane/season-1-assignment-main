/**
 * Agent 1 — JD Generator: manual integration tests
 *
 * Run from the browser console or a Node test harness.
 * Each test feeds in a sample HR note and confirms:
 *   1. agentResult.success === true
 *   2. Parsed JSON has non-empty title, required_skills, responsibilities
 *   3. tools[] is an array (may be empty)
 *
 * Usage (browser console after importing):
 *   import { runJDGeneratorTests } from './src/agents/jdGeneratorAgent.test';
 *   runJDGeneratorTests();
 *
 * Usage (Vitest / Jest — add to your test suite):
 *   import { runJDGeneratorTests } from './jdGeneratorAgent.test';
 *   describe('Agent 1 – JD Generator', () => { runJDGeneratorTests(); });
 */

import { runJDGeneratorAgent, stripMarkdownFences, validateJDOutput } from './jdGeneratorAgent';
import type { JDOutput } from './jdGeneratorAgent';

// ─── Sample HR Notes ──────────────────────────────────────────────────────────

const SAMPLE_NOTE_1 = `
We need a senior backend engineer for our fintech startup.
The person will own our payment processing microservices built on Node.js and
PostgreSQL. They should be comfortable with AWS (Lambda, RDS, SQS) and have
solid experience with REST and gRPC APIs. Knowledge of PCI-DSS compliance is a
big plus. Looking for someone with at least 5 years of backend experience, ideally
in a regulated industry. They'll work closely with our security team and lead a
small squad of 2–3 juniors.
`;

const SAMPLE_NOTE_2 = `
We're hiring a junior-to-mid UX/product designer to join the mobile app team.
Must know Figma, understand iOS and Android design guidelines, and have experience
doing user research and usability testing. Bonus if they've worked with design
systems before. Will collaborate directly with our React Native developers. No
heavy coding expected but basic HTML/CSS understanding is helpful. 1-3 years
experience is fine.
`;

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
}

function assertNonEmptyArray(arr: unknown, fieldName: string): void {
  assert(Array.isArray(arr), `"${fieldName}" must be an array`);
  assert((arr as unknown[]).length > 0, `"${fieldName}" must not be empty`);
}

function assertNonEmptyString(val: unknown, fieldName: string): void {
  assert(typeof val === 'string', `"${fieldName}" must be a string`);
  assert((val as string).trim().length > 0, `"${fieldName}" must not be blank`);
}

// ─── Unit tests for helpers (no API needed) ───────────────────────────────────

function testStripMarkdownFences(): void {
  const withFence = '```json\n{"key": "value"}\n```';
  const stripped = stripMarkdownFences(withFence);
  assert(stripped === '{"key": "value"}', 'stripMarkdownFences should remove ```json fences');

  const withPlainFence = '```\n{"key": "value"}\n```';
  const stripped2 = stripMarkdownFences(withPlainFence);
  assert(stripped2 === '{"key": "value"}', 'stripMarkdownFences should remove plain ``` fences');

  const noFence = '{"key": "value"}';
  const stripped3 = stripMarkdownFences(noFence);
  assert(stripped3 === '{"key": "value"}', 'stripMarkdownFences should leave plain JSON untouched');

  console.log('✅ stripMarkdownFences — all unit tests passed');
}

function testValidateJDOutput(): void {
  const valid: JDOutput = {
    title: 'Senior Backend Engineer',
    required_skills: ['Node.js', 'PostgreSQL'],
    experience_level: '5+ years',
    responsibilities: ['Own payment microservices', 'Lead junior engineers'],
    tools: ['AWS Lambda', 'SQS'],
  };
  // Should not throw
  validateJDOutput(valid);
  console.log('✅ validateJDOutput — valid object passes');

  // Missing title
  let threw = false;
  try {
    validateJDOutput({ ...valid, title: '' });
  } catch {
    threw = true;
  }
  assert(threw, 'validateJDOutput should throw when title is empty');
  console.log('✅ validateJDOutput — correctly rejects empty title');

  // Empty required_skills
  threw = false;
  try {
    validateJDOutput({ ...valid, required_skills: [] });
  } catch {
    threw = true;
  }
  assert(threw, 'validateJDOutput should throw when required_skills is empty');
  console.log('✅ validateJDOutput — correctly rejects empty required_skills');

  // Empty responsibilities
  threw = false;
  try {
    validateJDOutput({ ...valid, responsibilities: [] });
  } catch {
    threw = true;
  }
  assert(threw, 'validateJDOutput should throw when responsibilities is empty');
  console.log('✅ validateJDOutput — correctly rejects empty responsibilities');
}

// ─── Live integration tests (calls Groq API) ──────────────────────────────────

async function testSampleNote(
  noteNumber: number,
  note: string,
  label: string
): Promise<void> {
  console.log(`\n🧪 Test ${noteNumber}: ${label}`);
  console.log('   Input (first 80 chars):', note.trim().slice(0, 80) + '…');

  const result = await runJDGeneratorAgent(note);

  // Contract check
  assert(typeof result.success === 'boolean', 'result.success must be a boolean');

  if (!result.success) {
    console.error('   Agent returned failure:', result.error);
    console.error('   Raw response:', result.raw_response?.slice(0, 200));
    throw new Error(`Agent 1 failed for test ${noteNumber}: ${result.error}`);
  }

  const { data } = result;

  // Validate individual fields
  assertNonEmptyString(data.title, 'title');
  assertNonEmptyArray(data.required_skills, 'required_skills');
  assertNonEmptyArray(data.responsibilities, 'responsibilities');
  assert(typeof data.experience_level === 'string', '"experience_level" must be a string');
  assert(Array.isArray(data.tools), '"tools" must be an array');

  console.log('   ✅ success:', result.success);
  console.log('   📌 title:', data.title);
  console.log('   🎯 required_skills:', data.required_skills.join(', '));
  console.log('   📅 experience_level:', data.experience_level);
  console.log('   📋 responsibilities count:', data.responsibilities.length);
  console.log('   🛠  tools:', data.tools.join(', ') || '(none specified)');
}

// ─── Test runner ──────────────────────────────────────────────────────────────

export async function runJDGeneratorTests(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  Agent 1 — JD Generator Test Suite');
  console.log('═══════════════════════════════════════════════');

  // --- Unit tests (no API) ---
  console.log('\n── Unit Tests (no API) ──');
  testStripMarkdownFences();
  testValidateJDOutput();

  // --- Integration tests (calls Groq API) ---
  console.log('\n── Integration Tests (Groq API) ──');

  await testSampleNote(1, SAMPLE_NOTE_1, 'Senior Backend Engineer (fintech)');
  await testSampleNote(2, SAMPLE_NOTE_2, 'Junior-Mid UX/Product Designer (mobile)');

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ All Agent 1 tests passed');
  console.log('═══════════════════════════════════════════════\n');
}

// Auto-run when executed directly in Node (ts-node / vitest)
// Comment out if you only want the exported function.
if (typeof window === 'undefined') {
  runJDGeneratorTests().catch((e) => {
    console.error('Test suite failed:', e.message);
    process.exit(1);
  });
}
