import { Card } from "./Card";

type ChatTurn = {
  role: "ai" | "user";
  text: string;
};

type AIChatPanelProps = {
  turns: ChatTurn[];
  hint?: string;
};

export function AIChatPanel({ turns, hint }: AIChatPanelProps) {
  return (
    <Card padding="lg" className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex w-9 h-9 rounded-full bg-[color:var(--color-air)] items-center justify-center text-[color:var(--color-primary)] font-bold">
          AI
        </span>
        <div className="flex flex-col">
          <span className="text-title">CoRent AI</span>
          <span className="text-body-small text-secondary">
            글을 쓰지 않아도 괜찮아요. 대화하면 상품 페이지가 만들어져요.
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <ChatBubble key={i} turn={turn} />
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-[12px] border border-[color:var(--border-subtle)] bg-white px-4 h-[52px]">
        <span className="flex-1 text-body text-tertiary">
          {hint ?? "메시지 입력 (모의 화면)"}
        </span>
        <span className="text-caption text-tertiary">Mock</span>
      </div>
    </Card>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isAI = turn.role === "ai";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[460px] rounded-[16px] px-4 py-3 text-body ${
          isAI
            ? "bg-[color:var(--color-air)] text-[color:var(--color-ink)]"
            : "bg-[color:var(--color-primary)] text-white"
        }`}
      >
        {turn.text}
      </div>
    </div>
  );
}
