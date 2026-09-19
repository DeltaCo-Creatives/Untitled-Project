import { useId } from 'react';
import type { PlanFamily } from '../../lib/api';
import type { FamilyChoice } from './planFeatures';

interface FamilyPickerProps {
  families: PlanFamily[];
  value: FamilyChoice;
  onChange: (family: FamilyChoice) => void;
  className?: string;
}

/**
 * A single-choice, accessible segmented control for the three paid plan families. Native radio inputs in a
 * fieldset give arrow-key navigation for free; the pill styling lives on sibling elements around a
 * visually-hidden input so keyboard focus and screen readers still see a real radio group.
 */
export function FamilyPicker({ families, value, onChange, className = '' }: FamilyPickerProps) {
  const name = useId();

  // An old backend has no families at all: hide the picker rather than show an empty control.
  if (families.length === 0) return null;

  return (
    <fieldset className={className}>
      <legend className="mb-3 text-center text-sm font-bold text-ink">What do you want to sort?</legend>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-1.5 rounded-2xl border border-ink-soft/80 bg-white p-1.5 shadow-soft sm:w-fit sm:flex-row">
        {families.map((family) => {
          const checked = family.id === value;
          return (
            <label
              key={family.id}
              className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-xl px-4 py-2.5 text-center transition-colors has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-lavender/60 sm:min-w-[9rem] ${
                checked ? 'bg-lavender text-ink' : 'text-ink-soft hover:bg-lavender-soft/60 hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={family.id}
                checked={checked}
                onChange={() => onChange(family.id)}
                className="sr-only"
              />
              <span className="text-sm font-bold">{family.label}</span>
              <span className="mt-0.5 text-xs leading-snug">{family.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
