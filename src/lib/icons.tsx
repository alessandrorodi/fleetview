import type { CiStatus } from "./derive";

// Inline UI glyphs (generic, not brand marks) + the GitHub mark + a custom
// FleetView logo. currentColor everywhere so CSS controls the color.

export function Logo({ size = 18 }: { size?: number }) {
  // A small git-graph "fleet": a spine with three branch nodes converging.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="2.4" fill="currentColor" />
      <circle cx="18" cy="5" r="2.1" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="12" r="2.1" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="19" r="2.1" fill="currentColor" opacity="0.85" />
      <path
        d="M7 12h4M11 12c3 0 3-7 6-7M11 12h6M11 12c3 0 3 7 6 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GithubMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

export function CiIcon({ status }: { status: CiStatus }) {
  const s = 15;
  if (status === "success")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 8.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "failure")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (status === "pending")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 4.5V8l2.3 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "queued")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="8" r="2.1" fill="currentColor" />
      </svg>
    );
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export function Chevron({ open, size = 12 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.15s ease",
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CollideIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="4" cy="4" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <path d="M5.3 5.3l5.4 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 4.5l1 1M4.5 11l1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
