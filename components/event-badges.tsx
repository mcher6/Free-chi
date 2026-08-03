import { BadgeCheck, Building2, Gift, Sparkles, TicketCheck } from "lucide-react";
import type { RadarEvent } from "./event-types";

export function EventBadges({ event, compact = false }: { event: RadarEvent; compact?: boolean }) {
  return (
    <div className={`event-badges${compact ? " compact" : ""}`}>
      {event.isFree && <span className="badge badge-free"><TicketCheck size={13} />Free</span>}
      {(event.freebieTypes.length > 0 || event.freebieConfidence >= 0.5) && (
        <span className="badge badge-freebie"><Gift size={13} />{event.freebieTypes[0] || "Free stuff"}</span>
      )}
      {(event.celebrityNames.length > 0 || event.celebrityConfidence >= 0.5) && (
        <span className="badge badge-notable"><Sparkles size={13} />Notable guest</span>
      )}
      {(event.companyNames.length > 0 || event.companyConfidence >= 0.5) && (
        <span className="badge badge-company"><Building2 size={13} />Major company</span>
      )}
      {event.isSeed && <span className="badge badge-demo"><BadgeCheck size={13} />Demo event</span>}
    </div>
  );
}
