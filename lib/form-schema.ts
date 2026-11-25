export const fieldTypes = ["short_text", "long_text", "email", "number", "date", "single_choice", "multi_choice", "dropdown", "rating", "consent", "heading", "description"] as const;
export type FieldType = typeof fieldTypes[number];
export type FollowUp = { controllerId: string; equals: string };
export type FormBlock = { id: string; type: FieldType; label: string; required: boolean; description?: string; options?: string[]; min?: number; max?: number; startsPage?: true; followUp?: FollowUp };
export const appearances = ["classic", "paper", "meadow"] as const;
export type FormSchema = { title: string; question?: FormBlock; blocks?: FormBlock[]; description?: string; logoUrl?: string; confirmation?: string; appearance?: typeof appearances[number] };
export type Answer = string | string[] | number | boolean;
export type Answers = Record<string, Answer>;

export class InputError extends Error {}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function blocksOf(schema: FormSchema): FormBlock[] { return schema.blocks ?? (schema.question ? [schema.question] : []); }
export function pagesOf(schema: FormSchema): FormBlock[][] {
  let page: FormBlock[] = [];
  const pages = [page];
  for (const block of blocksOf(schema)) {
    if (block.startsPage && page.length) {
      page = [];
      pages.push(page);
    }
    page.push(block);
  }
  return pages;
}
export function isContent(block: FormBlock) { return block.type === "heading" || block.type === "description"; }
export function isChoice(type: FieldType) { return ["single_choice", "multi_choice", "dropdown"].includes(type); }
export function followUpControllers(blocks: FormBlock[], index: number) {
  if (blocks[index]?.startsPage) return [];
  let start = index;
  while (start > 0) {
    start--;
    if (blocks[start].startsPage) break;
  }
  return blocks.slice(start, index).filter(block =>
    !block.followUp && (block.type === "single_choice" || block.type === "dropdown")
  );
}
export function isBlockVisible(block: FormBlock, answers: Record<string, unknown>) {
  if (!block.followUp) return true;
  const answer = answers[block.followUp.controllerId];
  return typeof answer === "string" && answer.trim() === block.followUp.equals;
}
export function clearHiddenAnswers(answers: Answers, schema: FormSchema): Answers {
  const next = { ...answers };
  for (const block of blocksOf(schema)) {
    if (!isBlockVisible(block, answers)) delete next[block.id];
  }
  return next;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new InputError("Unknown fields are not allowed.");
}
function text(value: unknown, name: string, max: number, required = true) {
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) throw new InputError(`${name} is required (maximum ${max} characters).`);
  return value.trim();
}
export function safeLogo(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.port === "";
  } catch { return false; }
}
export function parseSchema(value: unknown, questionId?: string): FormSchema {
  if (!isRecord(value)) throw new InputError("A form is required.");
  exactKeys(value, ["title", "question", "blocks", "description", "logoUrl", "confirmation", "appearance"]);
  if (value.question && value.blocks) throw new InputError("Supply blocks or a legacy question, not both.");
  const legacy = value.blocks === undefined;
  const source = legacy ? [value.question] : value.blocks;
  if (!Array.isArray(source) || source.length < 1 || source.length > 50) throw new InputError("Use between 1 and 50 blocks.");
  const seen = new Set<string>();
  const blocks = source.map((raw, index): FormBlock => {
    if (!isRecord(raw)) throw new InputError("Invalid question.");
    exactKeys(raw, ["id", "type", "label", "required", "description", "options", "min", "max", "startsPage", "followUp"]);
    if (!validId(raw.id) || seen.has(raw.id) || (legacy && questionId && raw.id !== questionId)) throw new InputError("Use unique, stable question IDs. The question ID cannot change.");
    seen.add(raw.id);
    if (!fieldTypes.includes(raw.type as FieldType) || typeof raw.required !== "boolean") throw new InputError("Choose a field type and a required setting.");
    const block: FormBlock = { id: raw.id, type: raw.type as FieldType, label: text(raw.label, "Question label", 2000), required: raw.required };
    if (raw.startsPage !== undefined) {
      if (raw.startsPage !== true || index === 0) throw new InputError("Start a new page before a block after the first.");
      block.startsPage = true;
    }
    if (raw.followUp !== undefined) {
      if (!isRecord(raw.followUp) || isContent(block) || !validId(raw.followUp.controllerId)) {
        throw new InputError("Use a valid conditional follow-up on a question.");
      }
      exactKeys(raw.followUp, ["controllerId", "equals"]);
      block.followUp = {
        controllerId: raw.followUp.controllerId,
        equals: text(raw.followUp.equals, "Matching answer", 200),
      };
    }
    if (isContent(block) && block.required) throw new InputError("Content blocks cannot require answers.");
    if (raw.description !== undefined) block.description = text(raw.description, "Description", 2000, false);
    if (isChoice(block.type)) {
      if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 50) throw new InputError("Choice questions need 2–50 options.");
      block.options = raw.options.map((option) => text(option, "Option", 200));
      if (new Set(block.options).size !== block.options.length) throw new InputError("Choice options must be unique.");
    } else if (raw.options !== undefined) throw new InputError("Only choice questions accept options.");
    for (const key of ["min", "max"] as const) {
      if (raw[key] === undefined) continue;
      if (!["number", "rating"].includes(block.type) || typeof raw[key] !== "number" || !Number.isFinite(raw[key])) throw new InputError("Invalid numeric bounds.");
      block[key] = raw[key];
    }
    if (block.type === "rating") {
      block.min ??= 1; block.max ??= 5;
      if (!Number.isInteger(block.min) || !Number.isInteger(block.max) || block.min !== 1 || block.max < 2 || block.max > 10) throw new InputError("Ratings run from 1 to a whole number between 2 and 10.");
    }
    if (block.min !== undefined && block.max !== undefined && block.min > block.max) throw new InputError("Minimum cannot exceed maximum.");
    return block;
  });
  for (const [index, block] of blocks.entries()) {
    if (!block.followUp) continue;
    const rule = block.followUp;
    const controller = followUpControllers(blocks, index).find(item => item.id === rule.controllerId);
    if (!controller?.options?.includes(rule.equals)) {
      throw new InputError(`Fix the follow-up on “${block.label}”. Choose an earlier single choice or dropdown on this page and an existing answer.`);
    }
  }
  if (blocks.every(isContent)) throw new InputError("Add at least one question.");
  const result: FormSchema = { title: text(value.title, "Form title", 200), ...(legacy ? { question: blocks[0] } : { blocks }) };
  for (const key of ["description", "logoUrl", "confirmation"] as const) if (value[key] !== undefined) result[key] = text(value[key], key, key === "logoUrl" ? 2048 : 2000, false);
  if (!safeLogo(result.logoUrl ?? "")) throw new InputError("Use an HTTPS logo URL without credentials or a custom port.");
  if (value.appearance !== undefined) {
    if (!appearances.includes(value.appearance as typeof appearances[number])) throw new InputError("Choose an available appearance.");
    result.appearance = value.appearance as typeof appearances[number];
  }
  return result;
}
function parseAnswer(answer: unknown, block: FormBlock): Answer {
    const missing = answer === undefined || (block.type !== "consent" && typeof answer === "string" && !answer.trim()) || (block.type === "multi_choice" && Array.isArray(answer) && answer.length === 0) || (block.type === "consent" && answer === false);
    if (missing) {
      if (block.required) throw new InputError(block.type === "consent" ? "Please confirm to continue." : "Please answer this question.");
      return block.type === "multi_choice" ? [] : block.type === "consent" ? false : "";
    }
    if (block.type === "multi_choice") {
      if (!Array.isArray(answer) || answer.some((item) => typeof item !== "string" || !block.options?.includes(item)) || new Set(answer).size !== answer.length) throw new InputError(`Choose valid options for ${block.label}.`);
      return answer as string[];
    } else if (block.type === "consent") {
      if (typeof answer !== "boolean") throw new InputError("Consent must be true or false.");
      return answer;
    } else if (block.type === "number" || block.type === "rating") {
      if ((typeof answer !== "number" && typeof answer !== "string") || (typeof answer === "string" && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(answer))) throw new InputError(`Enter a valid number for ${block.label}.`);
      const numeric = Number(answer);
      if (!Number.isFinite(numeric) || (block.min !== undefined && numeric < block.min) || (block.max !== undefined && numeric > block.max) || (block.type === "rating" && !Number.isInteger(numeric))) throw new InputError(`Number is outside the allowed range for ${block.label}.`);
      return numeric;
    } else {
      if (typeof answer !== "string" || answer.length > (block.type === "long_text" ? 10000 : 2000)) throw new InputError("Use text within the answer length limit.");
      const cleaned = answer.trim();
      if (isChoice(block.type) && !block.options?.includes(cleaned)) throw new InputError("Choose a valid option.");
      if (block.type === "email" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) || cleaned.length > 254)) throw new InputError("Enter a valid email address.");
      if (block.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || !Number.isFinite(Date.parse(cleaned)) || new Date(cleaned).toISOString().slice(0, 10) !== cleaned)) throw new InputError("Enter a valid calendar date.");
      return cleaned;
    }
}
// The public form and the API use the same per-field validation rules.
export function answerErrors(value: Answers, schema: FormSchema, blocks = blocksOf(schema)): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const block of blocks.filter(block => !isContent(block) && isBlockVisible(block, value))) {
    try { parseAnswer(value[block.id], block); }
    catch (cause) { if (!(cause instanceof InputError)) throw cause; errors[block.id] = cause.message; }
  }
  return errors;
}
export function parseAnswers(value: unknown, schema: FormSchema): Answers {
  if (!isRecord(value)) throw new InputError("Answers must be an object.");
  const fields = blocksOf(schema).filter(block => !isContent(block));
  exactKeys(value, fields.map(block => block.id));
  const entries: [string, Answer][] = [];
  for (const block of fields) {
    if (isBlockVisible(block, value)) entries.push([block.id, parseAnswer(value[block.id], block)]);
    else if (Object.hasOwn(value, block.id)) throw new InputError("Remove answers to hidden questions and try again.");
  }
  return Object.fromEntries(entries);
}
export function answerText(value: Answer | undefined): string { return Array.isArray(value) ? value.join("; ") : value === undefined ? "" : String(value); }
