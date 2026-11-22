import { useState } from 'react';
import { useUiStore } from '../stores/uiStore.ts';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { AppSettings, UserRole } from '../types/erp.ts';
import {
  useSettingsMutations,
  useSettingsQueries,
} from '../features/settings/hooks/useSettingsData.ts';
import { CompanySettingsCard } from '../features/settings/components/CompanySettingsCard.tsx';
import {
  PaymentMethodsCard,
  PinSecurityCard,
  UsersRbacCard,
} from '../features/settings/components/SecurityAndUsersCards.tsx';

export function SettingsPage() {
  const currentUser = useUiStore((s) => s.currentUser);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier');
  const [newUserPin, setNewUserPin] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { settingsQuery, usersQuery } = useSettingsQueries();
  const { saveMut, addMethodMut, toggleMethodMut, pinMut, createUserMut, toggleUserMut } =
    useSettingsMutations({
      onFeedback: setFeedback,
      onSettingsSaved: () => setDraft({}),
      onMethodAdded: () => setNewMethodLabel(''),
      onPinChanged: () => {
        setCurrentPin('');
        setNewPin('');
      },
      onUserCreated: () => {
        setNewUsername('');
        setNewDisplayName('');
        setNewUserPin('');
      },
    });

  const { data, isLoading, error, refetch } = settingsQuery;

  if (isLoading) return <LoadingState rows={6} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement paramètres.'}
        onRetry={() => refetch()}
      />
    );
  }

  const form: Partial<AppSettings> = {
    ...(data.settings || {}),
    ...draft,
  };

  const setForm = (updater: (prev: Partial<AppSettings>) => Partial<AppSettings>) => {
    setDraft((prev) => updater({ ...(data.settings || {}), ...prev }));
  };

  return (
    <div className="space-y-6">
      {data.settings.setup_completed === 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 text-xs font-medium text-[#182230] dark:text-slate-100">
          Première configuration : renseignez le nom commercial et les coordonnées de votre dépôt
          pour personnaliser vos documents imprimés et reçus PDF.
        </div>
      )}

      {feedback && (
        <InlineAlert
          variant={feedback.type === 'ok' ? 'success' : 'error'}
          message={feedback.text}
          onDismiss={() => setFeedback(null)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CompanySettingsCard
          form={form}
          canManageLogo={currentUser?.role === 'owner'}
          theme={theme}
          isSaving={saveMut.isPending}
          onUpdateForm={setForm}
          onSetTheme={setTheme}
          onError={(text) => setFeedback({ type: 'err', text })}
          onClearFeedback={() => setFeedback(null)}
          onSave={() => saveMut.mutate({ ...form, theme })}
        />

        <div className="space-y-6">
          <PaymentMethodsCard
            paymentMethods={data.paymentMethods}
            newMethodLabel={newMethodLabel}
            onChangeNewLabel={setNewMethodLabel}
            onToggleMethod={(code, active) => toggleMethodMut.mutate({ code, active })}
            onAddMethod={() => addMethodMut.mutate(newMethodLabel)}
            isAdding={addMethodMut.isPending}
          />

          <PinSecurityCard
            currentPin={currentPin}
            newPin={newPin}
            onChangeCurrentPin={setCurrentPin}
            onChangeNewPin={setNewPin}
            onSubmit={() => pinMut.mutate({ currentPin, newPin })}
            isPending={pinMut.isPending}
          />

          <UsersRbacCard
            usersList={usersQuery.data || []}
            newUsername={newUsername}
            newDisplayName={newDisplayName}
            newUserRole={newUserRole}
            newUserPin={newUserPin}
            onChangeUsername={setNewUsername}
            onChangeDisplayName={setNewDisplayName}
            onChangeRole={setNewUserRole}
            onChangePin={setNewUserPin}
            onToggleUser={(userId, active) => toggleUserMut.mutate({ userId, active })}
            onCreateUser={() =>
              createUserMut.mutate({
                username: newUsername,
                displayName: newDisplayName,
                role: newUserRole,
                pin: newUserPin,
              })
            }
            isCreating={createUserMut.isPending}
          />
        </div>
      </div>
    </div>
  );
}
