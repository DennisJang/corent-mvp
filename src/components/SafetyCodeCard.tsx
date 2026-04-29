import { Card } from "./Card";

type SafetyCodeCardProps = {
  code: string;
  status?: "확인 완료" | "대기 중";
};

export function SafetyCodeCard({
  code,
  status = "확인 완료",
}: SafetyCodeCardProps) {
  return (
    <Card surface="air" padding="lg">
      <div className="flex flex-col gap-3">
        <span className="text-caption uppercase text-[color:var(--color-primary)]">
          오늘의 안전 코드
        </span>
        <h3 className="text-h3">오늘 찍은 사진인지 확인할게요.</h3>
        <p className="text-body text-secondary max-w-[480px]">
          아래 코드를 제품 옆에 두고 촬영해주세요. 코드 사진이 등록되면 신선도
          검증이 완료돼요.
        </p>
        <div className="mt-2 flex items-center justify-between rounded-[12px] border border-[color:var(--border-primary-soft)] bg-white px-6 py-5">
          <div className="flex flex-col">
            <span className="text-caption text-tertiary">CODE</span>
            <span className="text-h2 text-[color:var(--color-primary)] tracking-tight">
              {code}
            </span>
          </div>
          <span className="text-caption text-[color:var(--color-primary)]">
            {status}
          </span>
        </div>
      </div>
    </Card>
  );
}
