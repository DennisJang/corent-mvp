import { Card } from "./Card";

type SellerDashboardStatProps = {
  label: string;
  value: string;
  hint?: string;
};

export function SellerDashboardStat({
  label,
  value,
  hint,
}: SellerDashboardStatProps) {
  return (
    <Card padding="md">
      <div className="flex flex-col gap-2">
        <span className="text-caption uppercase text-tertiary">{label}</span>
        <span className="text-h3">{value}</span>
        {hint && <span className="text-body-small text-secondary">{hint}</span>}
      </div>
    </Card>
  );
}
