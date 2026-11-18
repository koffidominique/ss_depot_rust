import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { AppSettings, UserAccount, UserRole } from '../../../types/erp.ts';

export function useSettingsQueries() {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const usersQuery = useQuery<UserAccount[]>({
    queryKey: ['auth-users'],
    queryFn: async () => {
      if (typeof apiClient.listUsers !== 'function') return [];
      try {
        return await apiClient.listUsers();
      } catch {
        return [];
      }
    },
  });

  return { settingsQuery, usersQuery };
}

export function useSettingsMutations(options: {
  onFeedback: (feedback: { type: 'ok' | 'err'; text: string }) => void;
  onSettingsSaved: () => void;
  onMethodAdded: () => void;
  onPinChanged: () => void;
  onUserCreated: () => void;
}) {
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: (payload: Partial<AppSettings> & { theme: 'light' | 'dark' }) =>
      apiClient.updateSettings({
        ...payload,
        allow_negative_stock: Boolean(payload.allow_negative_stock),
        logo_path: payload.logo_path ?? null,
        setup_completed: true,
        theme: payload.theme,
      }),
    onSuccess: () => {
      options.onSettingsSaved();
      qc.invalidateQueries({ queryKey: ['settings'] });
      options.onFeedback({ type: 'ok', text: 'Paramètres enregistrés avec succès.' });
    },
    onError: (err) =>
      options.onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur sauvegarde.',
      }),
  });

  const addMethodMut = useMutation({
    mutationFn: (label: string) => apiClient.addPaymentMethod(label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      options.onMethodAdded();
      options.onFeedback({ type: 'ok', text: 'Moyen de paiement ajouté.' });
    },
    onError: (err) =>
      options.onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur ajout moyen.',
      }),
  });

  const toggleMethodMut = useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      apiClient.togglePaymentMethod(code, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: (err) =>
      options.onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Action refusée.',
      }),
  });

  const pinMut = useMutation({
    mutationFn: (args: { currentPin: string; newPin: string }) =>
      apiClient.changePin(args.currentPin, args.newPin),
    onSuccess: () => {
      options.onPinChanged();
      options.onFeedback({ type: 'ok', text: 'Code PIN propriétaire mis à jour.' });
    },
    onError: (err) =>
      options.onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur changement PIN.',
      }),
  });

  const createUserMut = useMutation({
    mutationFn: (args: {
      username: string;
      displayName: string;
      role: UserRole;
      pin: string;
    }) => apiClient.createUser(args),
    onSuccess: (created) => {
      options.onUserCreated();
      qc.invalidateQueries({ queryKey: ['auth-users'] });
      options.onFeedback({
        type: 'ok',
        text: `Compte ${created.username} (${created.roleLabel}) créé avec succès.`,
      });
    },
    onError: (err) =>
      options.onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur création utilisateur.',
      }),
  });

  const toggleUserMut = useMutation({
    mutationFn: ({ userId, active }: { userId: number; active: boolean }) =>
      apiClient.toggleUser(userId, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-users'] });
      options.onFeedback({ type: 'ok', text: 'Statut du compte mis à jour.' });
    },
    onError: (err) =>
      options.onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Action refusée.',
      }),
  });

  return { saveMut, addMethodMut, toggleMethodMut, pinMut, createUserMut, toggleUserMut };
}
