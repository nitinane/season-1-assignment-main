Work only inside this repo. Do not commit. Do not modify api/voice-stt.ts.

1. src/pages/Apply.tsx: add a language selector (English, Hinglish, Hindi, Telugu) with codes en-IN, hi-en, hi-IN, te-IN, default hi-en. Send it as `language` to /api/apply.
2. api/apply.ts: accept optional `language` (only those four codes, default hi-en) and store it in iv_applications.language.
3. api/interview-turn.ts: read the application's language and include it in both the question-generation and answer-evaluation prompts. Ask the question in that language (native script for Hindi and Telugu; Hinglish means a Hindi-English mix in Roman script). Keep feedback, summaries, strengths and red flags in English for the recruiter. Return {language} in the 'start' response. Never return scores or feedback to the client.
4. api/voice-tts.ts: accept an optional `language` (the four codes). For hi-en keep the existing model/voice defaults. For en-IN, hi-IN and te-IN use model timbre-v3.0 with voice from env GNANI_TTS_VOICE_V3 (default Shivani) and that language code. If the upstream returns 400 or 403 for v3.0, retry once with timbre-v2.5, voice Poorvi and language auto. Keep the 500-character text limit and generic error messages.
5. src/pages/Interview.tsx: pass the application's language to /api/voice-tts. Keep STT language as auto. Keep all Gnani calls strictly sequential.
6. src/pages/VoiceRecruiter.tsx and src/pages/ApplicantDetail.tsx: show the interview language (api/applicants.ts must return it in the list and detail).
7. Add GNANI_TTS_VOICE_V3=Shivani to .env.example.
Run `npx tsc --noEmit` and `npm run build`, then show `git status --short`.