const queues = [
  { id: 400, name: "Normal Draft" },
  { id: 420, name: "Ranked Solo/Duo" },
  { id: 430, name: "Normal Blind" },
  { id: 440, name: "Ranked Flex" },
  { id: 450, name: "ARAM" },
  { id: 490, name: "Quickplay" },
] as const;

export function queueName(id: number): string {
  return queues.find((queue) => queue.id === id)?.name ?? `Queue ${id}`;
}

export function QueueSelector({ values, onChange }: { values: number[]; onChange: (values: number[]) => void }) {
  const unknown = values.filter((id) => !queues.some((queue) => queue.id === id));
  const toggle = (id: number) => onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  return (
    <fieldset className="queue-selector field--wide">
      <legend>Queues <small>Leave every queue clear to use this profile as a fallback.</small></legend>
      <div>
        {queues.map((queue) => <label key={queue.id}><input type="checkbox" checked={values.includes(queue.id)} onChange={() => toggle(queue.id)} /><span>{queue.name}</span><small>{queue.id}</small></label>)}
      </div>
      {unknown.length > 0 ? <p>Preserved custom queues: {unknown.map(queueName).join(", ")}</p> : null}
    </fieldset>
  );
}
