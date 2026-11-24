import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.includes("/lib/") && !specifier.endsWith(".ts")) return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
  return nextResolve(specifier, context);
} });
const { parseSchema, parseAnswers, answerErrors, blocksOf, fieldTypes, appearances } = await import("../lib/form-schema.ts");
const { csvCell, responseCsv } = await import("../lib/response-csv.ts");
const { formStarters, starterDraft } = await import("../lib/form-starters.ts");
const { summarizeAnswerCounts } = await import("../lib/response-summary.ts");
const field = (type, extra = {}) => ({ id: randomUUID(), type, label: `Test ${type}`, required: true, ...extra });
const schema = (block) => ({ title: "Feedback", blocks: [block] });
const cases = {
  short_text: { good: " hello ", expected: "hello", bad: [3, null, [], "x".repeat(2001)] },
  long_text: { good: "x".repeat(10000), expected: "x".repeat(10000), bad: [false, "x".repeat(10001)] },
  email: { good: "test@example.invalid", expected: "test@example.invalid", bad: ["bad", "a@b", "x y@b.com"] },
  number: { good: "2.5", expected: 2.5, bad: ["NaN", "Infinity", "0x10", {}, false, " ", 11, -1], extra: { min: 0, max: 10 } },
  date: { good: "2024-02-29", expected: "2024-02-29", bad: ["2026-02-29", "2026-04-31", "2026-13-01", "yesterday", "2026-1-1"] },
  single_choice: { good: "One", expected: "One", bad: ["Other", ["One"]], extra: { options: ["One", "Two"] } },
  multi_choice: { good: ["One", "Two"], expected: ["One", "Two"], bad: ["One", ["Other"], ["One", "One"]], extra: { options: ["One", "Two"] } },
  dropdown: { good: "Two", expected: "Two", bad: ["Other", true], extra: { options: ["One", "Two"] } },
  rating: { good: 4, expected: 4, bad: [0, 6, 2.5], extra: { min: 1, max: 5 } },
  consent: { good: true, expected: true, bad: [false, "yes", 1] },
};
for (const [type, scenario] of Object.entries(cases)) {
  test(`${type}: valid normalization, invalid types/bounds and required/optional`, () => {
    const block = field(type, scenario.extra);
    const parsed = parseSchema(schema(block));
    assert.deepEqual(parseAnswers({ [block.id]: scenario.good }, parsed)[block.id], scenario.expected);
    for (const value of [...scenario.bad, undefined]) assert.throws(() => parseAnswers(value === undefined ? {} : { [block.id]: value }, parsed), `${type}: ${JSON.stringify(value)}`);
    assert.doesNotThrow(() => parseAnswers({}, parseSchema(schema({ ...block, required: false }))));
    if (type !== "multi_choice") assert.throws(() => parseAnswers({ [block.id]: [] }, parseSchema(schema({ ...block, required: false }))));
    if (type === "consent") assert.throws(() => parseAnswers({ [block.id]: "" }, parseSchema(schema({ ...block, required: false }))));
  });
}
test("legacy JSON, stable IDs and unchanged snapshot support", () => {
  const question = field("short_text");
  const legacy = { title: "Old form", question };
  assert.deepEqual(parseSchema(legacy, question.id), legacy);
  assert.deepEqual(blocksOf(legacy), [question]);
  assert.throws(() => parseSchema({ ...legacy, question: { ...question, id: randomUUID() } }, question.id));
  assert.deepEqual(parseAnswers({ [question.id]: "Original" }, legacy), { [question.id]: "Original" });
});
test("all block types, unique IDs, content-only/configuration rejection", () => {
  const blocks = fieldTypes.map((type) => field(type, { required: !["heading", "description"].includes(type), ...(["single_choice", "multi_choice", "dropdown"].includes(type) ? { options: ["One", "Two"] } : {}) }));
  assert.equal(parseSchema({ title: "All", blocks }).blocks.length, 12);
  const invalid = [[], [field("heading", { required: false })], [blocks[0], blocks[0]], [field("unknown")], [field("dropdown", { options: ["One"] })], [field("dropdown", { options: ["One", "One"] })], [field("rating", { max: 11 })], [field("rating", { max: 2.5 })], [field("number", { min: 5, max: 3 })], [field("short_text", { min: 1 })], [field("short_text", { options: ["One", "Two"] })], Array.from({ length: 51 }, () => field("short_text"))];
  for (const blocks of invalid) assert.throws(() => parseSchema({ title: "Bad", blocks }));
  assert.throws(() => parseAnswers({ [blocks[10].id]: "injected" }, { title: "All", blocks }));
});
test("safe logo configuration and unknown keys", () => {
  const form = schema(field("email"));
  for (const logoUrl of ["javascript:alert(1)", "data:image/svg+xml,anything", "http://example.com/image.png", "https://a:b@example.com/logo", "https://example.com:444/logo"]) assert.throws(() => parseSchema({ ...form, logoUrl }));
  assert.doesNotThrow(() => parseSchema({ ...form, logoUrl: "https://example.com/logo.png", confirmation: "Thanks!" }));
  assert.throws(() => parseSchema({ ...form, ownerId: "injected" }));
});
test("spreadsheet-safe CSV: escaping, all versions of historical labels", () => {
  for (const value of ["=SUM(1,2)", "+1", "-1", "@cmd", " \t=1", "\rtext", "\ntext", "\ttext"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('line 1\n"quoted",line 2'), '"line 1\n""quoted"",line 2"');
  const block = field("short_text", { label: "Old label" });
  const original = { id: randomUUID(), createdAt: new Date().toISOString(), schemaSnapshot: schema(block), answers: { [block.id]: '=SUM(1,2)\n"hello"' } };
  const updated = { ...original, id: randomUUID(), schemaSnapshot: schema({ ...block, label: "New label" }), answers: { [block.id]: "second" } };
  const csv = responseCsv([original, updated]);
  assert.ok(csv.includes("Old label")); assert.ok(csv.includes("New label")); assert.ok(csv.includes("'=SUM(1,2)")); assert.ok(csv.includes('""hello""'));
  assert.equal(original.schemaSnapshot.blocks[0].label, "Old label");
});
test("inline validation reports all invalid fields and agrees with API validation", () => {
  const blocks = [field("short_text"), field("email"), field("number", { min: 1, max: 5 }), field("date"), field("single_choice", { options: ["One", "Two"] }), field("consent"), field("long_text", { required: false })];
  const form = parseSchema({ title: "Validation", blocks });
  const answers = { [blocks[1].id]: "bad@", [blocks[2].id]: 6, [blocks[3].id]: "2026-02-29", [blocks[4].id]: "Other", [blocks[5].id]: false };
  assert.equal(Object.keys(answerErrors(answers, form)).length, 6);
  assert.throws(() => parseAnswers(answers, form));
  const valid = { [blocks[0].id]: "Alex", [blocks[1].id]: "alex@example.invalid", [blocks[2].id]: 5, [blocks[3].id]: "2026-02-28", [blocks[4].id]: "One", [blocks[5].id]: true };
  assert.deepEqual(answerErrors(valid, form), {});
  assert.doesNotThrow(() => parseAnswers(valid, form));
});
test("appearance presets survive schema validation without changing legacy forms", () => {
  const form = schema(field("email"));
  assert.deepEqual(parseSchema(form), form);
  for (const appearance of appearances) assert.equal(parseSchema({ ...form, appearance }).appearance, appearance);
  for (const appearance of [null, {}, "custom", "url(https://example.invalid)"]) assert.throws(() => parseSchema({ ...form, appearance }));
});
test("starter forms produce valid, unpublished content with fresh question IDs", () => {
  assert.equal(starterDraft().question.type, "short_text");
  for (const starter of formStarters) {
    const first = starterDraft(starter.id), second = starterDraft(starter.id);
    assert.deepEqual(parseSchema(first), first);
    assert.equal(first.blocks.length, starter.blocks.length);
    assert.ok(first.blocks.every(block => !second.blocks.some(other => other.id === block.id)));
    first.blocks[0].label = "Edited";
    assert.notEqual(starterDraft(starter.id).blocks[0].label, "Edited");
  }
  assert.throws(() => starterDraft("missing"));
  assert.throws(() => starterDraft(""));
});
test("answer summaries weight counts, include unanswered questions and preserve versions", () => {
  const rating = { id: randomUUID(), label: "Experience", type: "rating", max: 5 };
  const choice = { id: randomUUID(), label: "Worked well", type: "multi_choice", options: ["Clarity", "Support"] };
  const summaries = summarizeAnswerCounts([
    { question: rating, answer: 5, count: 2 }, { question: rating, answer: 2, count: 1 }, { question: rating, answer: "", count: 1 },
    { question: choice, answer: ["Clarity", "Support"], count: 2 }, { question: choice, answer: ["Support"], count: 1 }, { question: choice, answer: [], count: 1 },
    { question: { ...rating, label: "New wording", max: 10 }, answer: 9, count: 1 },
    { question: { ...choice, options: ["Clarity", "Speed"] }, answer: ["Speed"], count: 1 },
  ]);
  assert.equal(summaries.length, 4);
  assert.equal(summaries[0].average, 4); assert.equal(summaries[0].responses, 4); assert.equal(summaries[0].answered, 3);
  assert.deepEqual(summaries[1].options, [{ label: "Clarity", count: 2 }, { label: "Support", count: 3 }]);
  assert.equal(summaries[1].answered, 3); assert.equal(summaries[1].responses, 4);
  assert.equal(summaries[2].average, 9); assert.equal(summaries[3].options[1].count, 1);
});
