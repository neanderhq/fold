import { InputError, parseSchema, type FormBlock, type FormSchema } from "./form-schema";

type Starter = { id: string; title: string; description: string; confirmation?: string; blocks: Omit<FormBlock, "id">[] };
export const formStarters: Starter[] = [
  { id: "feedback", title: "Customer feedback", description: "Find out what worked well and what could be better.", confirmation: "Thanks for sharing your feedback!", blocks: [
    { type: "short_text", label: "Your name", required: true },
    { type: "rating", label: "How was your experience?", required: true, min: 1, max: 5 },
    { type: "multi_choice", label: "What worked well?", required: false, options: ["Clarity", "Speed", "Support"] },
    { type: "long_text", label: "Anything we could improve?", required: false },
  ] },
  { id: "workshop", title: "Workshop registration", description: "Collect registrations and workshop preferences.", confirmation: "You are on the list. See you there!", blocks: [
    { type: "short_text", label: "Your name", required: true },
    { type: "email", label: "Email address", required: true },
    { type: "dropdown", label: "Workshop", required: true, options: ["Design basics", "Prototyping", "User research"] },
    { type: "consent", label: "I agree to be contacted about this workshop", required: true },
  ] },
  { id: "enquiry", title: "Project enquiry", description: "Get the details you need to start a conversation.", blocks: [
    { type: "short_text", label: "What are you working on?", required: true },
    { type: "long_text", label: "Tell us about the project", required: true },
    { type: "email", label: "How can we reach you?", required: true },
  ] },
];

export function starterDraft(id?: string): FormSchema {
  if (id === undefined) return { title: "Untitled form", question: { id: crypto.randomUUID(), type: "short_text", label: "Your question", required: true } };
  const starter = formStarters.find(item => item.id === id);
  if (!starter) throw new InputError("Choose an available starter form.");
  return parseSchema({ title: starter.title, description: starter.description, ...(starter.confirmation ? { confirmation: starter.confirmation } : {}), blocks: starter.blocks.map(block => ({ ...block, id: crypto.randomUUID() })) });
}
