'use client';

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { countries } from '@/content/countries';

export type Phone = { iso: string; number: string };

/** Italy keeps the leading 0 after the country code; everywhere else drops it. */
const KEEPS_ZERO = new Set(['IT']);

/** The number in international form (+2348031234567), or null when left empty. */
export function fullPhone({ iso, number }: Phone): string | null {
  const country = countries.find((c) => c.iso === iso);
  return country && number ? `+${country.dial}${number}` : null;
}

/** Whether a typed number is a plausible length for an international number. */
export function phoneLooksRight(phone: Phone): boolean {
  const full = fullPhone(phone);
  return !full || /^\+[1-9]\d{6,14}$/.test(full);
}

/**
 * A country code picker beside the number. The code shows compactly (+234), the
 * list gives full country names, and the number's first 0 is dropped as typed.
 */
export function PhoneField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Phone;
  onChange: (value: Phone) => void;
}) {
  const country = countries.find((c) => c.iso === value.iso) ?? countries[0];

  function setNumber(raw: string) {
    let digits = raw.replace(/\D/g, '').slice(0, 14);
    if (!KEEPS_ZERO.has(country.iso)) digits = digits.replace(/^0+/, '');
    onChange({ ...value, number: digits });
  }

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex gap-2">
        <div className="relative shrink-0">
          {/* The select is see-through over the short code, so the list still opens natively. */}
          <span aria-hidden className="field pointer-events-none flex w-32 items-center justify-between gap-1 whitespace-nowrap font-mono">
            <span>
              <span className="text-[11px] text-muted">{country.iso}</span> +{country.dial}
            </span>
            <ChevronDownIcon className="h-4 w-4 text-muted" />
          </span>
          <select
            aria-label="Country code"
            value={country.iso}
            onChange={(e) => {
              const iso = e.target.value;
              onChange({ iso, number: KEEPS_ZERO.has(iso) ? value.number : value.number.replace(/^0+/, '') });
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.name} (+{c.dial})
              </option>
            ))}
          </select>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="field min-w-0 flex-1"
          placeholder={country.iso === 'NG' ? '803 123 4567' : 'Number'}
          value={value.number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {KEEPS_ZERO.has(country.iso)
          ? 'The number as you would dial it at home.'
          : country.iso === 'NG'
            ? 'Without the first 0: 803 123 4567, not 0803 123 4567.'
            : 'Without the first 0.'}
      </p>
    </div>
  );
}
