import type { Metadata } from "next";
import { SavedEventsPage } from "@/components/saved-events-page";

export const metadata: Metadata = {
  title: "Saved events",
  description: "Your saved free Chicago events, stored on this device.",
};

export default function SavedPage() {
  return <SavedEventsPage />;
}
