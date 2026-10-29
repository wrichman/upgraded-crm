import { useEffect, useRef, useState } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindManyRecordIndexTableParams } from '@/object-record/record-index/hooks/useFindManyRecordIndexTableParams';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { postUpgradedEnrich } from '@/object-record/upgraded-enrich/postUpgradedEnrich';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { LightButton, useToast } from 'twenty-ui/components';
import { IconWand } from 'twenty-ui/icon';

const VIEW_ENRICH_LIMIT = 40;

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
  const [armed, setArmed] = useState(false);
  const sent = useRef(false);
  const params = useFindManyRecordIndexTableParams(objectNameSingular);
  const { records, loading, totalCount } = useFindManyRecords({
    ...params,
    limit: VIEW_ENRICH_LIMIT,
    skip: !armed,
    recordGqlFields: { id: true },
  });

  useEffect(() => {
    if (!armed) {
      sent.current = false;
      return;
    }
    if (loading || sent.current) {
      return;
    }
    sent.current = true;
    const ids = records
      .map((record) => (typeof record.id === 'string' ? record.id : ''))
      .filter(Boolean);
    const truncated = (totalCount ?? ids.length) > ids.length;
    const posted =
      ids.length > 0 &&
      postUpgradedEnrich({
        object,
        ids,
        scope: 'view',
        truncated,
        totalCount: totalCount ?? ids.length,
      });

    if (ids.length === 0) {
      enqueueToast({
        variant: 'warning',
        children: t`This view has no records to enrich.`,
      });
    } else if (!posted) {
      enqueueToast({
        variant: 'warning',
        children: t`Open the CRM from Labs to enrich this view.`,
      });
    }

    setArmed(false);
  }, [armed, enqueueToast, loading, object, records, totalCount]);

  return (
    <LightButton
      startIcon={<IconWand size={14} />}
      disabled={armed}
      title={t`Enrich the records in this view`}
      onClick={() => setArmed(true)}
    >
      {armed ? t`Enriching…` : t`Enrich view`}
    </LightButton>
  );
};
