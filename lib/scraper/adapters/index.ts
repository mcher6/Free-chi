import type { EventSourceId } from "../../../config/sources";
import type { EventSourceAdapter } from "../types";
import { chooseChicagoAdapter } from "./choose-chicago";
import { chicagoPublicLibraryAdapter } from "./cpl";
import { dcaseAdapter } from "./dcase";

export {
  ChicagoPublicLibraryAdapter,
  chicagoPublicLibraryAdapter,
} from "./cpl";
export { ChooseChicagoAdapter, chooseChicagoAdapter } from "./choose-chicago";
export { DcaseAdapter, dcaseAdapter } from "./dcase";

export const eventSourceAdapters: ReadonlyMap<
  EventSourceId,
  EventSourceAdapter
> = new Map([
  [dcaseAdapter.id, dcaseAdapter],
  [chicagoPublicLibraryAdapter.id, chicagoPublicLibraryAdapter],
  [chooseChicagoAdapter.id, chooseChicagoAdapter],
]);

export function getEventSourceAdapter(
  sourceId: EventSourceId,
): EventSourceAdapter {
  const adapter = eventSourceAdapters.get(sourceId);
  if (!adapter) {
    throw new TypeError(`No adapter is registered for source: ${sourceId}`);
  }
  return adapter;
}
