type SellerDashboardStatProps = {
  label: string;
  value: string;
  hint?: string;
  index?: number;
};

export function SellerDashboardStat({
  label,
  value,
  hint,
  index,
}: SellerDashboardStatProps) {
  const number = index !== undefined ? String(index + 1).padStart(2, "0") : null;
  return (
    <div className="bg-white border border-[color:var(--ink-12)] px-6 py-8 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-caption text-[color:var(--ink-60)]">{label}</span>
        {number && (
          <span className="text-caption text-[color:var(--ink-40)]">
            {number}
          </span>
        )}
      </div>
      <span className="text-h2 tracking-tight leading-none">{value}</span>
      {hint && (
        <span className="text-small text-[color:var(--ink-60)]">{hint}</span>
      )}
    </div>
  );
}
