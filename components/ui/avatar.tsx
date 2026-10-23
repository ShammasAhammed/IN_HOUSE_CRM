import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// Token pairs, so avatars follow light and dark mode like everything else.
const tints = [
  "bg-accent text-accent-foreground",
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-danger-soft text-danger",
  "bg-neutral-soft text-foreground-2",
];

/** A person's initials in a soft circle; the tint is stable per name. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const tint = tints[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % tints.length];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-7 text-[11px]",
        size === "lg" && "size-10 text-sm",
        tint,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
