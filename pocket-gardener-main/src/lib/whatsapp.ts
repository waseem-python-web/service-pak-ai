// Build a wa.me deep link. Normalizes phone number to digits-only.
// If no country code, assumes Pakistan (+92) by stripping a leading 0.
export function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!digits) return null;
  // Pakistan default: local numbers usually start with 0 (e.g. 0300...)
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  // Bare 9-10 digit local number → assume PK
  if (digits.length <= 10 && !digits.startsWith("92")) digits = "92" + digits;
  return digits;
}

export function waLink(phone: string | null | undefined, message?: string): string | null {
  const num = normalizeWaPhone(phone);
  if (!num) return null;
  const base = `https://wa.me/${num}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function defaultWaMessage(opts: {
  providerName?: string;
  category?: string;
  when?: string;
  address?: string;
  problem?: string;
}): string {
  const { providerName, category, when, address, problem } = opts;
  const hasCat = category && category.trim() && category.toLowerCase() !== "service";
  const cleanProblem = problem?.trim();
  // Avoid duplicating the category inside the intent line
  const intentIsCategory =
    cleanProblem && hasCat && cleanProblem.toLowerCase() === category!.toLowerCase();

  const serviceLine = hasCat
    ? `Mujhe *${category}* ki service chahiye.`
    : "Mujhe aap ki service chahiye.";

  const intentLine =
    cleanProblem && !intentIsCategory ? `Tafseel: "${cleanProblem}"` : "";

  const lines = [
    `Assalam-o-alaikum${providerName ? ` ${providerName}` : ""}!`,
    serviceLine,
    intentLine,
    when ? `Time: ${when}` : "",
    address ? `Address: ${address}` : "",
    "ServicePak app se contact kar raha hoon — kya aap available hain?",
  ].filter(Boolean);
  return lines.join("\n");
}
