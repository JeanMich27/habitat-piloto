import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportUnexpectedError } from "../../lib/errorReporting";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportUnexpectedError(error, { source: "react-boundary", componentStack: info.componentStack });
  }

  private recover = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-600">Error inesperado</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">No pudimos mostrar esta pantalla</h1>
          <p role="alert" className="mt-3 text-sm text-slate-600">
            Tus datos no se borraron. Intenta recuperar la vista o recarga la aplicación.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={this.recover} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
              Reintentar
            </button>
            <button onClick={() => window.location.reload()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Recargar
            </button>
          </div>
        </section>
      </main>
    );
  }
}
