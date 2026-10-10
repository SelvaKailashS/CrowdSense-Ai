import { notFound } from "next/navigation";
import PlannerView from "@/components/festflow/PlannerView";
import { loadBundle } from "@/lib/festflow/repo";

export const dynamic = "force-dynamic";

export default async function FestivalPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await loadBundle(Number(id));
  if (!bundle) notFound();
  return <PlannerView festivalId={bundle.festival.id} />;
}
