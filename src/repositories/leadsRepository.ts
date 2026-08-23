/** API de persistencia del dominio Leads. La implementación legacy se migra incrementalmente desde dataStore. */
export {
  bulkUpsertLeads,
  crearOEnlazarLead,
  upsertLead,
  type CrearLeadInput,
} from "../lib/dataStore";
