import type { LlmClient } from "@jfa/core";
import { ReplyClassificationSchema, type MasterResume, type ReplyClassification } from "@jfa/shared";

export const REPLY_SYSTEM = `You read a recruiter's email reply to a job application and classify it. Return JSON.

Categories:
- resume_request: they ask for a resume or CV (again or in another format).
- portfolio_request: they ask for a portfolio, work samples, reel, GitHub or links.
- interview_scheduling: they want to schedule a call or interview, or propose times.
- salary_question: they ask about expected or current salary or rates.
- assessment: they send a test, take-home task or assignment, or ask to complete one.
- rejection: they decline the application or say the role is filled.
- other: anything else, including auto-replies.
If several apply, pick the one that needs the candidate's attention most (interview_scheduling, assessment and salary_question outrank requests for documents).

summary: one short sentence.
suggested_reply: a short, polite draft in the candidate's voice that the candidate will review before sending. Rules for the draft:
- Never agree to or propose specific interview times or dates. Say the candidate will confirm availability.
- Never state a salary number or range. Say the candidate is happy to discuss compensation.
- Never accept an assessment deadline. Say the candidate will confirm timing.
- Never use em dashes or en dashes. No filler.
- Sign with the candidate's first name.`;

export async function classifyReply(
  llm: LlmClient,
  input: { text: string; subject: string; from: string; jobTitle: string; company: string; master: MasterResume },
): Promise<ReplyClassification> {
  const { data } = await llm.generate({
    purpose: "reply_classify",
    schema: ReplyClassificationSchema,
    system: REPLY_SYSTEM,
    content: [
      {
        type: "text",
        text: `Candidate: ${input.master.contact.name}\nApplied for: ${input.jobTitle} at ${input.company}\n\nFrom: ${input.from}\nSubject: ${input.subject}\n\n${input.text.slice(0, 8000)}`,
      },
    ],
    effort: "low",
    maxTokens: 2000,
  });
  return { ...data, suggested_reply: data.suggested_reply.replace(/[–—]/g, ",") };
}

function firstName(master: MasterResume): string {
  return master.contact.name.split(/\s+/)[0] ?? master.contact.name;
}

/** Fixed, safe auto-reply for resume requests. The tailored PDF is attached. */
export function resumeReply(master: MasterResume): string {
  return `Hi,\n\nThank you for getting back to me. My resume is attached.\n\nBest regards,\n${firstName(master)}`;
}

/** Fixed, safe auto-reply for portfolio requests, listing links from the master resume only. */
export function portfolioReply(master: MasterResume): string | null {
  if (!master.portfolioLinks.length) return null;
  const links = master.portfolioLinks.map((l) => `${l.label || l.kind}: ${l.url}`).join("\n");
  return `Hi,\n\nThank you for your interest. Here is my work:\n\n${links}\n\nMy resume is attached as well.\n\nBest regards,\n${firstName(master)}`;
}
