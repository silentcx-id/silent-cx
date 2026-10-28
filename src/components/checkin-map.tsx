// Titik check-in di peta OpenStreetMap, untuk dicocokkan admin dengan alamat dan link Maps dari client.
export function CheckinMap({ lat, lng, title }: { lat: number; lng: number; title: string }) {
  const bbox = [lng - 0.004, lat - 0.0025, lng + 0.004, lat + 0.0025].map((n) => n.toFixed(6)).join(",");
  return (
    <iframe
      title={title}
      className="h-56 w-full rounded-lg border border-line"
      loading="lazy"
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`}
    />
  );
}
