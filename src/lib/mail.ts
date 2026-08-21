export type MailFetch = typeof fetch;

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const MAGIC_LINK_MAIL_ENV = ["APP_BASE_URL", "BREVO_API_KEY", "MAGIC_LINK_FROM"] as const;

export function missingMagicLinkMailConfiguration() {
  return MAGIC_LINK_MAIL_ENV.filter((name) => !process.env[name]?.trim());
}

export function magicLinkMailConfigured() {
  return missingMagicLinkMailConfiguration().length === 0;
}

export async function sendMagicLinkEmail(email: string, loginUrl: string, fetchImpl: MailFetch = fetch) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.MAGIC_LINK_FROM?.trim();
  if (!apiKey || !from) throw new Error("Magic-link email delivery is not configured");

  const response = await fetchImpl(BREVO_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      sender: { name: "media-list", email: from },
      to: [{ email }],
      subject: "Sign in to media-list",
      textContent: `Open this link to sign in to media-list:\n\n${loginUrl}\n\nThe link expires shortly and can be used once.`,
      htmlContent: `<p>Open this link to sign in to media-list:</p><p><a href="${escapeHtml(loginUrl)}">Sign in to media-list</a></p><p>The link expires shortly and can be used once.</p>`,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`Magic-link email delivery failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
