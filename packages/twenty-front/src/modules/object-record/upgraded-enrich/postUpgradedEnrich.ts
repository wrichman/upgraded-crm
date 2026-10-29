export type UpgradedEnrichObject = 'person' | 'company';

const parentOrigin = () => {
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    return '*';
  }

  return '*';
};

/** Ask the Labs page that embeds this CRM to run enrichment. Returns false when the CRM is opened on its own. */
export const postUpgradedEnrich = (message: {
  object: UpgradedEnrichObject;
  ids: string[];
  scope: 'record' | 'view';
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
