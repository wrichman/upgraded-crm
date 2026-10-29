import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { LightButton, useToast } from 'twenty-ui/components';
import { IconWand } from 'twenty-ui/icon';

import { postUpgradedEnrich } from '@/object-record/upgraded-enrich/postUpgradedEnrich';

type UpgradedEnrichRecordButtonProps = {
  objectNameSingular: string;
  objectRecordId: string;
};

export const UpgradedEnrichRecordButton = ({
  objectNameSingular,
  objectRecordId,
}: UpgradedEnrichRecordButtonProps) => {
  const { enqueueToast } = useToast();
  const object =
    objectNameSingular === CoreObjectNameSingular.Person
      ? 'person'
      : objectNameSingular === CoreObjectNameSingular.Company
        ? 'company'
        : null;

  if (!object) {
    return null;
  }

  return (
    <LightButton
      startIcon={<IconWand size={14} />}
      title={t`Fill the empty fields on this record`}
      onClick={() => {
        const sent = postUpgradedEnrich({
          object,
          ids: [objectRecordId],
          scope: 'record',
        });
        if (!sent) {
          enqueueToast({
            variant: 'warning',
            children: t`Open the CRM from Labs to enrich this record.`,
          });
        }
      }}
    >
      {t`Enrich`}
    </LightButton>
  );
};
