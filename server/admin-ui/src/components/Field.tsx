export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange(v: string): void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateInput({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <label className="field">
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
