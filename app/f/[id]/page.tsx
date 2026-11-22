import { PublicForm } from "@/components/forms/public-form";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PublicForm id={(await params).id} />;
}
