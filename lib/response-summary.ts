import type { FormBlock, Answer } from "./form-schema";

export type SummaryQuestion = Pick<FormBlock, "id" | "type" | "label" | "options" | "max">;
export type AnswerCount = { question: SummaryQuestion; answer: Answer | null; count: number };
export type QuestionSummary = { key: string; label: string; type: FormBlock["type"]; responses: number; answered: number; average: number | null; options: { label: string; count: number }[] };

// Counts come from PostgreSQL, grouped by the question as it was submitted.
// Different wording, types, choices or rating scales keep their own summary.
export function summarizeAnswerCounts(rows: AnswerCount[]): QuestionSummary[] {
  const summaries = new Map<string, QuestionSummary>();
  for (const { question, answer, count } of rows) {
    const key = JSON.stringify(question);
    let summary = summaries.get(key);
    if (!summary) {
      summary = { key, label: question.label, type: question.type, responses: 0, answered: 0, average: null, options: (question.type === "rating" ? Array.from({ length: question.max ?? 5 }, (_, index) => String(index + 1)) : question.options ?? []).map(label => ({ label, count: 0 })) };
      summaries.set(key, summary);
    }
    summary.responses += count;
    if (answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0)) continue;
    if (question.type === "rating") summary.average = ((summary.average ?? 0) * summary.answered + Number(answer) * count) / (summary.answered + count);
    summary.answered += count;
    for (const value of Array.isArray(answer) ? answer : [String(answer)]) {
      const option = summary.options.find(item => item.label === value);
      if (option) option.count += count;
    }
  }
  return [...summaries.values()];
}
