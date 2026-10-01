import clsx from 'clsx';
import { Check } from 'lucide-react';
import { SYMPTOMS, type SymptomCode } from '@shared/constants';

/** Síntomas opcionales. "Sin síntomas" es excluyente con el resto. */
export function SymptomPicker({
  value,
  onChange,
  otherText,
  onOtherTextChange,
}: {
  value: SymptomCode[];
  onChange: (value: SymptomCode[]) => void;
  otherText: string;
  onOtherTextChange: (value: string) => void;
}) {
  const toggle = (code: SymptomCode) => {
    if (value.includes(code)) {
      onChange(value.filter((s) => s !== code));
    } else if (code === 'sin_sintomas') {
      onChange(['sin_sintomas']);
    } else {
      onChange([...value.filter((s) => s !== 'sin_sintomas'), code]);
    }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Síntomas">
        {SYMPTOMS.map((symptom) => {
          const selected = value.includes(symptom.id);
          const none = symptom.id === 'sin_sintomas';
          return (
            <button
              key={symptom.id}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(symptom.id)}
              className={clsx(
                'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all active:scale-[0.97]',
                selected
                  ? none
                    ? 'border-transparent bg-ok-soft text-ok'
                    : 'border-transparent bg-ink text-bg'
                  : 'border-line-strong bg-surface text-ink hover:border-ink-3',
              )}
            >
              {selected && <Check size={15} aria-hidden="true" />}
              {symptom.label}
            </button>
          );
        })}
      </div>
      {value.includes('otros') && (
        <input
          className="field mt-3"
          value={otherText}
          onChange={(e) => onOtherTextChange(e.target.value)}
          placeholder="¿Qué otros síntomas?"
          aria-label="Otros síntomas"
          maxLength={300}
          autoFocus
        />
      )}
    </div>
  );
}
