export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row${disabled ? " toggle-row--disabled" : ""}`}>
      <span className="toggle-row__copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        className="toggle-row__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-row__control" aria-hidden="true" />
    </label>
  );
}
