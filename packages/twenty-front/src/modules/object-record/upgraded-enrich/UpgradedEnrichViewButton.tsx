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

const PERSON_PAGE_SIZE = 200;
const PERSON_PAGE_CAP = 50;
const COMPANY_PAGE_SIZE = 40;

type ViewConnection = {
  edges?: { node?: { id?: string } }[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  totalCount?: number;
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
    recordGqlFields: { id: true },
  });

  const enrichView = async () => {
    if (!isDefined(objectMetadataItem) || busy) return;
    setBusy(true);
    try {
      const pageSize = object === 'person' ? PERSON_PAGE_SIZE : COMPANY_PAGE_SIZE;
      const maxPages = object === 'person' ? PERSON_PAGE_CAP : 1;
      const ids: string[] = [];
      let cursor: string | undefined;
      let total = 0;
      let hasMore = false;

      for (let page = 0; page < maxPages; page += 1) {
        const { data } = await apolloCoreClient.query({
          query: findManyRecordsQuery,
          variables: {
            filter: params.filter,
            orderBy: params.orderBy,
            limit: pageSize,
            lastCursor: cursor,
          },
          fetchPolicy: 'network-only',
        });
        const connection = (data as Record<string, ViewConnection> | undefined)?.[
          objectMetadataItem.namePlural
        ];
        total = connection?.totalCount ?? total;
        for (const edge of connection?.edges ?? []) {
          if (typeof edge?.node?.id === 'string') ids.push(edge.node.id);
        }
        const endCursor = connection?.pageInfo?.endCursor;
        hasMore = Boolean(connection?.pageInfo?.hasNextPage && endCursor);
        if (!hasMore || object !== 'person') break;
        cursor = endCursor ?? undefined;
      }

      const truncated = hasMore || total > ids.length;
      const posted =
        ids.length > 0 &&
        postUpgradedEnrich({
          object,
          ids,
          scope: 'view',
          truncated,
          totalCount: total || ids.length,
        });

      if (ids.length === 0) {
        enqueueToast({
          variant: 'warning',
          children: 'This view has no records to enrich.',
        });
      } else if (!posted) {
        enqueueToast({
          variant: 'warning',
          children: 'Open the CRM from Labs to enrich this view.',
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
      title={object === 'person' ? 'Enrich everyone in this view' : 'Enrich the records in this view'}
      onClick={() => void enrichView()}
    >
      {busy ? 'Loading view…' : `Enrich All${countLabel}`}
    </LightButton>
  );
};
