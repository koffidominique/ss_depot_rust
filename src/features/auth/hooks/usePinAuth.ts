import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../services/api/createApiClient.ts";
import { ApiError } from "../../../services/api/ApiClient.ts";
import { useUiStore } from "../../../stores/uiStore.ts";

const PIN_LENGTH = 6;

export function usePinAuth() {
  const navigate = useNavigate();
  const setToken = useUiStore((s) => s.setToken);
  const setCurrentUser = useUiStore((s) => s.setCurrentUser);

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusReloadTick, setStatusReloadTick] = useState(0);
  const [remainingLockSeconds, setRemainingLockSeconds] = useState(0);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupStep, setSetupStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAuthStatus()
      .then((s) => {
        if (cancelled) return;
        if (s.authenticated === true) {
          const currentToken = useUiStore.getState().token;
          setToken(currentToken || "cookie-session");
          if (s.user) setCurrentUser(s.user);
          navigate("/", { replace: true });
          return;
        }
        if (s.authenticated === false && useUiStore.getState().token) {
          setToken(null);
        }
        setStatusError(null);
        setNeedsSetup(s.needsSetup);
        if (s.lockedUntil) {
          const secs = Math.ceil(
            (new Date(s.lockedUntil).getTime() - Date.now()) / 1000,
          );
          setRemainingLockSeconds(secs > 0 ? secs : 0);
        } else {
          setRemainingLockSeconds(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusError("Impossible de contacter le serveur local DEPOTPRO.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, setCurrentUser, setToken, statusReloadTick]);

  useEffect(() => {
    if (remainingLockSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingLockSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remainingLockSeconds]);

  const currentInput = setupStep === "confirm" ? confirmPin : pin;

  const handleDigit = useCallback(
    (d: string) => {
      if (loading || needsSetup === null) return;
      setError(null);
      if (setupStep === "confirm") {
        setConfirmPin((prev) => (prev.length < PIN_LENGTH ? prev + d : prev));
      } else {
        setPin((prev) => (prev.length < PIN_LENGTH ? prev + d : prev));
      }
    },
    [loading, needsSetup, setupStep],
  );

  const handleBackspace = useCallback(() => {
    if (loading || needsSetup === null) return;
    setError(null);
    if (setupStep === "confirm") {
      setConfirmPin((prev) => prev.slice(0, -1));
    } else {
      setPin((prev) => prev.slice(0, -1));
    }
  }, [loading, needsSetup, setupStep]);

  const handleClear = useCallback(() => {
    setPin("");
    setConfirmPin("");
    setSetupStep("enter");
    setError(null);
  }, []);

  const handleBackToEnter = useCallback(() => {
    setSetupStep("enter");
    setConfirmPin("");
    setError(null);
  }, []);

  const retryStatus = useCallback(() => {
    setStatusError(null);
    setStatusReloadTick((t) => t + 1);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (loading || needsSetup === null) return;
    setError(null);

    if (needsSetup) {
      if (setupStep === "enter") {
        if (pin.length !== PIN_LENGTH) {
          setError(`Veuillez saisir ${PIN_LENGTH} chiffres.`);
          return;
        }
        setSetupStep("confirm");
        return;
      }
      if (confirmPin !== pin) {
        setError("Les deux codes PIN ne correspondent pas.");
        setConfirmPin("");
        return;
      }
      setLoading(true);
      try {
        const res = await apiClient.setupPin(pin);
        setToken(res.token);
        if (res.user) setCurrentUser(res.user);
        navigate("/", { replace: true });
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Erreur lors de la configuration.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (pin.length !== PIN_LENGTH) {
      setError(`Saisissez votre code PIN à ${PIN_LENGTH} chiffres.`);
      return;
    }

    setLoading(true);
    try {
      const cleanUser = username.trim();
      const res = cleanUser
        ? await apiClient.login(pin, cleanUser)
        : await apiClient.login(pin);
      setToken(res.token);
      if (res.user) setCurrentUser(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "PIN_NOT_CONFIGURED") {
        setNeedsSetup(true);
        setSetupStep("enter");
        setPin("");
        setConfirmPin("");
        setError("Aucun PIN configuré. Veuillez créer votre PIN propriétaire.");
      } else {
        if (err instanceof ApiError && err.code === "PIN_LOCKED") {
          setStatusReloadTick((t) => t + 1);
        }
        setError(
          err instanceof ApiError ? err.message : "Authentification refusée.",
        );
        setPin("");
      }
    } finally {
      setLoading(false);
    }
  }, [
    confirmPin,
    loading,
    navigate,
    needsSetup,
    pin,
    setCurrentUser,
    setToken,
    setupStep,
    username,
  ]);

  const handlersRef = useRef({ handleDigit, handleBackspace, handleSubmit });
  useEffect(() => {
    handlersRef.current = { handleDigit, handleBackspace, handleSubmit };
  }, [handleDigit, handleBackspace, handleSubmit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (
        e.target instanceof HTMLButtonElement &&
        e.target.getAttribute("aria-label") === "Changer de thème"
      ) {
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handlersRef.current.handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handlersRef.current.handleBackspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void handlersRef.current.handleSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
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
    pinLength: PIN_LENGTH,
  };
}
