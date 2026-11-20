export type UpgradedEnrichObject = 'person' | 'company';

export type PersonWithEmail = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export const parentOrigin = () => {
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    return '*';
  }

  return '*';
};

const readText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const readPersonRecord = (
  record: Record<string, unknown>,
): PersonWithEmail | null => {
  const id = readText(record.id);

  if (!id) {
    return null;
  }

  const emails = record.emails;
  const email =
    emails !== null && typeof emails === 'object'
      ? readText((emails as { primaryEmail?: unknown }).primaryEmail)
      : '';
  const name = record.name;
  const firstName =
    name !== null && typeof name === 'object'
      ? readText((name as { firstName?: unknown }).firstName)
      : '';
  const lastName =
    name !== null && typeof name === 'object'
      ? readText((name as { lastName?: unknown }).lastName)
      : '';

  return { id, email, firstName, lastName };
};

/** Ask the Labs page that embeds this CRM to run enrichment. Returns false when the CRM is opened on its own. */
export const postUpgradedEnrich = (message: {
  object: UpgradedEnrichObject;
  ids: string[];
  companies?: { id: string; name?: string; domain?: string | null }[];
  scope: 'record' | 'view';
  append?: boolean;
  paging?: boolean;
  truncated?: boolean;
  totalCount?: number;
}) => {
  if (window.parent === window || message.ids.length === 0) {
    return false;
  }

  window.parent.postMessage(
    {
      source: 'upgraded-crm',
      type: 'enrich-records',
      ...message,
    },
    parentOrigin(),
  );

  return true;
};
