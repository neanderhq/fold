type Environment = Record<string, string | undefined>;

export const RESET_CONFIRMATION = "If this email exists in our system, check your email for the reset link";
export const RESET_LIFETIME_SECONDS = 30 * 60;

export function recoveryConfiguration(environment: Environment = process.env) {
  const from = environment.PASSWORD_RESET_FROM?.trim();
  const apiKey = environment.RESEND_API_KEY?.trim();
  const preview = environment.PASSWORD_RESET_DELIVERY_MODE === "preview";
  const recipient = environment.PASSWORD_RESET_PREVIEW_RECIPIENT?.trim().toLowerCase();
  const address = from?.match(/^Fold <([^<>\s]+@[^<>\s]+\.[^<>\s]+)>$/)?.[1];
  const senderReady = preview
    ? Boolean(recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    : environment.PASSWORD_RESET_DELIVERY_MODE === "production"
      && environment.PASSWORD_RESET_SENDER_VERIFIED === "true"
      && Boolean(address && !address.toLowerCase().endsWith("@resend.dev"));
  return {
    enabled: environment.PASSWORD_RESET_ENABLED === "true" && Boolean(apiKey && address && senderReady),
    from: from || "",
    apiKey: apiKey || "",
    previewRecipient: preview ? recipient : undefined,
  };
}

export type ResetDelivery = { email: string; url: string; token: string };

function resetEmail(url: string) {
  const link = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
  const expiry = `This link expires in ${RESET_LIFETIME_SECONDS / 60} minutes and works once.`;
  const ignore = "If you didn’t request this, you can ignore this email. Your password hasn’t changed.";

  return {
    subject: "Reset your Fold password",
    text: `Reset your Fold password\n\nOpen this link to choose a new password:\n${url}\n\n${expiry}\n\n${ignore}`,
    html: `<!doctype html>
<html lang="en">
<head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><title>Reset your Fold password</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#18181b;font-family:Inter,Arial,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff">
  <tr><td align="center" style="padding:32px 20px 48px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
      <tr><td style="padding:0 0 28px;border-bottom:1px solid #d5e0ed">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td aria-hidden="true" style="padding-right:12px">
            <table role="presentation" width="26" cellspacing="0" cellpadding="0" style="border:3px solid #192b40;border-radius:4px"><tr><td height="7"></td><td width="7" style="border-left:2px solid #192b40;border-bottom:2px solid #192b40"></td></tr><tr><td colspan="2" style="padding:5px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td height="5" style="border-top:2px solid #192b40;border-bottom:2px solid #192b40"></td></tr></table></td></tr></table>
          </td>
          <td style="color:#192b40;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-1px">Fold</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:40px 0 28px">
        <h1 style="margin:0 0 20px;font-size:32px;line-height:1.2;letter-spacing:-1px;font-weight:700">Reset your password</h1>
        <p style="margin:0;color:#52525b;font-size:16px;line-height:1.6">Use the button below to choose a new password for your Fold account.</p>
      </td></tr>
      <tr><td bgcolor="#eaf3ff" style="padding:24px;background:#eaf3ff;border-radius:12px">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#192b40" style="background:#192b40;border-radius:8px;text-align:center">
          <a href="${link}" style="display:inline-block;border:1px solid #192b40;border-radius:8px;padding:14px 24px;color:#ffffff;font-size:16px;line-height:1.5;font-weight:700;text-decoration:none">Reset password</a>
        </td></tr></table>
        <p style="margin:16px 0 0;color:#52525b;font-size:14px;line-height:1.6">${expiry}</p>
      </td></tr>
      <tr><td style="padding:28px 0 0">
        <p style="margin:0 0 32px;font-size:14px;line-height:1.6"><a href="${link}" style="color:#2563eb;text-decoration:underline">If the button doesn’t work, open the reset page.</a></p>
        <p style="margin:0;color:#52525b;font-size:14px;line-height:1.6">${ignore}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  };
}

export function createResetSender(environment: Environment = process.env, send: typeof fetch = fetch) {
  return async ({ email, url, token }: ResetDelivery) => {
    const configuration = recoveryConfiguration(environment);
    if (!configuration.enabled || (configuration.previewRecipient && email.toLowerCase() !== configuration.previewRecipient)) {
      throw new Error("Password recovery delivery unavailable");
    }
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${configuration.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `fold-password-reset-${token}`,
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [email],
        ...resetEmail(url),
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Password recovery delivery unavailable");
  };
}
