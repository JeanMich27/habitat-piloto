import { createPropertySheetPdf } from "../supabase/functions/_shared/propertySheetPdf.ts";

const output = Deno.args[0] ?? "output/pdf/p42-ficha-comercial-validacion.pdf";
const bytes = await createPropertySheetPdf({
  property: {
    titulo: "Casa en Lomas Verdes, Naucalpan",
    ubicacion: "Lomas Verdes 3a Seccion",
    municipio: "Naucalpan",
    estado: "Estado de Mexico",
    precio: 4_850_000,
    recamaras: 3,
    banos: 2.5,
    medios_banos: 1,
    estacionamientos: 2,
    m2: 210,
    m2_terreno: 260,
    niveles: 2,
    mantenimiento: 1800,
    descripcion: "Casa en condominio horizontal con jardin privado, cocina integral y dos cajones de estacionamiento. Espacios iluminados, distribucion funcional y acceso cercano a servicios de la zona.\n\nLa ficha usa exclusivamente datos ficticios de validacion visual.",
    tipo_inmueble: "Casa",
    tipo_operacion: "Venta",
    imagenes: [],
    amenidades: ["Jardin privado", "Cocina integral", "Seguridad", "Estacionamiento para visitas", "Salon de usos multiples"],
    colonia: "Lomas Verdes",
    eb_public_url: "https://example.invalid/propiedad-demo",
  },
  agency: {
    nombre: "Inmobiliaria Ficticia QA",
    logo_url: null,
    telefono: "+52 55 5000 0000",
    correo: "ventas@example.invalid",
    sitio_web: "https://example.invalid",
  },
  advisor: {
    nombre: "Asesora Ficticia",
    puesto: "Asesora inmobiliaria",
    telefono: "+52 55 5000 0000",
    correo: "asesora@example.invalid",
  },
  options: { includeQr: true, locationMode: "approximate", template: "commercial" },
});
await Deno.mkdir(output.slice(0, output.lastIndexOf("/")), { recursive: true });
await Deno.writeFile(output, bytes);
console.log(JSON.stringify({ output, bytes: bytes.byteLength }));
