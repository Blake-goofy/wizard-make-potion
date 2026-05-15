import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

const phoneMaskTemplate = '(   )    -    ';
const phoneDigitSlots = [1, 2, 3, 6, 7, 8, 10, 11, 12, 13] as const;

export function getPhoneDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

export function createPhoneMask(value: string | null | undefined) {
  const digits = getPhoneDigits(value ?? '');
  const maskedValue = phoneMaskTemplate.split('');

  digits.split('').forEach((digit, index) => {
    const slot = phoneDigitSlots[index];
    if (slot !== undefined) maskedValue[slot] = digit;
  });

  return maskedValue.join('');
}

export function getStoredPhoneNumber(value: string) {
  const digits = getPhoneDigits(value);
  if (digits.length !== 10) return '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function getPhoneMaskDisplay(value: string) {
  const maskedValue = createPhoneMask(value);

  return phoneMaskTemplate.split('').map((maskChar, index) => {
    if (phoneDigitSlots.includes(index as (typeof phoneDigitSlots)[number])) {
      const char = maskedValue[index] ?? ' ';
      return {
        char: char === ' ' ? 'X' : char,
        isPlaceholder: char === ' ',
      };
    }

    return {
      char: maskChar,
      isPlaceholder: false,
    };
  });
}

function getDigitSlotFromCaret(caret: number) {
  for (let slotIndex = 0; slotIndex < phoneDigitSlots.length; slotIndex += 1) {
    const slot = phoneDigitSlots[slotIndex];
    if (slot !== undefined && slot >= caret) return slotIndex;
  }

  return phoneDigitSlots.length;
}

function getCaretFromDigitSlot(slotIndex: number) {
  if (slotIndex <= 0) return 0;
  if (slotIndex >= phoneDigitSlots.length) return phoneMaskTemplate.length;

  const slot = phoneDigitSlots[slotIndex];
  return slot ?? phoneMaskTemplate.length;
}

function queueCaret(input: HTMLInputElement, caret: number) {
  requestAnimationFrame(() => {
    input.setSelectionRange(caret, caret);
  });
}

function normalizeCaret(input: HTMLInputElement) {
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? start;

  if (start !== end) return;
  if (start === 0 || start === phoneMaskTemplate.length) return;
  if (phoneDigitSlots.includes(start as (typeof phoneDigitSlots)[number])) return;

  const nextSlot = phoneDigitSlots.find((slot) => slot > start);
  const previousSlot = [...phoneDigitSlots].reverse().find((slot) => slot < start);
  const caret = nextSlot ?? previousSlot ?? 0;

  queueCaret(input, caret);
}

function replaceDigits(value: string, start: number, end: number, digitsToInsert: string) {
  const digits = getPhoneDigits(value).split('');
  const slotStart = getDigitSlotFromCaret(start);
  const slotEnd = getDigitSlotFromCaret(end);
  digits.splice(slotStart, slotEnd - slotStart, ...digitsToInsert.split(''));
  return createPhoneMask(digits.join('').slice(0, 10));
}

type PhoneNumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function PhoneNumberInput({ label, value, onChange }: PhoneNumberInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(createPhoneMask(event.target.value));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;

    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      onChange(replaceDigits(value, start, end, event.key));
      queueCaret(input, getCaretFromDigitSlot(Math.min(getDigitSlotFromCaret(start) + 1, phoneDigitSlots.length)));
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      const slotStart = getDigitSlotFromCaret(start);

      if (start !== end) {
        onChange(replaceDigits(value, start, end, ''));
        queueCaret(input, getCaretFromDigitSlot(slotStart));
        return;
      }

      if (slotStart === 0) {
        queueCaret(input, 0);
        return;
      }

      const previousSlot = slotStart - 1;
        const previousCaret = phoneDigitSlots[previousSlot] ?? 0;
        const nextValue = replaceDigits(value, previousCaret, previousCaret + 1, '');
      onChange(nextValue);
      queueCaret(input, getCaretFromDigitSlot(previousSlot));
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();

      if (start !== end) {
        onChange(replaceDigits(value, start, end, ''));
        queueCaret(input, getCaretFromDigitSlot(getDigitSlotFromCaret(start)));
        return;
      }

      const slotStart = getDigitSlotFromCaret(start);
      const nextValue = replaceDigits(value, start, getCaretFromDigitSlot(slotStart + 1), '');
      onChange(nextValue);
      queueCaret(input, getCaretFromDigitSlot(slotStart));
      return;
    }

    if (event.key === '(') {
      event.preventDefault();
      queueCaret(input, 1);
      return;
    }

    if (event.key === ')') {
      event.preventDefault();
      queueCaret(input, 6);
      return;
    }

    if (event.key === '-') {
      event.preventDefault();
      queueCaret(input, 10);
    }
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    const digits = getPhoneDigits(value);
    queueCaret(event.currentTarget, digits.length ? getCaretFromDigitSlot(digits.length) : 1);
  }

  const displayValue = getPhoneMaskDisplay(value);

  return (
    <label>
      {label}
      <div className="phone-input-shell">
        <div className="phone-input-mask" aria-hidden="true">
          {displayValue.map((part, index) => (
            <span key={`${part.char}-${index}`} className={part.isPlaceholder ? 'phone-input-placeholder' : undefined}>
              {part.char}
            </span>
          ))}
        </div>
        <input
          className="phone-input-control"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          aria-label={label}
          value={value}
          onChange={handleChange}
          onClick={(event) => normalizeCaret(event.currentTarget)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
      </div>
    </label>
  );
}