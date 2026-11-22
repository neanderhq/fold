import type { Answers, FormSchema } from "./form-schema";

export type SavedForm = {
  id: string;
  draft: FormSchema;
  published: FormSchema | null;
  isPublished: boolean;
  archived: boolean;
  responseCount?: number;
  updatedAt: string;
};

export type SavedResponse = {
  id: string;
  formId: string;
  schemaSnapshot: FormSchema;
  answers: Answers;
  createdAt: string;
};
