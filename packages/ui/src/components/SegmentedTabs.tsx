import { useRef, type KeyboardEvent } from "react";

export interface SegmentedTabOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

export function SegmentedTabs<Value extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: Value;
  options: Array<SegmentedTabOption<Value>>;
  onChange: (value: Value) => void;
  label: string;
  className?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = nextEnabledTabIndex(options, currentIndex, event.key);
    if (nextIndex === currentIndex || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const option = options[nextIndex];
    if (!option) return;
    onChange(option.value);
    buttons.current[nextIndex]?.focus();
  };

  return (
    <div className={`segmented-tabs${className ? ` ${className}` : ""}`} role="radiogroup" aria-label={label} aria-orientation="horizontal">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            role="radio"
            className={selected ? "active" : ""}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function nextEnabledTabIndex(
  options: Array<{ value: unknown; disabled?: boolean }>,
  currentIndex: number,
  key: string,
): number {
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  if (enabled.length === 0) return currentIndex;
  if (key === "Home") return enabled[0] ?? currentIndex;
  if (key === "End") return enabled.at(-1) ?? currentIndex;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return currentIndex;

  const position = Math.max(0, enabled.indexOf(currentIndex));
  const offset = key === "ArrowRight" ? 1 : -1;
  return enabled[(position + offset + enabled.length) % enabled.length] ?? currentIndex;
}
