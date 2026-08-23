export interface AppErrorContext {
  source: "react-boundary" | "window";
  componentStack?: string | null;
}

type ErrorReporter = (error: unknown, context: AppErrorContext) => void;

let externalReporter: ErrorReporter | null = null;

/** Punto estable para conectar Sentry/OpenTelemetry sin acoplar la UI. */
export function configureErrorReporter(reporter: ErrorReporter | null) {
  externalReporter = reporter;
}

export function reportUnexpectedError(error: unknown, context: AppErrorContext) {
  console.error("[App] unexpected error", error, context);
  externalReporter?.(error, context);
}
