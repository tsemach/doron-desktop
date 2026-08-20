import { authorizeDesktopToken } from "../desktopAuth";

export interface ContactActor {
  id: string;
  accountType: "flat" | "firm";
  firmId: string | null;
}

export type ContactAuthResult = { actor: ContactActor } | { error: string; status: number };

// Desktop-callable contacts routes (/api/v1/contacts/desktop/...) -- same
// token-in-body pattern as lib/org/auth.ts::authorizeOrgRequest. No
// role/team branching needed here (see docs/contact/design.md §5): only
// the flat/firm split matters for contacts, so `role` collapses straight
// into `accountType` and nothing else from the identity is exposed.
export async function authorizeContactsRequest(token: string): Promise<ContactAuthResult> {
  const result = await authorizeDesktopToken(token);
  if ("error" in result) {
    return result;
  }
  const accountType = result.identity.role === "flat" ? "flat" : "firm";
  return { actor: { id: result.identity.userId, accountType, firmId: result.identity.firmId } };
}
