import { useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindManyRecordsQuery } from '@/object-record/hooks/useFindManyRecordsQuery';
import { useFindManyRecordIndexTableParams } from '@/object-record/record-index/hooks/useFindManyRecordIndexTableParams';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { postUpgradedEnrich } from '@/object-record/upgraded-enrich/postUpgradedEnrich';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { LightButton, useToast } from 'twenty-ui/components';
import { IconWand } from 'twenty-ui/icon';

const PAGE_SIZE = 200;
const PAGE_CAP = 150;
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;

type CompanyNode = {
  id?: string;
  name?: string;
  domainName?: { primaryLinkUrl?: string };
};

type ViewConnection = {
  edges?: { node?: CompanyNode }[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  totalCount?: number;
};

const needsEnrichmentFilter = () => {
  const staleBefore = new Date(Date.now() - FRESH_MS).toISOString();
  return {
    or: [
      { enrichedAt: { is: 'NULL' } },
      { enrichedAt: { lt: staleBefore } },
      { enrichmentStatus: { eq: 'failed' } },
    ],
  };
};

const domainOf = (url?: string) => {
  const domain = (url ?? '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '').trim().toLowerCase();
  return domain.includes('.') ? domain : null;
};

export const UpgradedEnrichViewButton = () => {
  const workspaceSurface = useWorkspaceSurface();
  const { objectNameSingular } = useRecordIndexContextOrThrow();
  const object =
    objectNameSingular === CoreObjectNameSingular.Person
      ? 'person'
      : objectNameSingular === CoreObjectNameSingular.Company
        ? 'company'
        : null;

  if (workspaceSurface.type !== 'main' || !isDefined(object)) {
    return null;
  }

  return <EnrichViewButton objectNameSingular={objectNameSingular} object={object} />;
};

const EnrichViewButton = ({
  objectNameSingular,
  object,
}: {
  objectNameSingular: string;
  object: 'person' | 'company';
}) => {
  const { enqueueToast } = useToast();
  const [busy, setBusy] = useState(false);
  const params = useFindManyRecordIndexTableParams(objectNameSingular);
  const { totalCount } = useFindManyRecords({
    ...params,
    limit: 1,
    recordGqlFields: { id: true },
  });
  const countLabel =
    typeof totalCount === 'number' ? ` (${totalCount.toLocaleString('en-US')})` : '';
  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });
  const apolloCoreClient = useApolloCoreClient();
  const { findManyRecordsQuery } = useFindManyRecordsQuery({
    objectNameSingular,
    recordGqlFields: object === 'company'
      ? { id: true, name: true, domainName: { primaryLinkUrl: true } }
      : { id: true },
  });

  const enrichView = async () => {
    if (!isDefined(objectMetadataItem) || busy) return;
    setBusy(true);
    try {
      const filter = object === 'company'
        ? { and: [params.filter, needsEnrichmentFilter()].filter((item) => isDefined(item) && Object.keys(item).length > 0) }
        : params.filter;
      let cursor: string | undefined;
      let total = 0;
      let hasMore = false;
      let started = false;

      for (let page = 0; page < PAGE_CAP; page += 1) {
        const { data } = await apolloCoreClient.query({
          query: findManyRecordsQuery,
          variables: {
            filter,
            orderBy: params.orderBy,
            limit: object === 'company' && page === 0 ? 1 : PAGE_SIZE,
            lastCursor: cursor,
          },
          fetchPolicy: 'network-only',
        });
        const connection = (data as Record<string, ViewConnection> | undefined)?.[
          objectMetadataItem.namePlural
        ];
        total = connection?.totalCount ?? total;
        const companies = (connection?.edges ?? []).flatMap((edge) => {
          const node = edge?.node;
          if (typeof node?.id !== 'string') return [];
          return [{
            id: node.id,
            name: typeof node.name === 'string' ? node.name : undefined,
            domain: domainOf(node.domainName?.primaryLinkUrl),
          }];
        });
        const endCursor = connection?.pageInfo?.endCursor;
        hasMore = Boolean(connection?.pageInfo?.hasNextPage && endCursor);
        if (companies.length > 0) {
          const posted = postUpgradedEnrich({
            object,
            ids: companies.map((company) => company.id),
            companies: object === 'company' ? companies : undefined,
            scope: 'view',
            append: started,
            paging: hasMore,
            truncated: hasMore && page === PAGE_CAP - 1,
            totalCount: total || companies.length,
          });
          if (!posted && !started) {
            enqueueToast({
              variant: 'warning',
              children: 'Open the CRM from Labs to enrich this view.',
            });
            return;
          }
          started = true;
        }
        if (!hasMore) break;
        cursor = endCursor ?? undefined;
      }

      if (!started) {
        enqueueToast({
          variant: 'warning',
          children: 'This view has no records to enrich.',
        });
      }
    } catch {
      enqueueToast({
        variant: 'warning',
        children: 'Could not load this view for enrichment.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <LightButton
      startIcon={<IconWand size={14} />}
      disabled={busy}
      title="Enrich everyone in this view"
      onClick={() => void enrichView()}
    >
      {busy ? 'Loading view…' : `Enrich All${countLabel}`}
    </LightButton>
  );
};
