import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CONFIG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "config");
export const PROFILE_PATH = resolve(CONFIG_DIR, "profile.md");

const QUESTIONS = [
  "what year are you and what are you studying?",
  "what kinds of roles are you looking for? (internship types, domains, level)",
  "what's your stack? languages, frameworks, tools you're comfortable with",
  "tell me 2–3 things you've built or done worth highlighting",
  "any dealbreakers? (role type, company type, location, visa sponsorship, etc.)",
  "what matters most to you in a role? (remote, company stage, domain, culture, comp)",
];

const SECTIONS = [
  "who i am",
  "target roles",
  "stack",
  "proof points",
  "what i want to avoid",
  "what matters to me",
];

export class Onboarding {
  private step = 0;
  private readonly answers: string[] = [];
  active = true;

  intro(): string {
    return `hey — i don't have your profile yet. let me ask you ${QUESTIONS.length} quick questions so i know what's relevant to you.\n\n**${QUESTIONS[0]}**`;
  }

  next(answer: string): { reply: string; done: boolean } {
    this.answers.push(answer.trim());
    this.step++;

    if (this.step < QUESTIONS.length) {
      return { reply: `**${QUESTIONS[this.step]}**`, done: false };
    }

    this.save();
    this.active = false;
    return {
      reply: "profile saved. i'll use this to score drops and help you triage. DM me any time — try asking about a role you just saw.",
      done: true,
    };
  }

  private save(): void {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const body = SECTIONS.map((s, i) => `## ${s}\n${this.answers[i] ?? ""}`).join("\n\n");
    writeFileSync(PROFILE_PATH, `# candidate profile\n\n${body}\n`, "utf8");
  }
}
