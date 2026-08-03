import type { Metadata } from "next";
import { EventExplorer } from "@/components/event-explorer";

export const metadata: Metadata = {
  title: "Chicago’s best free events",
  description: "Find Chicago’s best free events, pop-ups, giveaways, and notable appearances—ranked by what is worth attending.",
};

export default function HomePage() {
  return <EventExplorer />;
}
