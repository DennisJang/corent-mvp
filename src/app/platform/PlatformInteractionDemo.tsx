"use client";

import { useState } from "react";

import { getActionDefinition } from "@/lib/cie/actionRegistry";
import { getAnalyticsEventDefinition } from "@/lib/cie/analyticsEvents";
import { getComponentBlockDefinition } from "@/lib/cie/componentBlocks";
import { getGuardrailTrigger } from "@/lib/cie/guardrailPolicy";

import {
  listPlatformDemoPurposes,
  type PlatformDemoPurpose,
  type PlatformDemoPurposeId,
} from "./platformDemoModel";

export function PlatformInteractionDemo() {
  const [selectedId, setSelectedId] = useState<PlatformDemoPurposeId | null>(
    null,
  );
  const purposes = listPlatformDemoPurposes();
  const selected = purposes.find((p) => p.id === selectedId) ?? null;

  return (
    <section className="border-t border-black">
      <div className="container-main py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
            01 — pick a purpose
          </span>
          <h2 className="text-h3 font-bold tracking-tight">
            What are you here for?
          </h2>
          <p className="text-small text-[color:var(--ink-60)] max-w-prose">
            Selecting a purpose only renders the deterministic plan. No data is
            sent, no action is run, no event is emitted.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {purposes.map((p) => {
            const isSelected = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setSelectedId((prev) => (prev === p.id ? null : p.id))
                }
                className={[
                  "text-left p-6 border bg-white focus-ring",
                  isSelected ? "border-black" : "border-[color:var(--ink-20)]",
                ].join(" ")}
                aria-pressed={isSelected}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-title font-bold tracking-tight">
                    {p.label}
                  </span>
                  <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                    {p.intentKind} · {p.intentRiskTier}
                  </span>
                </div>
                <p className="mt-2 text-small text-[color:var(--ink-80)]">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>

        {selected ? (
          <FlowDisplay purpose={selected} />
        ) : (
          <p className="text-small text-[color:var(--ink-60)]">
            No purpose selected.
          </p>
        )}
      </div>
    </section>
  );
}

function FlowDisplay({ purpose }: { purpose: PlatformDemoPurpose }) {
  return (
    <div className="border border-black bg-white">
      <SectionRow
        index="02"
        heading="Component blocks (registered)"
        body="Deterministic sequence the planner would surface for this purpose."
      >
        <ul className="flex flex-col">
          {purpose.componentBlockSequence.map((blockId, i) => {
            const def = getComponentBlockDefinition(blockId);
            return (
              <li
                key={`${blockId}-${i}`}
                className="border-t border-[color:var(--ink-12)] py-4 flex flex-col gap-1 first:border-t-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <code className="text-small font-medium">{blockId}</code>
                  <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                    {def?.kind ?? "unknown"}
                  </span>
                </div>
                <span className="text-small text-[color:var(--ink-80)]">
                  {def?.label ?? "—"}
                </span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {def?.purpose ?? "(unregistered block)"}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionRow>

      <SectionRow
        index="03"
        heading="Proposed actions (registered)"
        body="The platform proposes actions for visitor confirmation only — never autonomously."
      >
        <ul className="flex flex-col">
          {purpose.proposedActionIds.map((actionId, i) => {
            const def = getActionDefinition(actionId);
            return (
              <li
                key={`${actionId}-${i}`}
                className="border-t border-[color:var(--ink-12)] py-4 flex flex-col gap-1 first:border-t-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <code className="text-small font-medium">{actionId}</code>
                  <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                    {def?.riskTier ?? "—"} · {def?.executionMode ?? "—"}
                  </span>
                </div>
                <span className="text-small text-[color:var(--ink-80)]">
                  {def?.label ?? "—"}
                </span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {def?.purpose ?? "(unregistered action)"}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionRow>

      <SectionRow
        index="04"
        heading="Guardrail notes"
        body="Why some paths are allowed, escalated, or refused."
      >
        <ul className="flex flex-col">
          {purpose.guardrailNotes.map((note, i) => {
            const trig = getGuardrailTrigger(note.triggerKind);
            return (
              <li
                key={`${note.triggerKind}-${i}`}
                className="border-t border-[color:var(--ink-12)] py-4 flex flex-col gap-1 first:border-t-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <code className="text-small font-medium">
                    {note.triggerKind}
                  </code>
                  <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                    {note.decision}
                  </span>
                </div>
                <span className="text-small text-[color:var(--ink-80)]">
                  {note.explanation}
                </span>
                {trig?.message ? (
                  <span className="text-small text-[color:var(--ink-60)]">
                    Policy: {trig.message}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionRow>

      <SectionRow
        index="05"
        heading="Analytics events (preview only)"
        body="Names the platform would emit for this flow. Nothing is emitted from this page."
      >
        <ul className="flex flex-col">
          {purpose.analyticsEventSequence.map((eventName, i) => {
            const def = getAnalyticsEventDefinition(eventName);
            return (
              <li
                key={`${eventName}-${i}`}
                className="border-t border-[color:var(--ink-12)] py-4 flex flex-col gap-1 first:border-t-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <code className="text-small font-medium">{eventName}</code>
                  <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
                    {def?.category ?? "—"} · {def?.riskTier ?? "—"}
                  </span>
                </div>
                <span className="text-small text-[color:var(--ink-60)]">
                  {def?.purpose ?? "(unregistered event)"}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionRow>
    </div>
  );
}

function SectionRow({
  index,
  heading,
  body,
  children,
}: {
  index: string;
  heading: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[color:var(--ink-20)] first:border-t-0">
      <div className="grid grid-cols-1 md:grid-cols-[12rem_1fr]">
        <div className="p-6 md:border-r md:border-[color:var(--ink-20)] flex flex-col gap-1">
          <span className="text-caption tracking-widest uppercase text-[color:var(--ink-60)]">
            {index}
          </span>
          <span className="text-title font-bold tracking-tight">{heading}</span>
          <span className="text-small text-[color:var(--ink-60)]">{body}</span>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
