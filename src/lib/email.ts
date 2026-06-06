import { env, requireSecret } from "./env";

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export async function checkEmailHealth() {
  return {
    configured: Boolean(env.resendApiKey && env.emailFrom),
    hasDefaultRecipient: Boolean(env.emailTo),
  };
}

export async function sendEmailMessage(
  subject: string,
  text: string,
  recipient?: string,
) {
  const apiKey = requireSecret(env.resendApiKey, "RESEND_API_KEY");
  const from = requireSecret(env.emailFrom, "EMAIL_FROM");
  const to = recipient || env.emailTo;

  if (!to) {
    throw new Error("Email recipient is missing.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as ResendResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? payload.name ?? "Email send failed.");
  }

  return payload;
}
