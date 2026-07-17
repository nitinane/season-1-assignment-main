// Resume parsing: PDF.js for PDFs, mammoth for DOCX
// Falls back to placeholder if libs aren't loaded

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function parsePDF(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textPages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => {
          if ('str' in item) return item.str;
          return '';
        })
        .join(' ');
      textPages.push(pageText);
    }

    return textPages.join('\n\n').trim();
  } catch (err) {
    console.error('PDF parsing error:', err);
    return '';
  }
}

export async function parseDOCX(blob: Blob): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await blob.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  } catch (err) {
    console.error('DOCX parsing error:', err);
    return '';
  }
}

export async function parseResume(blob: Blob, mimeType: string, filename: string): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.pdf') || mimeType.includes('pdf')) {
    return parsePDF(blob);
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || mimeType.includes('word')) {
    return parseDOCX(blob);
  }

  // Try PDF first, then DOCX
  const pdfText = await parsePDF(blob);
  if (pdfText.length > 100) return pdfText;
  return parseDOCX(blob);
}

// ─── Detect duplicate candidates ──────────────────────────────────────────────
export function detectDuplicates(
  candidates: Array<{ id: string; email: string; phone: string; skills: string[]; rawText: string }>
): Map<string, { duplicateOfId: string; reason: string; similarityScore: number }> {
  // Simple Jaccard similarity implementation
  const calculateJaccard = (text1: string, text2: string) => {
    // Tokenize, lowercase, and filter tiny words
    const tokenize = (t: string) => new Set(t.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
    const set1 = tokenize(text1);
    const set2 = tokenize(text2);
    
    if (set1.size === 0 || set2.size === 0) return 0;
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  };

  const duplicates = new Map<string, { duplicateOfId: string; reason: string; similarityScore: number }>();
  const emailMap = new Map<string, string>();
  const phoneMap = new Map<string, string>();
  const rawTextMap = new Map<string, string>();

  for (const candidate of candidates) {
    // Check email duplicate
    if (candidate.email) {
      const normalized = candidate.email.toLowerCase().trim();
      if (emailMap.has(normalized)) {
        duplicates.set(candidate.id, {
          duplicateOfId: emailMap.get(normalized)!,
          reason: 'Same email address detected',
          similarityScore: 1.0,
        });
        continue;
      }
      emailMap.set(normalized, candidate.id);
    }

    // Check phone duplicate
    if (candidate.phone) {
      const normalized = candidate.phone.replace(/\D/g, '');
      if (normalized.length > 6 && phoneMap.has(normalized)) {
        duplicates.set(candidate.id, {
          duplicateOfId: phoneMap.get(normalized)!,
          reason: 'Same phone number detected',
          similarityScore: 1.0,
        });
        continue;
      }
      if (normalized.length > 6) phoneMap.set(normalized, candidate.id);
    }

    // Check Text Similarity (Jaccard > 0.85) against all prior candidates
    for (const [priorId, priorText] of rawTextMap.entries()) {
      if (candidate.rawText && priorText) {
        const score = calculateJaccard(candidate.rawText, priorText);
        if (score >= 0.85) {
          duplicates.set(candidate.id, {
            duplicateOfId: priorId,
            reason: 'High resume text similarity detected',
            similarityScore: Number(score.toFixed(2)),
          });
          break; // Stop checking past candidates if one matches
        }
      }
    }
    rawTextMap.set(candidate.id, candidate.rawText);
  }

  return duplicates;
}
