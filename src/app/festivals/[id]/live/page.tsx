import { notFound } from "next/navigation";
import LiveView from "@/components/festflow/LiveView";
import { loadBundle } from "@/lib/festflow/repo";

export const dynamic = "force-dynamic";

export default async function LiveControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await loadBundle(Number(id));
  if (!bundle) notFound();
  return <LiveView festivalId={bundle.festival.id} />;
}
