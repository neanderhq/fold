type Message = { from: string; to: string; subject: string; text: string; html?: string };

export function sendResendMessage(apiKey: string, idempotencyKey: string, { to, ...message }: Message, send: typeof fetch = fetch) {
  return send("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ...message, to: [to] }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
}
