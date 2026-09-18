import { MessageCircle } from "lucide-react";
import { waLink, defaultWaMessage } from "@/lib/whatsapp";

type Props = {
  phone: string | null | undefined;
  providerName?: string;
  category?: string;
  problem?: string;
  address?: string;
  when?: string;
  /** Custom message overrides defaults */
  message?: string;
  className?: string;
  /** "chip" (compact) or "btn" (full width primary-style) */
  variant?: "chip" | "btn";
  label?: string;
};

export function WhatsAppButton({
  phone,
  providerName,
  category,
  problem,
  address,
  when,
  message,
  className,
  variant = "chip",
  label = "WhatsApp",
}: Props) {
  const text =
    message ?? defaultWaMessage({ providerName, category, problem, address, when });
  const href = waLink(phone, text);
  if (!href) return null;

  const base =
    variant === "btn"
      ? "inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-[#25D366] px-2 py-2 text-xs font-medium text-white hover:opacity-90"
      : "inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/20";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Message ${providerName ?? "provider"} on WhatsApp`}
      className={(className ? className + " " : "") + base}
    >
      <MessageCircle className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
