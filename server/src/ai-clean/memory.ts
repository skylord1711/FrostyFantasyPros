/**
 * Builds the compact learner briefing that is injected into every tutor prompt.
 *
 * This is the mechanism behind "the tutor remembers you". Nothing is stored in
 * the model: the digest is rebuilt from Postgres on every request, so changing
 * provider, changing model, or wiping any vendor's conversation state changes
 * nothing about what the tutor knows.
 *
 * The digest is deliberately budgeted. Free tiers meter tokens per day, so this
 * targets a few hundred tokens rather than dumping the full history.
 */
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/server/learner";
import { rankMistakes, type MistakePattern } from "@/lib/engine/mistakes";
import { skillBand, proficiencyLabel } from "@/lib/engine/mastery";
import { SKILL_LABELS, type Skill } from "@/lib/types";

const DAY_MS = 86_400_000;

export interface LearnerBriefing {
  /** Plain-text block prepended to the tutor's messages. */
  context: string;
  /** Machine-readable facts the UI can also use. */
  levels: { skill: Skill; cefr: string; score: number; confidence: number }[];
  weakSkills: Skill[];
  dueCount: number;
  mistakeCount: number;
  daysSinceStudy: number;
}

function levelWord(score: number, confidence: number): string {
  const { cefr, label } = proficiencyLabel(score);
  const band = skillBand(score, confidence);
  const spread = band.high - band.low < 0.5 ? "" : ` (±${Math.round((band.high - band.low) / 2)})`;
  return `${cefr} ${label}${spread}`;
}

export async function buildLearnerBriefing(learnerId: string): Promise<LearnerBriefing> {
  const learner = await prisma.learner.findUniqueOrThrow({
    where: { id: learnerId },
    include: { skills: true, mistakes: true },
  });

  const levels = learner.skills.map((s) => ({
    skill: s.skill as Skill,
    cefr: proficiencyLabel(s.score).cefr,
    score: s.score,
    confidence: s.confidence,
  }));

  const ordered = [...levels].sort((a, b) => a.score - b.score);
  const weakSkills = ordered.slice(0, 3).map((l) => l.skill);
  const strongest = ordered[ordered.length - 1];

  const patterns: MistakePattern[] = learner.mistakes.map((row) => ({
    patternKey: row.patternKey,
    errorType: row.errorType as MistakePattern["errorType"],
    original: row.original,
    corrected: row.corrected,
    explanation: row.explanation,
    occurrences: row.occurrences,
    lastAt: row.lastOccurrenceAt,
    firstAt: row.lastOccurrenceAt,
    samples: parseJson<string[]>(row.samples, []),
    topicHints: parseJson<string[]>(row.topicIds, []),
    needsAttention: row.needsReview && row.severity >= 2,
  }));
  const topMistakes = rankMistakes(patterns).slice(0, 5);

  const [dueVocab, dueGrammar] = await Promise.all([
    prisma.vocabEntry.count({
      where: { learnerId, dueAt: { lte: new Date() }, status: { not: "MASTERED" } },
    }),
    prisma.grammarProgress.count({ where: { learnerId, dueAt: { lte: new Date() } } }),
  ]);

  const recentTopics = await prisma.chatTurn.findMany({
    where: { learnerId },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { role: true, content: true },
  });

  const lastStudy = learner.lastStudyAt ?? learner.createdAt;
  const daysSinceStudy = Math.floor((Date.now() - lastStudy.getTime()) / DAY_MS);

  const lines: string[] = ["## This learner right now"];

  if (levels.length) {
    lines.push(
      `Estimated level: ${levels
        .map((l) => `${SKILL_LABELS[l.skill]} ${levelWord(l.score, l.confidence)}`)
        .join(" · ")}`,
    );
    if (strongest) lines.push(`Strongest area: ${SKILL_LABELS[strongest.skill]}.`);
    lines.push(`Weakest areas: ${weakSkills.map((s) => SKILL_LABELS[s]).join(", ")}.`);
    if (learner.placementDoneAt) {
      lines.push("Placement is complete — these levels are measured, treat them as real.");
    }
  } else {
    lines.push("No placement test completed yet — assume a beginner and stay encouraging.");
    lines.push("They may still be on the placement test. Be ready to help with the test itself.");
  }

  if (learner.sessionLengthMin > 0) {
    lines.push(`Daily plans run about ${learner.sessionLengthMin} minutes.`);
  }

  if (topMistakes.length) {
    lines.push("", "Recurring mistakes to keep in mind:");
    for (const { pattern } of topMistakes) {
      const times = pattern.occurrences === 1 ? "once" : `${pattern.occurrences}×`;
      lines.push(
        `- "${pattern.original}" → "${pattern.corrected}" (${times}, ${pattern.errorType.replace(/_/g, " ")})`,
      );
    }
  }

  if (dueVocab + dueGrammar > 0) {
    lines.push("", `${dueVocab + dueGrammar} items are due for review.`);
  }

  if (daysSinceStudy >= 3) {
    lines.push(
      "",
      `They have not studied for ${daysSinceStudy} days. Do not mention the gap as a problem and do not use guilt — just pick up naturally and suggest something small and achievable.`,
    );
  }

  if (recentTopics.length) {
    lines.push("", "Recent conversation:");
    for (const turn of recentTopics.slice().reverse()) {
      const who = turn.role === "user" ? "Learner" : "Tutor";
      const text = turn.content.replace(/\s+/g, " ").slice(0, 160);
      lines.push(`${who}: ${text}`);
    }
  }

  return {
    context: lines.join("\n"),
    levels,
    weakSkills,
    dueCount: dueVocab + dueGrammar,
    mistakeCount: patterns.length,
    daysSinceStudy,
  };
}

/** Headline level used for the tutor's register and language-of-instruction choice. */
export function headlineLevel(briefing: LearnerBriefing): string {
  if (!briefing.levels.length) return "A1";
  const sorted = [...briefing.levels].sort((a, b) => a.score - b.score);
  const middle = sorted[Math.floor(sorted.length / 2)];
  return middle?.cefr ?? "A1";
}
