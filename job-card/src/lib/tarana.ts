/**
 * Parser for Tarana sub-contract call-outs pasted from email / WhatsApp, e.g.
 *
 *   Company Name : Supersonic
 *   Type of Call :Link is operating in half-duplex
 *   Customer Site: 258 Matsha Street #21225
 *   Site Contact Name and Surname: Nokuthula Kasana
 *   Site Contact Phone Number: 27658096863
 *   MTN Business Ref# : MTNB00004285114
 *
 * Lines are "Label : value" with loose spacing. Unknown labels are ignored and
 * blank values stay empty, so a partial paste still fills what it can.
 */

export interface TaranaCallout {
  /** Who sent the work (the company we invoice), e.g. "Supersonic". */
  companyName: string;
  /** "Type of Call": the fault reported. */
  typeOfCall: string;
  customerSite: string;
  customerName: string;
  contactNumber: string;
  mtnRef: string;
  /** Extra context kept for the invoice's private notes. */
  region: string;
  technicalEngineer: string;
  asNumber: string;
  officeHours: string;
  requisitionDate: string;
}

export const EMPTY_CALLOUT: TaranaCallout = {
  companyName: "",
  typeOfCall: "",
  customerSite: "",
  customerName: "",
  contactNumber: "",
  mtnRef: "",
  region: "",
  technicalEngineer: "",
  asNumber: "",
  officeHours: "",
  requisitionDate: "",
};

/** Normalised label -> field. Labels are lower-cased with non-letters removed. */
const LABELS: [RegExp, keyof TaranaCallout][] = [
  [/^companyname$/, "companyName"],
  [/^typeofcall$/, "typeOfCall"],
  [/^customersite$/, "customerSite"],
  [/^(sitecontactnameandsurname|sitecontactname|customername|contactname)$/, "customerName"],
  [/^(sitecontactphonenumber|sitecontactnumber|contactnumber|phonenumber)$/, "contactNumber"],
  [/^mtnbusinessref(no|number)?$/, "mtnRef"],
  [/^region$/, "region"],
  [/^technicalengineer$/, "technicalEngineer"],
  [/^asnumber$/, "asNumber"],
  [/^sitecontactofficehours$/, "officeHours"],
  [/^requisitiondate$/, "requisitionDate"],
];

function fieldFor(label: string): keyof TaranaCallout | undefined {
  const norm = label.toLowerCase().replace(/[^a-z]/g, "");
  return LABELS.find(([re]) => re.test(norm))?.[1];
}

export function parseTaranaCallout(text: string): { callout: TaranaCallout; found: number } {
  const callout: TaranaCallout = { ...EMPTY_CALLOUT };
  let found = 0;
  for (const raw of text.split(/\r?\n/)) {
    const idx = raw.indexOf(":");
    if (idx <= 0) continue;
    const field = fieldFor(raw.slice(0, idx));
    if (!field) continue;
    // Times like "08:00 - 17:00" contain colons, so keep everything after the first one.
    const value = raw.slice(idx + 1).replace(/\s+/g, " ").trim();
    if (value && !callout[field]) {
      callout[field] = value;
      found++;
    }
  }
  return { callout, found };
}

/** "27658096863" / "0658096863" -> "+27 65 809 6863" for display and tel: links. */
export function formatZaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let national = "";
  if (digits.startsWith("27") && digits.length === 11) national = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 10) national = digits.slice(1);
  if (!national) return raw.trim();
  return `+27 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** Header lines placed above the work notes on the invoice. */
export function calloutSummary(c: TaranaCallout): string[] {
  return [
    c.mtnRef && `MTN Business Ref: ${c.mtnRef}`,
    c.typeOfCall && `Type of call: ${c.typeOfCall}`,
    c.customerSite && `Customer site: ${c.customerSite}`,
    c.customerName && `Customer: ${c.customerName}`,
    c.contactNumber && `Contact: ${formatZaPhone(c.contactNumber)}`,
  ].filter((l): l is string => Boolean(l));
}
