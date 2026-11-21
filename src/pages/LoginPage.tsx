import { Eye, EyeOff, LockKeyhole, Moon, RotateCcw, ShieldCheck, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import {
  DP_BUTTON_HOVER,
  DP_BUTTON_TAP,
  DP_EASE,
  DP_SPRING_SNAPPY,
} from '../components/motion/MotionPrimitives.tsx';
import { useUiStore } from '../stores/uiStore.ts';
import { usePinAuth } from '../features/auth/hooks/usePinAuth.ts';
import { PinDotsIndicator, PinKeypad } from '../features/auth/components/PinKeypad.tsx';
import { LoginShowcasePanel } from '../features/auth/components/LoginShowcasePanel.tsx';

/* ============================================================================
 * Page d'authentification locale par code PIN (Setup initial & Déverrouillage)
 * ============================================================================ */

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
    pinLength,
  } = usePinAuth();

  const [showPin, setShowPin] = useState(false);

  const isSetup = needsSetup === true;
  const isLoading = needsSetup === null;

  return (
    <div className="flex min-h-screen relative overflow-hidden">
      {/* Bouton de bascule clair / sombre */}
      <motion.button
        type="button"
        whileHover={DP_BUTTON_HOVER}
        whileTap={DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Passer au mode sombre' : 'Passer au mode clair'}
        className="fixed right-5 top-5 z-50 rounded-xl border border-white/25 dark:border-white/15 bg-white/10 dark:bg-black/15 backdrop-blur-sm p-2.5 text-white/90 hover:bg-white/20 dark:hover:bg-white/15 hover:border-white/40 transition-colors shadow-lg"
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </motion.button>

      {/* Panneau gauche : présentation métier */}
      <LoginShowcasePanel />

      {/* Panneau droit : clavier PIN */}
      <div className="relative w-full lg:w-1/2 flex min-h-screen items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
              <LockKeyhole className="h-6 w-6 text-white" />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: DP_EASE }}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dp-modal-surface p-6 sm:p-8"
          >
            {/* En-tête contextuel du formulaire */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {isLoading ? (
                  <>
                    <LockKeyhole className="h-4 w-4 text-blue-600 animate-pulse" />
                    <span>Connexion au serveur...</span>
                  </>
                ) : isSetup ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <span>
                      {setupStep === 'enter'
                        ? 'Créer votre PIN propriétaire'
                        : 'Confirmer le code PIN'}
                    </span>
                  </>
                ) : (
                  <>
                    <LockKeyhole className="h-4 w-4 text-blue-600" />
                    <span>Accès Propriétaire</span>
                  </>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {isLoading
                  ? 'Vérification de la sécurité locale DEPOTPRO en cours...'
                  : isSetup
                    ? `Aucun code par défaut n'est défini. Choisissez un PIN personnel à ${pinLength} chiffres.`
                    : `Saisissez votre code PIN à ${pinLength} chiffres pour déverrouiller la gestion du dépôt.`}
              </p>
            </div>

            {/* Champ identifiant optionnel (mode connexion) */}
            {!isSetup && !isLoading && (
              <div className="mb-5">
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Identifiant <span className="text-slate-400">(optionnel — propriétaire par défaut)</span>
                </label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="owner, caissier, magasinier..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                />
              </div>
            )}

            {/* Indicateur visuel des chiffres saisis */}
            <div className="mb-4">
              <PinDotsIndicator length={currentInput.length} />
            </div>

            {isSetup && setupStep === 'confirm' && (
              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showPin ? 'Masquer' : 'Afficher'} le PIN</span>
                </button>
              </div>
            )}

            {/* Alertes de statut, verrouillage ou erreur */}
            {statusError && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-center text-sm font-medium text-rose-700 dark:text-rose-400 space-y-3"
              >
                <div className="flex items-center justify-center gap-2">
                  <LockKeyhole className="h-4 w-4 flex-shrink-0" />
                  <span>{statusError}</span>
                </div>
                <button
                  type="button"
                  onClick={retryStatus}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Réessayer</span>
                </button>
              </div>
            )}

            {!statusError && remainingLockSeconds > 0 && !error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-center text-sm font-medium text-amber-800 dark:text-amber-300"
              >
                <div className="flex items-center justify-center gap-2">
                  <LockKeyhole className="h-4 w-4 flex-shrink-0" />
                  <span>Accès temporairement verrouillé. Patientez {remainingLockSeconds} seconde(s).</span>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-center text-sm font-medium text-rose-700 dark:text-rose-400 animate-shake"
                style={{ animation: 'shake 0.5s ease-in-out' }}
              >
                <div className="flex items-center justify-center gap-2">
                  <LockKeyhole className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Clavier numérique */}
            <PinKeypad
              disabled={isLoading || loading}
              onDigit={handleDigit}
              onClear={handleClear}
              onBackspace={handleBackspace}
            />

            {/* Actions de validation */}
            <div className="mt-6 space-y-3">
              <motion.button
                type="button"
                whileHover={isLoading || loading || currentInput.length !== pinLength ? undefined : DP_BUTTON_HOVER}
                whileTap={isLoading || loading || currentInput.length !== pinLength ? undefined : DP_BUTTON_TAP}
                transition={DP_SPRING_SNAPPY}
                disabled={isLoading || loading || currentInput.length !== pinLength}
                onClick={() => void handleSubmit()}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 dp-btn-elevated py-3.5 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-blue-700 disabled:shadow-none"
              >
                {loading
                  ? 'Vérification...'
                  : isLoading
                    ? 'Connexion...'
                    : isSetup
                      ? setupStep === 'enter'
                        ? 'Continuer'
                        : 'Enregistrer et accéder'
                      : 'Déverrouiller'}
              </motion.button>

              {isSetup && setupStep === 'confirm' && (
                <button
                  type="button"
                  onClick={handleBackToEnter}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Modifier le code PIN saisi
                </button>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">Sécurité :</span> Votre code PIN ne quitte jamais cet appareil.
                L'authentification est locale et chiffrée.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
