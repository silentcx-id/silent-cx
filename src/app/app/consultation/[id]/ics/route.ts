import { getConsultation } from "@/lib/consultation";
import { requireRole } from "@/lib/session";

// Undangan kalender (.ics) untuk sesi terjadwal, supaya client bisa memasukkannya ke Google Calendar atau Outlook.
const stamp = (v: string | Date) => new Date(v).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

export async function GET(_req: Request, { params }: RouteContext<"/app/consultation/[id]/ics">) {
  const { id } = await params;
  const viewer = await requireRole("client", "/app/consultation");
  const c = await getConsultation(id);
  if (!c || c.client_id !== viewer.id || c.status !== "scheduled" || !c.starts_at || !c.ends_at) return new Response("Sesi tidak ditemukan.", { status: 404 });

  const description = [c.topic && `Topik: ${c.topic}`, c.meeting_url ? `Link meeting: ${c.meeting_url}` : "Link meeting dikirim admin SilentCX sebelum sesi."].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SilentCX//Konsultasi//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${c.id}@silentcx`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(c.starts_at)}`,
    `DTEND:${stamp(c.ends_at)}`,
    `SUMMARY:${esc(`Konsultasi SilentCX ${c.code}`)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(c.meeting_url ? [`LOCATION:${esc(c.meeting_url)}`, `URL:${c.meeting_url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="konsultasi-${c.code}.ics"`,
      "cache-control": "no-store",
    },
  });
}
