import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, financialYear, isValidGstin, stateCodeFromGstin } from "./gst";
import { fromPaise, mulPaise, toPaise } from "./money";
import { can, viewScope, ALL_PERMISSIONS } from "./permissions";
import { canEditField, canSeeField, parseCustomFields, slugifyKey, type CustomFieldDef } from "./custom-fields";
import { numberToIndianWords, rupeesInWords } from "./words";
import { resolvePeriod } from "./periods";
import { invoiceState } from "./invoice-status";
import { expenseTaxOptions, expenseTotals, nextOccurrence, parseTaxValue } from "./expense";
import { formatDocNumber, isValidFormat, seriesKey } from "./numbering";
import { csvRecords, parseCsv, parseDateFlexible } from "./csv";
import { BANK_SAMPLE_CSV, matchCategory, parseBankStatement, paymentModeFromNarration, suggestCategory } from "./bank-statement";
import { passwordRule } from "./password";

describe("money", () => {
  it("converts to and from paise without float errors", () => {
    expect(toPaise("1234.5")).toBe(123450);
    expect(toPaise("0.1")).toBe(10);
    expect(toPaise("1,00,000.25")).toBe(10000025);
    expect(toPaise("-12.34")).toBe(-1234);
    expect(toPaise("1.005")).toBe(101);
    expect(fromPaise(123450)).toBe("1234.50");
    expect(fromPaise(-5)).toBe("-0.05");
  });
  it("multiplies with half-up rounding", () => {
    expect(mulPaise(1000, 0.09)).toBe(90);
    expect(mulPaise(650, "3")).toBe(1950);
    expect(mulPaise(333, 0.025)).toBe(8);
  });
  it("rejects garbage", () => {
    expect(() => toPaise("12a")).toThrow();
  });
});

describe("GST", () => {
  it("validates GSTIN checksum", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(isValidGstin("33ABC")).toBe(false);
    expect(stateCodeFromGstin("33AAPFU0939F1ZV")).toBe("33");
  });

  it("splits CGST/SGST for intra-state supply", () => {
    const t = computeInvoiceTotals([{ qty: 100, rate: "10.00", taxRate: 18 }], { interstate: false });
    expect(t.subtotal).toBe(100000);
    expect(t.cgst).toBe(9000);
    expect(t.sgst).toBe(9000);
    expect(t.igst).toBe(0);
    expect(t.total).toBe(118000);
  });

  it("uses IGST for inter-state supply", () => {
    const t = computeInvoiceTotals([{ qty: 3, rate: "99.99", taxRate: 5 }], { interstate: true });
    expect(t.igst).toBe(1500); // 299.97 × 5% = 14.9985 → 15.00
    expect(t.cgst + t.sgst).toBe(0);
  });

  it("allocates discount across lines and rounds total to the rupee", () => {
    const t = computeInvoiceTotals(
      [
        { qty: 1, rate: "100", taxRate: 18 },
        { qty: 1, rate: "300", taxRate: 5 },
      ],
      { interstate: false, discount: "40" },
    );
    expect(t.lines.map((l) => l.taxablePaise)).toEqual([9000, 27000]);
    expect(t.lines.reduce((a, l) => a + l.taxablePaise, 0)).toBe(t.subtotal - t.discount);
    expect(t.total % 100).toBe(0);
    expect(t.total - t.roundOff).toBe(t.subtotal - t.discount + t.cgst + t.sgst);
  });

  it("works out the Indian financial year", () => {
    expect(financialYear("2026-03-31")).toBe("2025-26");
    expect(financialYear("2026-04-01")).toBe("2026-27");
  });
});

describe("permissions", () => {
  const sales = { isAdmin: false, permissions: ["customers.view_own", "invoices.create"] };
  it("admins can do everything", () => {
    expect(can({ isAdmin: true, permissions: [] }, "roles.manage")).toBe(true);
  });
  it("roles grant only listed permissions", () => {
    expect(can(sales, "invoices.create")).toBe(true);
    expect(can(sales, "invoices.delete")).toBe(false);
    expect(viewScope(sales, "customers")).toBe("own");
    expect(viewScope(sales, "invoices")).toBe("none");
  });
  it("catalogue has unique keys", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});

describe("custom fields", () => {
  const base: Omit<CustomFieldDef, "id" | "key" | "label" | "type"> = {
    entity: "customers", options: [], required: false, showInList: false, helpText: null, defaultValue: null,
    sortOrder: 0, active: true, visibleRoleIds: null, editableRoleIds: null,
  };
  const defs: CustomFieldDef[] = [
    { ...base, id: 1, key: "brand", label: "Brand", type: "text", required: true },
    { ...base, id: 2, key: "process", label: "Process", type: "select", options: ["DTF", "Embossing"] },
    { ...base, id: 3, key: "cost", label: "Cost", type: "currency", visibleRoleIds: [7] },
    { ...base, id: 4, key: "tags", label: "Tags", type: "multiselect", options: ["A", "B"] },
    { ...base, id: 5, key: "vip", label: "VIP", type: "checkbox" },
  ];
  const viewer = { isAdmin: false, roleId: 2 };

  it("slugifies labels into keys", () => {
    expect(slugifyKey("Brand Name (Main)")).toBe("brand_name_main");
  });

  it("enforces role visibility and keeps hidden values untouched", () => {
    expect(canSeeField(defs[2]!, viewer)).toBe(false);
    expect(canEditField(defs[2]!, { isAdmin: true, roleId: null })).toBe(true);
    const form = new FormData();
    form.set("cf__brand", "Nike");
    form.set("cf__process", "DTF");
    form.set("cf__cost", "999"); // must be ignored: field hidden from this role
    form.append("cf__tags", "A");
    form.set("cf__vip", "on");
    const r = parseCustomFields(defs, form, viewer, { cost: "10.00" });
    expect(r).toEqual({ ok: true, value: { brand: "Nike", process: "DTF", cost: "10.00", tags: ["A"], vip: true } });
  });

  it("reports validation errors", () => {
    const form = new FormData();
    form.set("cf__process", "Laser");
    const r = parseCustomFields(defs, form, viewer);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors["cf__brand"]).toMatch(/required/);
      expect(r.errors["cf__process"]).toBeDefined();
    }
  });
});

describe("expenses", () => {
  it("adds Tax 1 + Tax 2 on top of the amount", () => {
    expect(expenseTotals("1000", [9, 9])).toEqual({ amountPaise: 100000, taxPaise: 18000, totalPaise: 118000 });
    expect(expenseTotals("99.99", [18, 0]).totalPaise).toBe(11799);
  });
  it("offers GST, IGST and CGST/SGST halves", () => {
    const opts = expenseTaxOptions([0, 18]);
    expect(opts.map((o) => o.label)).toEqual(["GST 18%", "IGST 18%", "CGST 9%", "SGST 9%"]);
    expect(parseTaxValue("CGST@2.5")).toEqual({ name: "CGST", rate: 2.5 });
    expect(parseTaxValue("VAT@5")).toBeNull();
  });
  it("computes the next repeat date", () => {
    expect(nextOccurrence("2026-01-31", "1:month")).toBe("2026-02-28");
    expect(nextOccurrence("2028-01-31", "1:month")).toBe("2028-02-29");
    expect(nextOccurrence("2026-12-15", "1:month")).toBe("2027-01-15");
    expect(nextOccurrence("2026-10-12", "2:week")).toBe("2026-10-26");
    expect(nextOccurrence("2026-10-12", "6:month")).toBe("2027-04-12");
    expect(nextOccurrence("2024-02-29", "1:year")).toBe("2025-02-28");
    expect(() => nextOccurrence("2026-10-12", "1:day")).toThrow();
  });
});

describe("document numbering", () => {
  it("formats numbers like the previous CRM", () => {
    expect(formatDocNumber("TE-{FYS}-SI-{SEQ:6}", "2026-04-09", 178)).toBe("TE-26-27-SI-000178");
    expect(formatDocNumber("TE-{FYS}-SI-{SEQ:6}", "2026-03-28", 173)).toBe("TE-25-26-SI-000173");
    expect(formatDocNumber("QUOTATION-{SEQ:6}", "2026-10-10", 261)).toBe("QUOTATION-000261");
    expect(formatDocNumber("CN-{SEQ:6}", "2026-09-24", 9)).toBe("CN-000009");
    expect(formatDocNumber("INV/{FY}/{SEQ}", "2026-10-10", 7)).toBe("INV/2026-27/0007");
  });
  it("restarts yearly only when the format has a financial-year token", () => {
    expect(seriesKey("invoice", "TE-{FYS}-SI-{SEQ:6}", "2026-10-10")).toBe("invoice:2026-27");
    expect(seriesKey("quotation", "QUOTATION-{SEQ:6}", "2026-10-10")).toBe("quotation");
  });
  it("validates formats", () => {
    expect(isValidFormat("CN-{SEQ:6}")).toBe(true);
    expect(isValidFormat("CN-")).toBe(false);
    expect(isValidFormat("CN <script>{SEQ}")).toBe(false);
  });
});

describe("csv", () => {
  it("parses quotes, embedded commas, newlines and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",3\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "3"]]);
  });
  it("maps headers to keys and skips blank lines", () => {
    const { headers, records } = csvRecords("Date,Payment Mode\n12-08-2026,UPI\n\n");
    expect(headers).toEqual(["date", "payment_mode"]);
    expect(records).toEqual([{ date: "12-08-2026", payment_mode: "UPI" }]);
  });
  it("parses Indian and ISO dates, rejecting impossible ones", () => {
    expect(parseDateFlexible("2026-08-16")).toBe("2026-08-16");
    expect(parseDateFlexible("16/08/2026")).toBe("2026-08-16");
    expect(parseDateFlexible("31-02-2026")).toBeNull();
  });
});

describe("expense import template", () => {
  const cats = [
    { id: 1, name: "Salary" }, { id: 2, name: "Petrol" }, { id: 3, name: "Rent" }, { id: 4, name: "Raw Materials" }, { id: 5, name: "Electricity" },
  ];
  it("reads Sl. No. | Value Date | Description | Chq /Ref No. | Amount | Category", () => {
    const r = parseBankStatement(BANK_SAMPLE_CSV);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.category)).toEqual(["Salary", "Raw Materials", "Petrol", "Rent"]);
    expect(r.rows[0]!.description).toBe("UPI/622812345678/SARAVANA/SALARY");
    expect(r.rows.map((x) => [x.slNo, x.date, x.amount, x.reference])).toEqual([
      ["1", "2026-08-16", "2250.00", "622812345678"],
      ["2", "2026-08-18", "2242.00", "622845678901"],
      ["3", "2026-08-20", "550.00", ""],
      ["4", "2026-08-21", "50000.00", "000123"],
    ]);
  });
  it("accepts any column order, spacing and case", () => {
    const r = parseBankStatement(["AMOUNT,description,chq/ref no,VALUE DATE,sl no", '"1,23,456.70",TNEB EB BILL,,05-Sep-2026,1'].join("\n"));
    expect(r.rows[0]).toMatchObject({ date: "2026-09-05", amount: "123456.70", description: "TNEB EB BILL", slNo: "1", category: "" });
  });
  it("matches the Category cell to existing categories by name", () => {
    expect(matchCategory("raw  materials", cats)).toBe(4);
    expect(matchCategory("PETROL", cats)).toBe(2);
    expect(matchCategory("Snacks", cats)).toBeNull();
    expect(matchCategory("", cats)).toBeNull();
  });
  it("keeps spaces and lowercase s in descriptions", () => {
    const r = parseBankStatement(["Sl. No.,Value Date,Description,Chq /Ref No.,Amount", "1,01-10-2026,  bus   pass  ,,5"].join("\n"));
    expect(r.rows[0]!.description).toBe("bus pass");
  });
  it("rejects missing or extra columns", () => {
    expect(parseBankStatement(["Sl. No.,Value Date,Description,Amount", "1,01-10-2026,X,5"].join("\n")).errors[0]).toMatch(/missing: Chq \/Ref No\./);
    expect(parseBankStatement("Sl. No.,Transaction Date,Value Date,Description,Chq /Ref No.,Amount,Dr / Cr").errors[0]).toMatch(/not allowed: Transaction Date, Dr \/ Cr/);
  });
  it("reports bad rows with the file line number and skips blank / total lines", () => {
    const r = parseBankStatement(
      ["Sl. No.,Value Date,Description,Chq /Ref No.,Amount", "", "1,32-13-2026,X,,10", "2,01-10-2026,Y,,abc", "3,01-10-2026,,,5", ",,Total,,15", "4,02-10-2026,OK,,7"].join("\n"),
    );
    expect(r.errors).toEqual(['Line 3: invalid Value Date "32-13-2026"', 'Line 4: invalid Amount "abc"', "Line 5: Description is empty"]);
    expect(r.rows.map((x) => x.line)).toEqual([7]);
  });
  it("guesses payment mode and category from the description", () => {
    expect(paymentModeFromNarration("UPI/622812345678/SARAVANA", "")).toBe("upi");
    expect(paymentModeFromNarration("CHQ PAID-RENT", "000123")).toBe("cheque");
    expect(paymentModeFromNarration("ATM CASH WDL", "")).toBe("cash");
    expect(paymentModeFromNarration("NEFT-ABC", "N123")).toBe("bank");
    expect(suggestCategory("UPI/6228/SARAVANA/SALARY", cats)).toBe(1);
    expect(suggestCategory("POS HPCL PETROL BUNK", cats)).toBe(2);
    expect(suggestCategory("UPI/HD DYES/INK", cats)).toBe(4);
    expect(suggestCategory("TNEB EB BILL", cats)).toBe(5);
    expect(suggestCategory("NEFT TO SOMEONE", cats)).toBeNull();
  });
});

describe("amount in words", () => {
  it("uses lakh and crore", () => {
    expect(numberToIndianWords(12345678)).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight");
    expect(rupeesInWords(118050)).toBe("Rupees One Thousand One Hundred Eighty and Fifty Paise Only");
  });
});

describe("periods and invoice state", () => {
  it("resolves named periods", () => {
    expect(resolvePeriod("this_fy", "2026-10-12")).toMatchObject({ from: "2026-04-01", to: "2027-03-31" });
    expect(resolvePeriod("last_3_months", "2026-10-14")).toMatchObject({ from: "2026-08-01", to: "2026-10-31" });
    expect(resolvePeriod("last_6_months", "2026-02-10")).toMatchObject({ from: "2025-09-01", to: "2026-02-28" });
    expect(resolvePeriod("last_12_months", "2026-01-05")).toMatchObject({ from: "2025-02-01", to: "2026-01-31" });
    expect(resolvePeriod("last_month", "2026-03-31")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod("this_week", "2026-10-14")).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
    expect(resolvePeriod("custom", "2026-10-14", "2026-10-20", "2026-10-01")).toMatchObject({ period: "this_month" });
    expect(resolvePeriod("nonsense", "2026-12-14")).toMatchObject({ from: "2026-12-01", to: "2026-12-31", period: "this_month" });
    expect(resolvePeriod("last_month", "2026-01-15")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("this_month", "2026-02-10")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("derives invoice state", () => {
    const inv = { status: "issued", total: "100.00", amountPaid: "0", dueDate: "2026-10-01" };
    expect(invoiceState(inv, "2026-10-12")).toBe("overdue");
    expect(invoiceState({ ...inv, dueDate: "2026-11-01" }, "2026-10-12")).toBe("unpaid");
    expect(invoiceState({ ...inv, amountPaid: "40" , dueDate: "2026-11-01" }, "2026-10-12")).toBe("partially_paid");
    expect(invoiceState({ ...inv, amountPaid: "100.00" }, "2026-10-12")).toBe("paid");
  });
});

describe("password rule", () => {
  const ok = (p: string) => passwordRule.safeParse(p).success;
  it("needs 5+ characters with letters and numbers", () => {
    expect(ok("abc12")).toBe(true);
    expect(ok("ab12")).toBe(false);
    expect(ok("abcde")).toBe(false);
    expect(ok("12345")).toBe(false);
    expect(passwordRule.safeParse("ab1").error?.issues[0]?.message).toBe("Use at least 5 characters");
  });
});
