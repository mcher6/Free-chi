import {
  getEventSourceConfig,
  type EventSourceId,
  type SourceConfig,
} from "../../../config/sources";
import {
  normalizeRawEvent,
  validateNormalizedEvent,
} from "../normalize";
import type {
  EventSourceAdapter,
  NormalizedEvent,
  RawEvent,
  ValidationResult,
} from "../types";

export abstract class BaseEventSourceAdapter
  implements EventSourceAdapter
{
  readonly config: SourceConfig;

  protected constructor(readonly id: EventSourceId) {
    this.config = getEventSourceConfig(id);
  }

  get sourceName(): string {
    return this.config.sourceName;
  }

  get sourceBaseUrl(): string {
    return this.config.sourceBaseUrl;
  }

  abstract fetchEvents(
    context: Parameters<EventSourceAdapter["fetchEvents"]>[0],
  ): Promise<RawEvent[]>;

  async normalizeEvent(rawEvent: RawEvent): Promise<NormalizedEvent> {
    return normalizeRawEvent(rawEvent, this.config);
  }

  validateEvent(event: NormalizedEvent): ValidationResult {
    return validateNormalizedEvent(event, this.config);
  }
}
