import { AppShell } from "@/components/AppShell";
import { Workspace } from "@/components/Workspace";

export default async function RolePage({
  params,
}: {
  params: Promise<{ role: string; section?: string[] }>;
}) {
  const { role, section = ["dashboard"] } = await params;
  return (
    <AppShell role={role}>
      <Workspace role={role} section={section} />
    </AppShell>
  );
}
