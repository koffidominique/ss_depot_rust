import { LockKeyhole, Moon, RotateCcw, ShieldCheck, Sun, CheckCircle2, Eye, EyeOff, Truck, Package, BarChart3, Users } from 'lucide-react';
import { useState } from 'react';
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
    pinLength,
  } = usePinAuth();

  const [showPin, setShowPin] = useState(false);

  const isSetup = needsSetup === true;
  const isLoading = needsSetup === null;

  return (
    <div className="flex min-h-screen relative overflow-hidden">
      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Passer au mode sombre' : 'Passer au mode clair'}
        className="fixed right-5 top-5 z-50 rounded-xl border border-white/20 dark:border-white/10 bg-white/10 dark:bg-black/10 backdrop-blur-sm p-2.5 text-white/90 hover:bg-white/20 dark:hover:bg-white/10 transition-all shadow-lg"
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      {/* Left side - Full screen background image with overlay and CTA */}
      <div className="relative w-full lg:w-1/2 min-h-screen">
        {/* Background Image */}
        <img
          src="/assets/aistudio/Gemini_Generated_Image_rrtmzrrtmzrrtmzr.jpeg"
          alt="Entrepôt de boissons avec caisses empilées"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Dark Overlay for contrast - gradient from dark to semi-transparent */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/40" />

        {/* Subtle pattern overlay for texture */}
        <div className="absolute inset-0 opacity-5">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.3" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* CTA Content on top of image */}
        <div className="relative z-10 flex h-full flex-col justify-between p-8 md:p-12 lg:p-16 text-white">
          {/* Top - Logo & Brand */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20">
              <LockKeyhole className="h-7 w-7 text-white drop-shadow-lg" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">DEPOTPRO</h1>
              <p className="text-sm font-medium text-white/80">Gestion de dépôt professionnelle</p>
            </div>
          </div>

          {/* Center - Main CTA Text */}
          <div className="max-w-xl space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
                Gérez votre stock
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">en toute simplicité</span>
              </h2>
              <p className="text-lg text-white/90 max-w-md leading-relaxed">
                Solution complète pour la gestion de stock, ventes, achats, crédits clients, consignations et caisse en FCFA.
              </p>
            </div>

            {/* Feature highlights with icons */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Truck, title: 'Livraisons', desc: 'Suivi fournisseurs' },
                { icon: Package, title: 'Stock', desc: 'Temps réel & inventaires' },
                { icon: BarChart3, title: 'Rapports', desc: 'Analyses & marges' },
                { icon: Users, title: 'Clients', desc: 'Crédits & retour emballages' },
              ].map((item, i) => (
                <div key={i} className="group relative rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-4 hover:bg-white/15 transition-all">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 group-hover:bg-white/25 transition-colors">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="relative mt-3">
                    <h3 className="font-semibold text-white">{item.title}</h3>
                    <p className="text-xs text-white/70">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom - Trust indicators */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/20">
            <div className="flex items-center gap-6 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span>Hors-ligne first</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span>Données chiffrées</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span>Conforme OHADA</span>
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <span>🇨🇮 FCFA</span>
              <span className="hidden sm:inline">•</span>
              <span>Local-first</span>
              <span className="hidden sm:inline">•</span>
              <span>v3.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="relative w-full lg:w-1/2 flex min-h-screen items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
              <LockKeyhole className="h-6 w-6 text-white" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 sm:p-8">
            {/* Header */}
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

            {/* Username field (only for login, not setup) */}
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

            {/* PIN Dots Indicator */}
            <div className="mb-4">
              <PinDotsIndicator length={currentInput.length} />
            </div>

            {/* Show/Hide PIN toggle (only during setup) */}
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

            {/* Status Error */}
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

            {/* Lockout */}
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

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-center text-sm font-medium text-rose-700 dark:text-rose-400 animate-shake"
                style={{
                  animation: 'shake 0.5s ease-in-out',
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <LockKeyhole className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* PIN Keypad */}
            <PinKeypad
              disabled={isLoading || loading}
              onDigit={handleDigit}
              onClear={handleClear}
              onBackspace={handleBackspace}
            />

            {/* Submit Button */}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={isLoading || loading || currentInput.length !== pinLength}
                onClick={() => void handleSubmit()}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-blue-700 disabled:shadow-none transition-all"
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
              </button>

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

            {/* Security notice */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">Sécurité :</span> Votre code PIN ne quitte jamais cet appareil.
                L'authentification est locale et chiffrée.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}