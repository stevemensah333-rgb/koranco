import { HarvestWorkspace } from "@/modules/harvest/harvest-workspace";
export default async function HarvestRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <HarvestWorkspace id={(await params).id} />;
}
