import { isAdmin } from "./actions";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await isAdmin();
  return <SettingsForm isAdmin={admin} />;
}
