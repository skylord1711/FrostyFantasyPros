/**
 * Deterministic tutor used when no AI provider is reachable.
 *
 * This exists because the product rule is that the AI is an enhancement, never a
 * dependency: with the network off or every provider rate-limited, the app still
 * has to teach. So rather than apologising, this provider answers from the
 * curated curriculum and the verified conjugator, which covers the questions a
 * learner actually asks most often.
 */
import { findVocab } from "@/content/index";
import {
  conjugate,
  conjugationIsVerified,
  isFunctionWord,
  looksLikeSpanish,
  stripAccents,
  tokenize,
  type TenseKey,
} from "@/lib/spanish";
import { bareInfinitiveIn, detectTense } from "@/lib/engine/mistakes";
import { quickCheckSpanish } from "@/lib/engine/grading";
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "../types";

const CONJUGATE_RE = /\b(conjuga|conjugate|conjugation|tense|pret[eé]rito|imperfecto|indicativo|subjuntivo)\b/i;
const MEANING_RE = /\b(what (does|do|is|are)|meaning|define|significa|qué significa)\b/i;
const TRANSLATE_RE = /\b(how do (you|i) say|translate|how would you say|en español)\b/i;
const GREETING_RE = /^(hola|buenas|buenos d[ií]as|hey|hi|hello|qu[eé] tal|como est[aá]s|ad[ií]os|gracias|muchas gracias)\b/i;

/**
 * A greeting is not a grammar mistake. Replying with a critique to "Hola, ¿qué
 * tal?" would make the offline tutor feel broken, so conversational openers get
 * a conversational reply instead.
 */
function conversationalReply(text: string): string | null {
  if (text.trim().length > 90) return null;
  if (!GREETING_RE.test(text.trim().toLowerCase())) return null;

  return [
    "¡Hola! El tutor con IA no está disponible ahora mismo, así que mis respuestas salen de la lección guardada.",
    "",
    "Prueba preguntarme por una palabra o un verbo:",
    "",
    "- `¿Qué significa aprovechar?`",
    "- `conjugate hablar`",
  ].join("\n");
}

const TENSE_ROWS: { key: TenseKey; label: string }[] = [
  { key: "presente", label: "Presente" },
  { key: "preterite", label: "Pretérito" },
  { key: "imperfecto", label: "Imperfecto" },
  { key: "futuro", label: "Futuro" },
  { key: "condicional", label: "Condicional" },
  { key: "subjPresente", label: "Presente de subjuntivo" },
];

function conjugationHelp(text: string): string | null {
  const match = text.match(/\b([a-záéíóúñ]+(?:ar|er|ir))\b/i);
  if (!match) return null;
  const infinitive = stripAccents(match[1].toLowerCase());
  if (!conjugationIsVerified(infinitive)) return null;

  const lines = [`**${infinitive}**`, ""];
  for (const { key, label } of TENSE_ROWS) {
    const forms = conjugate(infinitive, key);
    if (!forms) continue;
    lines.push(`**${label}** — yo ${forms[0]} · tú ${forms[1]} · él/ella ${forms[2]} · nosotros ${forms[3]} · vosotros ${forms[4]} · ellos ${forms[5]}`);
    lines.push("");
  }

  const participle = conjugate(infinitive, "participio")?.[0];
  if (participle) lines.push(`**Participio** — ${participle} (he participado, ha participado)`);

  return lines.join("\n").trim();
}

function vocabHelp(term: string): string | null {
  const word = findVocab(term);
  if (!word) return null;

  const lines = [`**${word.lemma}** — _${word.pos}${word.gender ? ` (${word.gender})` : ""}_ — ${word.translation}`];
  if (word.examples.length) {
    lines.push("", "In context:");
    for (const ex of word.examples.slice(0, 2)) {
      lines.push(`- ${ex.es}`);
      lines.push(`  _${ex.en}_`);
    }
  }
  if (word.collocations?.length) lines.push("", `Commonly used with: ${word.collocations.join(", ")}.`);
  if (word.synonyms?.length) lines.push(`Similar: ${word.synonyms.join(", ")}.`);
  if (word.frames?.length) lines.push("", `Try the frame: **${word.frames[0]}**`);
  return lines.join("\n");
}

function grammarCritique(text: string): string | null {
  const lines: string[] = [];

  // The canonical beginner error: an infinitive left un-conjugated after a subject.
  const bare = bareInfinitiveIn(text);
  if (bare) {
    lines.push(
      `- **"${bare}" is an infinitive.** After a subject pronoun it has to be conjugated — "yo **aprovecho**", not "yo aprovechar".`,
    );
  }

  // `looksLikeSpanish` only rules English out, so arbitrary lowercase text still
  // passes it. Requiring at least one real Spanish function word keeps the
  // fallback from "diagnosing" gibberish as though it were a learner sentence.
  const tokens = tokenize(text);
  const isSpanish = tokens.length >= 3 && tokens.some((t) => isFunctionWord(t));

  if (isSpanish) {
    const tense = detectTense(text);
    if (tense) lines.push(`- This reads as **${tense}**.`);
  }

  for (const note of quickCheckSpanish(text).notes) {
    lines.push(`- ${note.message}`);
  }

  if (!lines.length) return null;
  return ["Looking at your Spanish:", "", ...lines].join("\n");
}

export function offlineTutorProvider(): AiProvider {
  return {
    id: "offline",
    label: "Offline tutor",
    isConfigured: () => true,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      const started = Date.now();
      const last = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const lower = last.toLowerCase();

      let text: string | null = null;

      text = conversationalReply(last);

      if (!text && CONJUGATE_RE.test(lower)) {
        text = conjugationHelp(last);
      }

      if (!text && (MEANING_RE.test(lower) || TRANSLATE_RE.test(lower))) {
        const quoted = last.match(/[«"']([^»"']+)[»"']/);
        const term = (quoted?.[1] ?? last.split(/\s+/).pop() ?? "").replace(/[^\wáéíóúñÁÉÍÓÚÑ]/g, "");
        text = vocabHelp(term);
      }

      if (!text && looksLikeSpanish(last) && last.trim().length > 3) {
        text = grammarCritique(last);
      }

      if (!text) {
        text = [
          "I'm running on the built-in offline tutor — the AI service isn't reachable right now, so my answers are limited to the packaged curriculum.",
          "",
          "I can still help with:",
          "",
          "- **Meanings** — ask `what does aprovechar mean?`",
          "- **Conjugations** — ask `conjugate hablar`",
          "- **Your own Spanish** — paste a sentence and I'll flag the grammar pattern",
          "",
          "Your progress, mistakes and vocabulary are still being saved — nothing is lost.",
        ].join("\n");
      }

      return {
        text,
        provider: "offline",
        model: "deterministic",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        degraded: true,
      };
    },
  };
}
