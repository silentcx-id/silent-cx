import type { IconName } from "@/lib/roles";

// Ikon garis sederhana untuk menu; satu gaya untuk seluruh aplikasi.
const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9",
  wallet: "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 14h2",
  store: "M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  report: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6",
  chat: "M4 5h16v11H9l-5 4z",
  task: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  check: "M4 12l5 5L20 6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5",
  calendar: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
  pen: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2L6 8.5 4 8l-1 3 2 1v0l-2 1 1 3 2-.5L7.5 17 7 19l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3z",
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
