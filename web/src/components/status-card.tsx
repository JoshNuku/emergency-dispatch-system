type StatusCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "signal" | "warning" | "danger";
};

const toneClasses: Record<StatusCardProps["tone"], string> = {
  signal: "bg-signal/10 text-signal border-signal/16",
  warning: "bg-warning/10 text-warning border-warning/16",
  danger: "bg-danger/10 text-danger border-danger/16",
};

export function StatusCard({ label, value, detail, tone }: StatusCardProps) {
  return (
    <article className="panel-strong rounded-xl p-4">
      <span
        className={`inline-flex rounded-md border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${toneClasses[tone]}`}
      >
        {label}
      </span>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1.5 text-[13px] leading-5 text-muted">{detail}</p>
    </article>
  );
}
