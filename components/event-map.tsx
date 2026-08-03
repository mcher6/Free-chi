"use client";

import L, { latLngBounds } from "leaflet";
import Link from "next/link";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import { EventBadges } from "./event-badges";
import type { RadarEvent } from "./event-types";
import { formatDate, formatTime, markerKind } from "./event-utils";

function FitEvents({ events }: { events: RadarEvent[] }) {
  const map = useMap();
  useEffect(() => {
    const points = events
      .filter((event) => event.latitude != null && event.longitude != null)
      .map((event) => [event.latitude as number, event.longitude as number] as [number, number]);
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [34, 34], maxZoom: 14, animate: false });
  }, [events, map]);
  return null;
}

function RadarMarker({ event, selected, onSelect }: { event: RadarEvent; selected: boolean; onSelect?: (id: string) => void }) {
  const marker = markerKind(event);
  const icon = useMemo(
    () => L.divIcon({
      className: "radar-marker-wrap",
      html: `<span class="radar-marker ${marker.className}${selected ? " selected" : ""}" role="img" aria-label="${marker.label}"><b>${marker.icon}</b></span>`,
      iconSize: [40, 46],
      iconAnchor: [20, 43],
      popupAnchor: [0, -38],
    }),
    [marker.className, marker.icon, marker.label, selected],
  );
  return (
    <Marker
      position={[event.latitude as number, event.longitude as number]}
      icon={icon}
      keyboard
      title={`${event.title} — ${marker.label}`}
      eventHandlers={{ click: () => onSelect?.(event.id) }}
    >
      <Popup maxWidth={310} minWidth={250}>
        <div className="map-popup">
          <EventBadges event={event} compact />
          <h3>{event.title}</h3>
          <p><strong>{formatDate(event)}</strong> · {formatTime(event)}</p>
          <p>{event.venueName || "Location to be confirmed"}{event.neighborhood ? ` · ${event.neighborhood}` : ""}</p>
          <div><span><strong>{event.overallScore}</strong>/100 Radar score</span><Link href={`/events/${encodeURIComponent(event.id)}`}>View details →</Link></div>
        </div>
      </Popup>
    </Marker>
  );
}

export function EventMap({ events, selectedId, onSelect, compact = false }: { events: RadarEvent[]; selectedId?: string | null; onSelect?: (id: string) => void; compact?: boolean }) {
  const mapped = events.filter((event) => event.latitude != null && event.longitude != null);
  return (
    <div className={`map-shell${compact ? " compact-map" : ""}`}>
      <MapContainer center={[41.8781, -87.6298]} zoom={12} scrollWheelZoom className="leaflet-map" aria-label={`Chicago map showing ${mapped.length} events`}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitEvents events={mapped} />
        {mapped.map((event) => <RadarMarker key={event.id} event={event} selected={selectedId === event.id} onSelect={onSelect} />)}
      </MapContainer>
      {!compact && (
        <div className="map-legend" aria-label="Map marker legend">
          <span><i className="marker-free">F</i>Free</span>
          <span><i className="marker-freebie">◆</i>Free stuff</span>
          <span><i className="marker-notable">★</i>Notable</span>
          <span><i className="marker-company">C</i>Company</span>
          <span><i className="marker-multi">✦</i>Multiple</span>
        </div>
      )}
      {!mapped.length && <div className="map-empty"><strong>No confirmed map locations</strong><p>Check the location-needs-confirmation list.</p></div>}
    </div>
  );
}
