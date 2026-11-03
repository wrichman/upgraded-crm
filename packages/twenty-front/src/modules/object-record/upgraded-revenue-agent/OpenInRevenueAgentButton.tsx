import { useEffect, useRef, useState } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindManyRecordIndexTableParams } from '@/object-record/record-index/hooks/useFindManyRecordIndexTableParams';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { LightButton, useToast } from 'twenty-ui/components';
import { IconMessage } from 'twenty-ui/icon';

const VIEW_OPEN_LIMIT = 200;

type QueuePerson = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

const readText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const readPerson = (record: Record<string, unknown>): QueuePerson | null => {
  const id = readText(record.id);
  if (!id) return null;
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

const parentOrigin = () => {
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    return '*';
  }
  return '*';
};

export const OpenInRevenueAgentButton = () => {
  const workspaceSurface = useWorkspaceSurface();
  const { objectNameSingular } = useRecordIndexContextOrThrow();
  if (
    workspaceSurface.type !== 'main' ||
    objectNameSingular !== CoreObjectNameSingular.Person
  ) {
    return null;
  }
  return <OpenViewButton objectNameSingular={objectNameSingular} />;
};

const OpenViewButton = ({ objectNameSingular }: { objectNameSingular: string }) => {
  const { enqueueToast } = useToast();
  const [armed, setArmed] = useState(false);
  const sent = useRef(false);
  const params = useFindManyRecordIndexTableParams(objectNameSingular);
  const { records, loading, totalCount } = useFindManyRecords({
    ...params,
    limit: VIEW_OPEN_LIMIT,
    skip: !armed,
    recordGqlFields: {
      id: true,
      name: { firstName: true, lastName: true },
      emails: { primaryEmail: true },
    },
  });

  useEffect(() => {
    if (!armed) {
      sent.current = false;
      return;
    }
    if (loading || sent.current) return;
    sent.current = true;
    const people = records
      .map((record) => readPerson(record as Record<string, unknown>))
      .filter(isDefined);
    const truncated = (totalCount ?? people.length) > people.length;

    if (people.length === 0) {
      enqueueToast({
        variant: 'warning',
        children: t`This view has no people to open.`,
      });
      setArmed(false);
      return;
    }

    if (window.parent === window) {
      enqueueToast({
        variant: 'warning',
        children: t`Open the CRM from Labs to send this view to the Revenue Agent.`,
      });
      setArmed(false);
      return;
    }

    window.parent.postMessage(
      {
        source: 'upgraded-crm',
        type: 'open-in-revenue-agent',
        truncated,
        people,
      },
      parentOrigin(),
    );
    setArmed(false);
  }, [armed, enqueueToast, loading, records, totalCount]);

  return (
    <LightButton
      startIcon={<IconMessage size={14} />}
      disabled={armed}
      title={t`Open this People view in the Revenue Agent, in the same order`}
      onClick={() => setArmed(true)}
    >
      {armed ? t`Opening…` : t`Revenue Agent`}
    </LightButton>
  );
};
