import { ShieldCheck, Smartphone } from "lucide-react";

interface ConnectionGateProps {
  stage: "unconfigured" | "ready" | "pairing" | "error";
  message: string;
  onPair: () => void;
}

export function ConnectionGate({ stage, message, onPair }: ConnectionGateProps) {
  return (
    <section className="pair-card" aria-labelledby="pair-title">
      <div className="phone-orbit" aria-hidden="true">
        <Smartphone size={34} />
        <ShieldCheck className="orbit-badge" size={22} />
      </div>
      <p className="eyebrow">ONE-TIME PAIRING</p>
      <h2 id="pair-title">{stage === "unconfigured" ? "Pair from desktop" : "Connect this phone"}</h2>
      <p>{message}</p>
      <button type="button" disabled={stage === "unconfigured" || stage === "pairing"} onClick={onPair}>
        {stage === "pairing" ? "Securing channel…" : stage === "error" ? "Try again" : "Pair securely"}
      </button>
    </section>
  );
}
