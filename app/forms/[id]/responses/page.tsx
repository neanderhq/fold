import { validId } from "@/lib/form-schema";
import { Responses } from "@/components/forms/responses";
import { requireFormPage } from "@/server/page-owner";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ response?: string | string[] }> }) {
  const { id } = await params;
  await requireFormPage(id);
  const { response } = await searchParams;
  return <Responses id={id} initialResponseId={validId(response) ? response : undefined} />;
}
