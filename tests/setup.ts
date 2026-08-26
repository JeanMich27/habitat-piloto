// Configuración común de las pruebas.
//
// No usamos el atajo "@testing-library/jest-dom/vitest": en esta combinación
// de versiones (jest-dom 6.9.1 + vitest 4.1.11) ese punto de entrada no
// registra los matchers — su build .mjs le pasa a expect.extend() un objeto
// con forma distinta a la que espera, y falla en silencio (no truena, pero
// tampoco registra nada). Cualquier matcher de jest-dom (toBeInTheDocument,
// toHaveTextContent, etc.) terminaba dando "Invalid Chai property" en las 44
// pruebas de toda la plataforma que los usan, sin relación con ningún
// cambio de producto. Importar los matchers directamente y extender a mano
// evita esa ruta rota y sí registra los matchers correctamente — verificado
// llamando toBeInTheDocument() aquí mismo antes y después del cambio.
import { expect, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

// Sin esto, el DOM de una prueba se queda montado y la siguiente encuentra
// dos veces el mismo botón.
afterEach(cleanup);
