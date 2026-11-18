import { LockKeyhole, Moon, RotateCcw, ShieldCheck, Sun } from 'lucide-react';
import { Logo } from '../components/common/Logo.tsx';
import { useUiStore } from '../stores/uiStore.ts';
import { usePinAuth } from '../features/auth/hooks/usePinAuth.ts';
import { PinDotsIndicator, PinKeypad } from '../features/auth/components/PinKeypad.tsx';

export function LoginPage() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const {
    needsSetup,
    statusError,
    remainingLockSeconds,
    username,
    setUsername,
    setupStep,
    currentInput,
    error,
    loading,
    handleDigit,
    handleBackspace,
    handleClear,
    handleBackToEnter,
    handleSubmit,
    retryStatus,
  } = usePinAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FB] dark:bg-[#0B1220] px-4 py-8">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Changer de thème"
        className="fixed right-5 top-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Logo />
          <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#182230] dark:text-slate-100">
            {needsSetup === null ? (
              <>
                <LockKeyhole className="h-4 w-4 text-[#2563EB]" />
                <span>Connexion au serveur...</span>
              </>
            ) : needsSetup ? (
              <>
                <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
                <span>
                  {setupStep === 'enter'
                    ? 'Créer votre PIN propriétaire'
                    : 'Confirmer le code PIN'}
                </span>
              </>
            ) : (
              <>
                <LockKeyhole className="h-4 w-4 text-[#2563EB]" />
                <span>Accès Propriétaire</span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-xs text-[#667085] dark:text-slate-400">
            {needsSetup === null
              ? 'Vérification de la sécurité locale DEPOTPRO en cours...'
              : needsSetup
                ? 'Aucun code par défaut n’est défini. Choisissez un PIN personnel à 6 chiffres.'
                : 'Saisissez votre code PIN à 6 chiffres pour déverrouiller la gestion du dépôt.'}
          </p>
        </div>

        {needsSetup === false && (
          <div className="mt-4">
            <label
              htmlFor="login-username"
              className="block text-[11px] font-medium text-[#667085] dark:text-slate-400"
            >
              Identifiant (optionnel — propriétaire par défaut)
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="owner, caissier, magasinier..."
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 px-3 py-2 text-xs text-[#182230] dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>
        )}

        <PinDotsIndicator length={currentInput.length} />

        {statusError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2.5 text-center text-xs font-medium text-[#DC4545] dark:text-rose-400 space-y-2"
          >
            <div>{statusError}</div>
            <button
              type="button"
              onClick={retryStatus}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Réessayer</span>
            </button>
          </div>
        )}

        {!statusError && remainingLockSeconds > 0 && !error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-center text-xs font-medium text-[#D9901A] dark:text-amber-300"
          >
            Accès temporairement verrouillé. Patientez {remainingLockSeconds} seconde(s).
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-center text-xs font-medium text-[#DC4545] dark:text-rose-400"
          >
            {error}
          </div>
        )}

        <PinKeypad
          disabled={needsSetup === null || loading}
          onDigit={handleDigit}
          onClear={handleClear}
          onBackspace={handleBackspace}
        />

        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={loading || needsSetup === null || currentInput.length !== 6}
            onClick={() => void handleSubmit()}
            className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {loading
              ? 'Vérification...'
              : needsSetup === null
                ? 'Connexion...'
                : needsSetup
                  ? setupStep === 'enter'
                    ? 'Continuer'
                    : 'Enregistrer et accéder'
                  : 'Déverrouiller'}
          </button>
          {needsSetup && setupStep === 'confirm' && (
            <button
              type="button"
              onClick={handleBackToEnter}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 py-2 text-xs font-medium text-[#667085] dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Modifier le code PIN saisi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
