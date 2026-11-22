import { Responses } from "@/components/forms/responses";
import { requireFormPage } from "@/server/page-owner";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireFormPage(id);
  return <Responses id={id} />;
}
