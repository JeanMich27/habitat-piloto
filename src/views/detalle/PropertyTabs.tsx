export type PropertyTab = "info" | "cronologia" | "leads" | "ofertas" | "documentos" | "comparativo";
const TABS: { key: PropertyTab; label: string }[] = [{ key: "info", label: "Información" }, { key: "cronologia", label: "Cronología" }, { key: "leads", label: "Leads y visitas" }, { key: "ofertas", label: "Ofertas" }, { key: "documentos", label: "Documentos" }, { key: "comparativo", label: "Comparativo" }];
export function PropertyTabs({ active, onChange }: { active: PropertyTab; onChange: (tab: PropertyTab) => void }) {
  return <div className="glass flex gap-1 overflow-x-auto p-1.5">{TABS.map((tab) => <button key={tab.key} onClick={() => onChange(tab.key)} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active === tab.key ? "bg-violet-600 text-white shadow-md shadow-violet-300/60" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"}`}>{tab.label}</button>)}</div>;
}
