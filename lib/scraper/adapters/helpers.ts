import {
  rawEventSchema,
  type RawEvent,
} from "../types";

export function validatedRawEvents(
  candidates: ReadonlyArray<Partial<RawEvent>>,
): RawEvent[] {
  return candidates.flatMap((candidate) => {
    const result = rawEventSchema.safeParse(candidate);
    return result.success ? [result.data] : [];
  });
}

export function deduplicateRawEvents(events: RawEvent[]): RawEvent[] {
  const seen = new Set<string>();

  return events.filter((event) => {
    const key = [
      event.sourceEventId ?? event.originalEventUrl,
      event.title.toLocaleLowerCase("en-US"),
      event.startDateTime,
    ].join("|");

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function inferRegistrationRequired(
  text: string,
  registrationUrl: string | null,
): boolean | null {
  if (
    /\b(?:registration|register|rsvp)\s+(?:is\s+)?required\b/i.test(text)
  ) {
    return true;
  }

  if (
    /\b(?:registration|rsvp)\s+(?:is\s+)?(?:not required|optional)\b/i.test(
      text,
    )
  ) {
    return false;
  }

  return registrationUrl ? true : null;
}

export function inferAttendanceFormat(
  text: string,
): RawEvent["attendanceFormat"] {
  const hasOnline = /\b(?:online|virtual|zoom|livestream)\b/i.test(text);
  const hasInPerson = /\b(?:in person|on-site|onsite)\b/i.test(text);

  if (hasOnline && hasInPerson) {
    return "hybrid";
  }
  if (hasOnline) {
    return "online";
  }
  if (hasInPerson) {
    return "in-person";
  }
  return "unknown";
}
