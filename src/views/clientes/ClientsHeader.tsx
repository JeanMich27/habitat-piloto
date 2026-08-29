import { Plus, Search } from "lucide-react";

interface Props {
  search: string;
  onSearch: (value: string) => void;
  onCreate: () => void;
}

export function ClientsHeader({ search, onSearch, onCreate }: Props) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Clientes</h1>
        <p className="mt-1 text-sm text-slate-500">Empieza por quien necesita tu atención hoy.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm sm:w-80">
          <Search className="size-4 shrink-0 text-slate-400" />
          <span className="sr-only">Buscar clientes</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar por nombre, correo o teléfono" className="w-full bg-transparent py-2.5 text-sm text-slate-900 outline-none" />
        </label>
        <button onClick={onCreate} className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 hover:bg-violet-700">
          <Plus className="size-4" /> Agregar cliente
        </button>
      </div>
    </header>
  );
}
