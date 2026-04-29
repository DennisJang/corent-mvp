import { Card } from "./Card";
import { Badge } from "./Badge";

type TrustItem = {
  label: string;
  detail: string;
};

type TrustSummaryProps = {
  items: TrustItem[];
};

export function TrustSummary({ items }: TrustSummaryProps) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-title">안전 확인 요약</h3>
        <Badge>양방향 안전 보증</Badge>
      </div>
      <p className="text-body text-secondary mb-6 max-w-[560px]">
        이 물건은 최근 사진, 구성품, 작동 상태를 확인한 뒤 등록됩니다. 반납이
        확인된 뒤 정산이 진행돼요.
      </p>
      <ul className="flex flex-col">
        {items.map((item, i) => (
          <li
            key={item.label}
            className={`flex items-start justify-between gap-6 py-4 ${
              i !== items.length - 1
                ? "border-b border-[color:var(--border-subtle)]"
                : ""
            }`}
          >
            <span className="text-body font-medium">{item.label}</span>
            <span className="text-body-small text-secondary text-right max-w-[320px]">
              {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
