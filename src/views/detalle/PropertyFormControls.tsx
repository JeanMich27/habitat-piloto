interface FieldProps { label: string; value: string; onChange: (value: string) => void; type?: string }

export function Input({ label, value, onChange, type = "text" }: FieldProps) {
  return <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1" /></div>;
}

export function Select({ label, value, opciones, onChange }: FieldProps & { opciones: string[] }) {
  return <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1">{opciones.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
}

export function MiniStat({ label, valor }: { label: string; valor: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="text-lg font-bold text-slate-900">{valor}</p></div>;
}

export function MiniInput({ label, value, onChange, type = "text", className = "" }: FieldProps & { className?: string }) {
  return <div className={className}><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30 focus:bg-white focus:outline-none" /></div>;
}
