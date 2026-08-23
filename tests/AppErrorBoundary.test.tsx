import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "../src/app/providers/AppErrorBoundary";
import { configureErrorReporter } from "../src/lib/errorReporting";

function BrokenView(): never {
  throw new Error("render failed");
}

afterEach(() => {
  configureErrorReporter(null);
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("muestra recuperación y envía el error al punto central", () => {
    const preventJSDOMReport = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", preventJSDOMReport);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reporter = vi.fn();
    configureErrorReporter(reporter);
    render(<AppErrorBoundary><BrokenView /></AppErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Tus datos no se borraron");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(reporter).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ source: "react-boundary" }));
    window.removeEventListener("error", preventJSDOMReport);
  });
});
