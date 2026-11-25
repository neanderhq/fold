import { DeliverySettings } from "@/components/forms/delivery-settings";
import { requireFormPage } from "@/server/page-owner";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireFormPage(id);
  return <DeliverySettings id={id} />;
}
