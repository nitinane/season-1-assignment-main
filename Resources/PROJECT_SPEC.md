# AI Recruitment Platform — Project Spec

This file is the source of truth for the project. Drop it in the repo root so any
agent (Antigravity, your qwen3-devops agent, etc.) has consistent context across
sessions. Build one agent at a time, in the order below — do not prompt for
everything at once.

---

## 1. Architecture

```
FRONTEND (existing React app)
        |
        v
BACKEND (Supabase functions / Flask — match your existing stack)
        |
        +--> Agent 1: JD Generator
        +--> Agent 2: Social Poster
        +--> Agent 3: Application Ingestor (Drive watcher)
        +--> Agent 4: Resume Scorer
        +--> Agent 5: Shortlist Notifier (email)
        +--> Agent 6: Question Generator
        +--> Agent 7: Interview Scheduler (email + calendar hold)
        +--> Agent 8: Hiring Decision Mailer
        +--> Agent 9: HR Notifier (Telegram)
        |
        v
DB (Supabase/Postgres, RLS per hr_user_id) + Google Drive (resume files) + Gemini + Gmail API
```

Golden rule (same as your existing project): frontend never talks to Gemini,
Drive, or Gmail directly. Everything goes through the backend.

Every agent follows the same contract:

```python
def agent_function(input_data, context_data) -> dict:
    raw = ""
    try:
        prompt = PROMPT_TEMPLATE.format(...)
        # Shared Groq client call using OpenAI-compatible client
        client = get_groq_client()
        response = client.chat.completions.create(
            model=LARGE_MODEL,  # or SMALL_MODEL depending on agent type
            temperature=0.3,    # or specific temperature for agent
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        raw = strip_markdown_fences(response.choices[0].message.content.strip())
        parsed = json.loads(raw)
        validate_required_fields(parsed)
        return {"success": True, "data": parsed}
    except json.JSONDecodeError as e:
        return {"success": False, "error": str(e), "raw_response": raw}
    except Exception as e:
        return {"success": False, "error": str(e)}
```

---

## 2. Agent table

| # | Agent | Input | Output | Temp |
|---|-------|-------|--------|------|
| 1 | JD Generator | HR's rough notes on the role/business need | Structured JD JSON | 0.3 |
| 2 | Social Poster | Structured JD | Post copy + image, drafted (not auto-published in v1) | 0.7 |
| 3 | Application Ingestor | New files in a watched Drive folder | Parsed resume records saved to `applications` | n/a (parsing, not generation) |
| 4 | Resume Scorer | Resume text + JD | Score 0-100 + reasoning + "advantage" notes | 0.1 |
| 5 | Shortlist Notifier | Scored candidate above threshold | Shortlist email sent via Gmail API | 0.6 |
| 6 | Question Generator | JD + candidate profile + score reasoning | 8 categorized questions, shown to HR only | 0.7 |
| 7 | Interview Scheduler | HR-set date/time | Interview invite email + calendar hold | 0.3 (for email copy) |
| 8 | Hiring Decision Mailer | HR's pass/fail input | Offer/rejection email, salary section left as `[[TO BE FILLED BY HR]]` | 0.5 |
| 9 | HR Notifier | Any pipeline event (new application, score ready, interview booked, etc.) | Telegram message to HR | n/a |

---

## 3. Database additions (Postgres/Supabase, all tables scoped by `hr_user_id`)

```
jobs
├── id
├── hr_user_id        ← RLS scope
├── title, description, required_skills[], experience_level, status
└── created_at

applications
├── id
├── hr_user_id
├── job_id
├── drive_file_id      ← link back to source file in Drive
├── candidate_name, candidate_email
├── resume_text        ← extracted
├── score               ← 0-100, nullable until Agent 4 runs
├── score_reasoning
├── status              ← ingested → scored → shortlisted → interview_scheduled → hired/rejected
└── created_at

interviews
├── id
├── application_id
├── scheduled_at
├── questions[]         ← from Agent 6
└── status

notifications_log
├── id
├── hr_user_id
├── event_type
├── message
├── delivered (bool)
└── created_at
```

Same rule as your existing RLS setup: every query filters by `hr_user_id`, no exceptions.

---

## 4. Build order

1. JD Generator
2. Application Ingestor + Resume Scorer
3. Shortlist Notifier + Question Generator (parallel — both consume the scored candidate)
4. Interview Scheduler
5. Hiring Decision Mailer
6. HR Notifier (wire in last, once real events exist to hook into)
7. Social Poster (last — most externally fragile, no API approval needed for draft-only v1)

---

## 5. Prompts — feed these to your devops agent ONE AT A TIME, in order

Each prompt below is self-contained and references this spec file. Paste one,
let it finish and get reviewed/tested, then move to the next.

### Prompt 1 — JD Generator

```
Read PROJECT_SPEC.md in this repo for context on architecture and conventions.

Build Agent 1: JD Generator, following the agent contract in section 1 of
PROJECT_SPEC.md.

- Input: raw HR notes describing a role/business need (free text)
- Output JSON: { "title": str, "required_skills": [str], "experience_level": str,
  "responsibilities": [str], "tools": [str] }
- Temperature: 0.3
- Prompt must show the exact JSON schema inline, instruct "return ONLY JSON, no
  markdown fences"
- Strip markdown fences before json.loads()
- Validate that title, required_skills, and responsibilities are present and non-empty
- Wire it to a backend route that saves the result to the `jobs` table, scoped by
  hr_user_id
- Do not touch any other agent or existing route. Write a quick test that feeds
  in 2 sample role notes and confirms valid JSON comes back both times.
```

### Prompt 2 — Application Ingestor + Resume Scorer

```
Read PROJECT_SPEC.md in this repo for context.

Build Agent 3 (Application Ingestor) and Agent 4 (Resume Scorer) together, since
one feeds the other.

Agent 3 — Application Ingestor:
- Watches/polls a specified Google Drive folder for new resume files
- Extracts text from PDF/Word resumes
- Creates a row in `applications` with hr_user_id, job_id, drive_file_id,
  candidate_name, candidate_email, resume_text, status="ingested"
- This is NOT an LLM agent — pure parsing/extraction logic

Agent 4 — Resume Scorer:
- Input: resume_text from an `applications` row + the linked job's structured
  JD data
- Output JSON: { "match_score": int (0-100), "matched_skills": [str],
  "missing_skills": [str], "reasoning": str, "advantage_notes": str }
- Temperature: 0.1
- Prompt must include an explicit scoring rubric inline (90-100 exceptional,
  70-89 strong, 50-69 partial, below 50 weak) — same technique as section 2 of
  PROJECT_SPEC.md
- On success, update the `applications` row: score, score_reasoning,
  status="scored"
- Follow the same {success, data/error} contract as Agent 1

Do not touch Agents 1, 2, or 5-9. Write a test that runs one dummy resume
through both agents end to end and confirms the applications row updates
correctly.
```

### Prompt 3 — Shortlist Notifier + Question Generator

```
Read PROJECT_SPEC.md in this repo for context.

Build Agent 5 (Shortlist Notifier) and Agent 6 (Question Generator). Both
trigger off the same event: an `applications` row moving to status="scored"
with score above a configurable threshold (default 70).

Agent 5 — Shortlist Notifier:
- Generates a warm, personalized shortlist email (temperature 0.6) — under the
  company's name, NOT mentioning interview questions
- Sends via the existing Gmail API integration
- On success, update application status to "shortlisted"

Agent 6 — Question Generator:
- Input: JD + candidate's matched_skills, missing_skills, and reasoning from
  Agent 4's output (not the raw resume — chain the upstream analysis)
- Output JSON: 8 questions split into technical, behavioral, and gap-focused
  categories
- Temperature 0.7
- Save to the `interviews` table (create the row if it doesn't exist yet), NOT
  emailed to the candidate — shown to HR only in the dashboard

Do not touch Agents 1, 3, 4, or 7-9. Test with one scored dummy candidate above
threshold and confirm both an email fires and questions save to `interviews`.
```

### Prompt 4 — Interview Scheduler

```
Read PROJECT_SPEC.md in this repo for context.

Build Agent 7: Interview Scheduler.

- Input: HR sets a date/time for a given application (via a form/route you add)
- Updates the `interviews` row: scheduled_at, status="scheduled"
- Generates an interview invite email (temperature 0.3) confirming date/time,
  referencing the job title — do NOT include the interview questions in the
  email
- Sends via existing Gmail integration
- Update application status to "interview_scheduled"

Do not touch any other agent. Test by scheduling one dummy interview and
confirming the email content and DB state.
```

### Prompt 5 — Hiring Decision Mailer

```
Read PROJECT_SPEC.md in this repo for context.

Build Agent 8: Hiring Decision Mailer.

- Input: HR submits pass/fail (and free-text notes, optional) for an
  application after conducting the interview manually
- If pass: generate an offer email (temperature 0.5) — IMPORTANT: leave the
  compensation/terms section as the literal placeholder text
  "[[TO BE FILLED BY HR BEFORE SENDING]]" — never let the model generate salary
  or contract terms
- If fail: generate a respectful rejection email
- Both go to a review screen (NOT auto-sent) where HR can edit before sending
- Update application status to "hired" or "rejected"

Do not touch any other agent. Test with one pass and one fail case and confirm
the placeholder text is always present verbatim in offer emails.
```

### Prompt 6 — HR Notifier

```
Read PROJECT_SPEC.md in this repo for context.

Build Agent 9: HR Notifier.

- Set up a Telegram bot (simplest option — no device tokens/FCM needed) that
  DMs the HR user
- Hook it into every existing agent from Prompts 1-5: after each one succeeds
  (JD created, application ingested, score ready, shortlist email sent,
  questions generated, interview scheduled, hiring decision sent), fire a
  short Telegram message describing the event
- Log every notification attempt to `notifications_log` with delivered: true/false
- This should be a single reusable `notify_hr(hr_user_id, event_type, message)`
  function called from the existing agents — not a new agent with its own LLM
  call

Do not modify the core logic of Agents 1-8, only add the notify_hr() call at
their success points. Test by running the Prompt-1 through Prompt-5 flows
again and confirming a Telegram message arrives for each step.
```

### Prompt 7 — Social Poster (last, draft-only)

```
Read PROJECT_SPEC.md in this repo for context.

Build Agent 2: Social Poster — DRAFT ONLY, no auto-publishing in this version
(LinkedIn/Instagram/X require app review for posting on a company's behalf,
which is out of scope for now).

- Input: structured JD from Agent 1
- Output: post copy (temperature 0.7) formatted for LinkedIn, plus a suggested
  image prompt/description
- Save the draft to the `jobs` row (add a `social_draft` column) for HR to
  copy-paste manually, or push it to a "review" screen in the dashboard

Do not touch any other agent.
```
