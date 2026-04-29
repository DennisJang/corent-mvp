import { PageShell } from "@/components/PageShell";
import { SellerDashboard } from "@/components/SellerDashboard";

export default function DashboardPage() {
  return (
    <PageShell width="dashboard">
      <SellerDashboard />
    </PageShell>
  );
}
