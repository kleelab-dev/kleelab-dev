'use client';

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_TAB = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** "Tuesday 4 November at 10:30", in the visitor's own time. */
export function callWhen(iso: string): string {
  const parts = LONG.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} at ${get('hour')}:${get('minute')}`;
}

/** The same moment in the team's time, from their fixed offset: "10:30". */
export function teamTime(iso: string, offsetMinutes: number): string {
  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

/** Whether the visitor's clock agrees with the team's right now (so the second time adds nothing). */
export function sameClockAsTeam(offsetMinutes: number): boolean {
  return -new Date().getTimezoneOffset() === offsetMinutes;
}

export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  } catch {
    return 'your time';
  }
}

/**
 * Open times grouped by day in the visitor's own time: pick a day, then a time.
 * `value` is the chosen slot's ISO string.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  timezoneLabel,
  offsetMinutes,
}: {
  slots: string[];
  value: string | null;
  onChange: (slot: string) => void;
  timezoneLabel: string;
  offsetMinutes: number;
}) {
  const days = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const slot of slots) {
      const key = DAY_KEY.format(new Date(slot));
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    }
    return [...grouped.entries()];
  }, [slots]);
  const chosenDay = value ? DAY_KEY.format(new Date(value)) : null;
  const [day, setDay] = useState<string | null>(chosenDay ?? days[0]?.[0] ?? null);
  const showTeam = !sameClockAsTeam(offsetMinutes);

  if (!days.length) {
    return (
      <p className="rounded-xl border-[1.5px] border-dashed border-line p-5 text-sm leading-6 text-muted">
        Every time in the next few weeks is taken. Send us a message instead and we will find one that suits you.
      </p>
    );
  }

  // The day picked may have filled up since.
  const current = days.find(([key]) => key === day) ?? days[0];
  const times = current[1];

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map(([key, daySlots]) => {
          const selected = key === current[0];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setDay(key)}
              className={clsx(
                'shrink-0 rounded-xl border-[1.5px] px-3.5 py-2 text-left text-sm',
                selected ? 'border-ink bg-ink text-paper' : 'border-line bg-white hover:border-ink',
              )}
            >
              <span className="block font-semibold">{DAY_TAB.format(new Date(daySlots[0]))}</span>
              <span className={clsx('block font-mono text-[11px]', selected ? 'text-paper/70' : 'text-muted')}>
                {daySlots.length} free
              </span>
            </button>
          );
        })}
      </div>
      <div role="radiogroup" aria-label="Time" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map((slot) => {
          const selected = slot === value;
          return (
            <button
              key={slot}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(slot)}
              className={clsx(
                'rounded-xl border-[1.5px] px-2 py-2.5 text-center',
                selected ? 'border-ink bg-sun shadow-block-sm' : 'border-line bg-white hover:border-ink',
              )}
            >
              <span className="block font-semibold">{TIME.format(new Date(slot))}</span>
              {showTeam && <span className="block font-mono text-[10px] text-muted">{teamTime(slot, offsetMinutes)} ours</span>}
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[11px] uppercase tracking-label text-muted">
        Times in your time ({visitorZone()}){showTeam ? `. “Ours” is ${timezoneLabel}.` : ''}
      </p>
    </div>
  );
}
