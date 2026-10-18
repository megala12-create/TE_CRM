import type { Permission } from "./permissions";
import type { DocType } from "./numbering";
import type { CustomFieldEntity } from "./custom-fields";

/**
 * Quotations and proforma invoices share one engine (table, form, statuses, lines).
 * Everything that differs lives here.
 */
export type QuoteKind = "quotation" | "proforma";

export type QuoteKindConfig = {
  kind: QuoteKind;
  base: string;
  label: string;
  plural: string;
  docTitle: string;
  partyTitle: string;
  numberDoc: DocType;
  entity: CustomFieldEntity;
  module: "quotations" | "proforma_invoices";
  perm: { view: Permission; viewOwn: Permission; create: Permission; edit: Permission; delete: Permission };
  requireCustomer: boolean;
  showBank: boolean;
};

export const QUOTE_KINDS: Record<QuoteKind, QuoteKindConfig> = {
  quotation: {
    kind: "quotation",
    base: "/quotations",
    label: "Quotation",
    plural: "Quotations",
    docTitle: "QUOTATION",
    partyTitle: "Quotation to",
    numberDoc: "quotation",
    entity: "quotations",
    module: "quotations",
    perm: { view: "quotations.view", viewOwn: "quotations.view_own", create: "quotations.create", edit: "quotations.edit", delete: "quotations.delete" },
    requireCustomer: false,
    showBank: false,
  },
  proforma: {
    kind: "proforma",
    base: "/proforma-invoices",
    label: "Proforma invoice",
    plural: "Proforma invoices",
    docTitle: "PROFORMA INVOICE",
    partyTitle: "Bill to",
    numberDoc: "proforma",
    entity: "proforma_invoices",
    module: "proforma_invoices",
    perm: {
      view: "proforma_invoices.view",
      viewOwn: "proforma_invoices.view_own",
      create: "proforma_invoices.create",
      edit: "proforma_invoices.edit",
      delete: "proforma_invoices.delete",
    },
    requireCustomer: true,
    showBank: true,
  },
};
