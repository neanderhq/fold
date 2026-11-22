import { PasswordRecovery } from "@/components/forms/password-recovery";
import { recoveryConfiguration } from "@/server/password-recovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password — Fold", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  return <PasswordRecovery reset enabled={recoveryConfiguration().enabled} />;
}
