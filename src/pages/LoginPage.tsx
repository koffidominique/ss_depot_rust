import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Delete, ShieldCheck, LockKeyhole, Sun, Moon } from 'lucide-react';
import { Logo } from '../components/common/Logo.tsx';
import { apiClient } from '../services/api/createApiClient.ts';
import { ApiError } from '../services/api/ApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';

export function LoginPage() {
  const navigate = useNavigate();
  const setToken = useUiStore((s) => s.setToken);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupStep, setSetupStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient
      .getAuthStatus()
      .then((s) => setNeedsSetup(s.needsSetup))
      .catch(() => setError("Impossible de contacter le serveur local DEPOTPRO."));
  }, []);

  const currentInput = setupStep === 'confirm' ? confirmPin : pin;
  const setCurrentInput = setupStep === 'confirm' ? setConfirmPin : setPin;

  const handleDigit = (d: string) => {
    if (loading) return;
    setError(null);
    if (currentInput.length < 6) {
      setCurrentInput(currentInput + d);
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    setError(null);
    setCurrentInput(currentInput.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);

    if (needsSetup) {
      if (setupStep === 'enter') {
        if (pin.length !== 6) {
          setError('Veuillez saisir 6 chiffres.');
          return;
        }
        setSetupStep('confirm');
        return;
      }
      if (confirmPin !== pin) {
        setError('Les deux codes PIN ne correspondent pas.');
        setConfirmPin('');
        return;
      }
      setLoading(true);
      try {
        const res = await apiClient.setupPin(pin);
        setToken(res.token);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Erreur lors de la configuration.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (pin.length !== 6) {
      setError('Saisissez votre code PIN à 6 chiffres.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.login(pin);
      setToken(res.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentification refusée.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
            {needsSetup ? (
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
            {needsSetup
              ? 'Aucun code par défaut n’est défini. Choisissez un PIN personnel à 6 chiffres.'
              : 'Saisissez votre code PIN à 6 chiffres pour déverrouiller la gestion du dépôt.'}
          </p>
        </div>

        {/* 6 indicateurs PIN */}
        <div className="mt-6 flex justify-center gap-3" aria-label="Indicateur de code PIN">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${
                i < currentInput.length
                  ? 'border-[#2563EB] bg-[#2563EB] scale-110'
                  : 'border-slate-300 dark:border-slate-700 bg-transparent'
              }`}
            />
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-center text-xs font-medium text-[#DC4545] dark:text-rose-400"
          >
            {error}
          </div>
        )}

        {/* Clavier numérique */}
        <div className="mt-6 grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 font-mono-num text-lg font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPin('');
              setConfirmPin('');
              setSetupStep('enter');
              setError(null);
            }}
            className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-[#667085] dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Effacer
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 font-mono-num text-lg font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Supprimer un chiffre"
            onClick={handleBackspace}
            className="flex h-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Delete className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={loading || currentInput.length !== 6}
          onClick={handleSubmit}
          className="mt-5 w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          {loading
            ? 'Vérification...'
            : needsSetup
            ? setupStep === 'enter'
              ? 'Continuer'
              : 'Enregistrer et accéder'
            : 'Déverrouiller'}
        </button>
      </div>
    </div>
  );
}
