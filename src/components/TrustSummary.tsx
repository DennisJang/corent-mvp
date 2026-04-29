type TrustItem = {
  label: string;
  detail: string;
  pending?: boolean;
};

type TrustSummaryProps = {
  items: TrustItem[];
  title?: string;
};

export function TrustSummary({
  items,
  title = "안전 확인 요약",
}: TrustSummaryProps) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)] p-8">
      <header className="flex items-baseline justify-between border-b border-black pb-4 mb-6">
        <h3 className="text-title">{title}</h3>
        <span className="text-caption text-[color:var(--ink-60)]">
          Trust / 04 steps
        </span>
      </header>
      <ol className="flex flex-col">
        {items.map((item, i) => {
          const number = String(i + 1).padStart(2, "0");
          const isLast = i === items.length - 1;
          const lineClass = item.pending
            ? "border-b border-dashed border-[color:var(--line-dashed)]"
            : "border-b border-[color:var(--ink-12)]";
          return (
            <li
              key={item.label}
              className={`grid grid-cols-[48px_1fr] gap-6 py-5 ${
                isLast ? "" : lineClass
              }`}
            >
              <span className="text-caption text-[color:var(--ink-60)] pt-1">
                {number}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium">{item.label}</span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {item.detail}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
