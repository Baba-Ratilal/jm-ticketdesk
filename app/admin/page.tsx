"use client";

import AppShell from "@/components/AppShell";
import DashboardPanel from "@/components/DashboardPanel";

export default function AdminPage() {
  return (
    <AppShell staffOnly>
      <DashboardPanel />
    </AppShell>
  );
}
