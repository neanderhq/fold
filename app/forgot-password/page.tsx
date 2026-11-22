import { PasswordRecovery } from "@/components/forms/password-recovery";
import { recoveryConfiguration } from "@/server/password-recovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password — Fold", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  return <PasswordRecovery enabled={recoveryConfiguration().enabled} />;
}
