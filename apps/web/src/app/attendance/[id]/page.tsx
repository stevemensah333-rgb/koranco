import { AttendanceWorkspace } from "@/modules/attendance/attendance-workspace";
export default async function AttendanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AttendanceWorkspace sessionId={id} />;
}
