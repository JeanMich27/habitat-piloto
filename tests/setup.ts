// Configuración común de las pruebas.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sin esto, el DOM de una prueba se queda montado y la siguiente encuentra
// dos veces el mismo botón.
afterEach(cleanup);
