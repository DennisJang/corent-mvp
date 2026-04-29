type ConversationBlock =
  | { kind: "ai"; index: number; text: string }
  | { kind: "user"; text: string };

type AIChatPanelProps = {
  blocks: ConversationBlock[];
  hint?: string;
};

export function AIChatPanel({ blocks, hint }: AIChatPanelProps) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <span className="text-caption">CoRent AI / 대화 기록</span>
        <span className="text-caption text-[color:var(--ink-60)]">Mock</span>
      </header>
      <ol className="flex flex-col">
        {blocks.map((block, i) => (
          <li
            key={i}
            className="grid grid-cols-[120px_1fr] gap-6 px-6 py-6 border-b border-[color:var(--ink-12)]"
          >
            {block.kind === "ai" ? (
              <>
                <span className="text-caption text-[color:var(--ink-60)]">
                  AI Q.{String(block.index).padStart(2, "0")}
                </span>
                <p className="text-body text-black">{block.text}</p>
              </>
            ) : (
              <>
                <span className="text-caption text-[color:var(--ink-60)]">
                  Seller
                </span>
                <p className="text-body text-[color:var(--ink-80)]">
                  {block.text}
                </p>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-[120px_1fr] gap-6 px-6 py-5">
        <span className="text-caption text-[color:var(--ink-60)]">
          Seller / 입력
        </span>
        <span className="text-body text-[color:var(--ink-40)] border-b border-dashed border-[color:var(--line-dashed)] pb-2">
          {hint ?? "메시지 입력 (모의 화면)"}
        </span>
      </div>
    </section>
  );
}
