type SafetyCodeCardProps = {
  code: string;
  status?: "확인 완료" | "대기 중";
};

export function SafetyCodeCard({
  code,
  status = "확인 완료",
}: SafetyCodeCardProps) {
  const isPending = status === "대기 중";
  return (
    <section className="bg-white border border-[color:var(--ink-12)] p-8">
      <header className="flex items-baseline justify-between border-b border-black pb-4 mb-6">
        <h3 className="text-title">오늘의 안전 코드</h3>
        <span className="text-caption text-[color:var(--ink-60)]">
          Today / Photo proof
        </span>
      </header>
      <p className="text-body text-[color:var(--ink-80)] max-w-[480px] mb-8">
        아래 코드를 제품 옆에 두고 촬영해주세요. 코드 사진이 등록되면 신선도
        검증이 완료돼요.
      </p>
      <div
        className={`grid grid-cols-[1fr_auto] items-end gap-6 px-6 py-6 ${
          isPending
            ? "border border-dashed border-[color:var(--line-dashed)]"
            : "border border-black"
        }`}
      >
        <div className="flex flex-col gap-2">
          <span className="text-caption text-[color:var(--ink-60)]">CODE</span>
          <span className="text-display tracking-tight leading-none">
            {code}
          </span>
        </div>
        <span className="text-caption text-[color:var(--ink-60)]">
          {status}
        </span>
      </div>
    </section>
  );
}
