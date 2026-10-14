import { redirect } from "next/navigation";

// In the full Mana Kosamu app "/" is the main home; this module starts at /jobs.
export default function Home() {
  redirect("/jobs");
}
