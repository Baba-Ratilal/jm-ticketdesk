import { redirect } from "next/navigation";

// The dashboard now lives at the top of the ticket queue (Overview).
export default function DashboardPage() {
  redirect("/admin");
}
