import { SAMPLE_RESUME } from "@jfa/core";
import { describe, expect, it } from "vitest";
import { type FormField, pickYearsOption, planAnswers } from "./answers";

let n = 0;
const f = (label: string, extra: Partial<FormField> = {}): FormField => ({ idx: n++, tag: "input", type: "text", name: "", id: "", label, required: false, options: [], ...extra });
const ctx = { master: SAMPLE_RESUME, coverNote: "Hello team." };

describe("planAnswers", () => {
  it("answers standard fields from the profile", () => {
    const plan = planAnswers(
      [f("First Name*", { required: true }), f("Last Name"), f("Email"), f("Phone"), f("GitHub URL"), f("Website"), f("Current company"), f("Resume/CV", { type: "file", required: true }), f("Additional information", { tag: "textarea", type: "textarea" })],
      ctx,
    );
    const byLabel = Object.fromEntries(plan.answers.map((a) => [a.field.label, a.answer]));
    expect(byLabel["First Name*"]).toEqual({ kind: "text", value: "Jane" });
    expect(byLabel["Last Name"]).toEqual({ kind: "text", value: "Doe" });
    expect(byLabel["Email"]).toEqual({ kind: "text", value: "jane@example.com" });
    expect(byLabel["GitHub URL"]).toEqual({ kind: "text", value: "https://github.com/janedoe" });
    expect(byLabel["Website"]).toEqual({ kind: "text", value: "https://janedoe.dev" });
    expect(byLabel["Current company"]).toEqual({ kind: "text", value: "Acme Corp" });
    expect(byLabel["Resume/CV"]).toEqual({ kind: "resume" });
    expect(byLabel["Additional information"]).toEqual({ kind: "text", value: "Hello team." });
    expect(plan.unanswerable).toEqual([]);
  });

  it("never answers salary, visa, demographics or start dates, and flags them when required", () => {
    const plan = planAnswers(
      [
        f("Desired salary", { required: true }),
        f("Do you require visa sponsorship?", { required: true, type: "radio" }),
        f("Gender", { tag: "select", options: ["Male", "Female", "Decline"] }),
        f("Earliest start date", { required: true }),
        f("LinkedIn Profile"),
      ],
      ctx,
    );
    expect(plan.answers).toEqual([]);
    expect(plan.unanswerable.map((x) => x.label)).toEqual(["Desired salary", "Do you require visa sponsorship?", "Earliest start date"]);
  });

  it("leaves optional unknown fields blank and checks required consent boxes", () => {
    const plan = planAnswers([f("Favourite color"), f("I agree to the privacy policy*", { type: "checkbox", required: true })], ctx);
    expect(plan.answers.map((a) => a.answer)).toEqual([{ kind: "check" }]);
    expect(plan.unanswerable).toEqual([]);
  });

  it("maps years of experience to select options", () => {
    expect(pickYearsOption(["0-2 years", "3-5 years", "6+ years"], 5)).toBe("3-5 years");
    expect(pickYearsOption(["Less than 1", "1-3", "3+", "5+"], 7)).toBe("5+");
    expect(pickYearsOption(["Less than 2 years", "2 or more"], 1)).toBe("Less than 2 years");
    const plan = planAnswers([f("How many years of experience do you have?", { tag: "select", options: ["0-2 years", "3-5 years"], required: true })], ctx);
    expect(plan.answers[0].answer).toEqual({ kind: "select", value: "3-5 years" });
  });
});
