// Live chat Sisca: tipe data dan identitas agen. Aman dipakai di server maupun browser.
// Admin membalas atas nama Sisca; di sisi admin tetap tercatat siapa yang membalas.

export const SISCA = {
  name: "Sisca",
  tagline: "Silent Interactive System for Customers Assistance",
  avatar: "/sisca.jpg",
} as const;

export type ChatMessage = {
  id: number;
  thread_id: string;
  sender_id: string | null;
  from_admin: boolean;
  auto: boolean;
  body: string;
  attachment_path: string | null;
  created_at: string;
};

export type ChatThread = {
  id: string;
  user_id: string;
  status: "open" | "closed";
  last_message: string;
  last_message_at: string;
  user_unread: number;
  admin_unread: number;
  admin_read_at: string | null;
};

export type ChatSettings = { days: number[]; start: string; end: string; away_message: string };

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  days: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "17:00",
  away_message:
    "Terima kasih sudah menghubungi SilentCX. Saat ini di luar jam kerja kami (Senin–Jumat, 09.00–17.00 WIB). Sisca akan membalas pesan Anda di jam kerja berikutnya.",
};

export const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export const CHAT_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const MESSAGE_COLUMNS = "id, thread_id, sender_id, from_admin, auto, body, attachment_path, created_at";
export const THREAD_COLUMNS = "id, user_id, status, last_message, last_message_at, user_unread, admin_unread, admin_read_at";

export function normalizeChatSettings(raw: unknown): ChatSettings {
  const v = (raw ?? {}) as Partial<ChatSettings>;
  const time = (s: unknown, f: string) => (typeof s === "string" && /^\d{2}:\d{2}$/.test(s) ? s : f);
  return {
    days: Array.isArray(v.days) ? v.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : DEFAULT_CHAT_SETTINGS.days,
    start: time(v.start, DEFAULT_CHAT_SETTINGS.start),
    end: time(v.end, DEFAULT_CHAT_SETTINGS.end),
    away_message: typeof v.away_message === "string" && v.away_message.trim() ? v.away_message : DEFAULT_CHAT_SETTINGS.away_message,
  };
}

// "Senin–Jumat, 09.00–17.00 WIB" untuk hari yang berurutan; selain itu nama hari dipisah koma.
export function chatHoursLabel(s: ChatSettings): string {
  const days = [...s.days].sort((a, b) => a - b);
  const consecutive = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = !days.length ? "—" : consecutive ? `${DAY_NAMES[days[0] - 1]}–${DAY_NAMES[days[days.length - 1] - 1]}` : days.map((d) => DAY_NAMES[d - 1]).join(", ");
  return `${dayText}, ${s.start.replace(":", ".")}–${s.end.replace(":", ".")} WIB`;
}
