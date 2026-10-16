import { createPortal } from 'react-dom';
import { useContext, useMemo, useState } from 'react';

import { CommandMenuContext } from '@/command-menu-item/contexts/CommandMenuContext';
import { CommandMenuContextProvider } from '@/command-menu-item/contexts/CommandMenuContextProvider';
import { useCommandMenuItemDisplay } from '@/command-menu-item/display/hooks/useCommandMenuItemDisplay';
import { CommandMenuItemContainerType } from '@/command-menu-item/types/CommandMenuItemContainerType';
import { type CommandMenuItemDefinition } from '@/command-menu-item/types/CommandMenuItemDefinition';
import { useFindManyRecordsSelectedInContextStore } from '@/context-store/hooks/useFindManyRecordsSelectedInContextStore';
import { contextStoreNumberOfSelectedRecordsComponentState } from '@/context-store/states/contextStoreNumberOfSelectedRecordsComponentState';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useResetRecordIndexSelection } from '@/object-record/record-index/hooks/useResetRecordIndexSelection';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import {
  IconCancel,
  IconDotsVertical,
  IconList,
  IconMail,
  IconPlaylistAdd,
  IconSend,
  type IconComponent,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';
import { EngineComponentKey } from '~/generated-metadata/graphql';

const PEOPLE_ACTION_LIMIT = 200;

type SelectedPerson = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

const StyledBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.xl};
  bottom: 20px;
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  left: 50%;
  max-width: calc(100vw - 32px);
  padding: 6px;
  position: fixed;
  transform: translateX(-50%);
  z-index: 30;
`;

const StyledCount = styled.button`
  align-items: center;
  background: ${themeCssVariables.accent.primary};
  border: none;
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  height: 32px;
  padding: 0 10px;
  white-space: nowrap;

  &:hover {
    filter: brightness(0.95);
  }
`;

const StyledAction = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  height: 32px;
  padding: 0 10px;
  white-space: nowrap;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const StyledMenuWrap = styled.div`
  position: relative;
`;

const StyledMenu = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  bottom: calc(100% + 8px);
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  min-width: 220px;
  padding: 4px;
  position: absolute;
  right: 0;
`;

const StyledMenuItem = styled.button<{ danger?: boolean }>`
  align-items: center;
  background: transparent;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ danger }) =>
    danger
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: 8px 10px;
  text-align: left;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const readText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const readSelectedPerson = (
  record: Record<string, unknown>,
): SelectedPerson | null => {
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

const postPeopleAction = (
  action: 'add-to-list' | 'enroll-sequence' | 'send-newsletter',
  people: SelectedPerson[],
  truncated: boolean,
) => {
  const withEmail = people.filter((person) => person.email.includes('@'));

  window.parent.postMessage(
    {
      source: 'upgraded-crm',
      type: 'people-selection-action',
      action,
      truncated,
      people: withEmail,
    },
    parentOrigin(),
  );
};

const CommandActionButton = ({
  item,
  icon,
  label,
}: {
  item: CommandMenuItemDefinition;
  icon?: IconComponent;
  label?: string;
}) => {
  const display = useCommandMenuItemDisplay(item);
  const Icon = icon ?? display.Icon;

  return (
    <StyledAction
      type="button"
      disabled={display.disabled}
      onClick={() => {
        void display.handleClick();
      }}
    >
      <Icon size={16} />
      {label ?? display.shortLabel ?? display.label}
    </StyledAction>
  );
};

const MoreCommandItem = ({
  item,
  onDone,
}: {
  item: CommandMenuItemDefinition;
  onDone: () => void;
}) => {
  const { Icon, label, handleClick, disabled } = useCommandMenuItemDisplay(item);
  const danger = item.engineComponentKey === EngineComponentKey.DELETE_RECORDS;

  return (
    <StyledMenuItem
      type="button"
      danger={danger}
      disabled={disabled}
      onClick={() => {
        void handleClick();
        onDone();
      }}
    >
      <Icon size={16} />
      {label}
    </StyledMenuItem>
  );
};

const PeopleSelectionActionBarContent = ({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) => {
  const { formatNumber } = useNumberFormat();
  const { commandMenuItems } = useContext(CommandMenuContext);
  const [moreOpen, setMoreOpen] = useState(false);
  const { records, totalCount } = useFindManyRecordsSelectedInContextStore({
    limit: PEOPLE_ACTION_LIMIT,
    recordGqlFields: {
      id: true,
      name: { firstName: true, lastName: true },
      emails: { primaryEmail: true },
    },
  });

  const people = useMemo(
    () =>
      records
        .map((record) => readSelectedPerson(record as Record<string, unknown>))
        .filter(isDefined),
    [records],
  );
  const truncated = (totalCount ?? people.length) > people.length;

  const sendEmail = commandMenuItems.find(
    (item) => item.engineComponentKey === EngineComponentKey.COMPOSE_EMAIL,
  );
  const moreItems = commandMenuItems.filter(
    (item) => item.engineComponentKey !== EngineComponentKey.COMPOSE_EMAIL,
  );

  const runPeopleAction = (
    action: 'add-to-list' | 'enroll-sequence' | 'send-newsletter',
  ) => {
    setMoreOpen(false);
    postPeopleAction(action, people, truncated);
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <StyledBar>
      <StyledCount type="button" onClick={onClear} aria-label={t`Clear selection`}>
        {t`${formatNumber(count)} selected`}
        <IconCancel size={14} />
      </StyledCount>
      <StyledAction type="button" onClick={() => runPeopleAction('add-to-list')}>
        <IconPlaylistAdd size={16} />
        {t`Add to list`}
      </StyledAction>
      {isDefined(sendEmail) && (
        <CommandActionButton
          item={sendEmail}
          icon={IconMail}
          label={t`Send email`}
        />
      )}
      <StyledAction
        type="button"
        onClick={() => runPeopleAction('enroll-sequence')}
      >
        <IconList size={16} />
        {t`Enroll in sequence`}
      </StyledAction>
      <StyledAction
        type="button"
        onClick={() => runPeopleAction('send-newsletter')}
      >
        <IconSend size={16} />
        {t`Send newsletter`}
      </StyledAction>
      <StyledMenuWrap>
        <StyledAction
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          {t`More`}
          <IconDotsVertical size={16} />
        </StyledAction>
        {moreOpen && (
          <StyledMenu>
            {moreItems.map((item) => (
              <MoreCommandItem
                key={item.id}
                item={item}
                onDone={() => setMoreOpen(false)}
              />
            ))}
          </StyledMenu>
        )}
      </StyledMenuWrap>
    </StyledBar>,
    document.body,
  );
};

export const PeopleSelectionActionBar = () => {
  const workspaceSurface = useWorkspaceSurface();
  const { objectNameSingular } = useRecordIndexContextOrThrow();
  const selectedCount = useAtomComponentStateValue(
    contextStoreNumberOfSelectedRecordsComponentState,
  );
  const { resetRecordIndexSelection } = useResetRecordIndexSelection();

  const visible =
    workspaceSurface.type === 'main' &&
    objectNameSingular === CoreObjectNameSingular.Person &&
    selectedCount > 0;

  if (!visible) {
    return null;
  }

  return (
    <CommandMenuContextProvider
      displayType="button"
      containerType={CommandMenuItemContainerType.IndexPageHeader}
    >
      <PeopleSelectionActionBarContent
        count={selectedCount}
        onClear={resetRecordIndexSelection}
      />
    </CommandMenuContextProvider>
  );
};
