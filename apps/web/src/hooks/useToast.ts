import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { ToastTone } from '../components/ToastRegion';

export function useToast() {
  const [toastMessage, setToastMessage] = useState('');
  const [toastTone, setToastTone] = useState<ToastTone>('success');
  const [toastVersion, setToastVersion] = useState(0);
  const [isToastClosing, setIsToastClosing] = useState(false);
  const toastDismissTimeoutRef = useRef<number | null>(null);
  const toastCloseTimeoutRef = useRef<number | null>(null);
  const toastTouchStartYRef = useRef<number | null>(null);

  function clearToastTimers() {
    if (toastDismissTimeoutRef.current !== null) {
      window.clearTimeout(toastDismissTimeoutRef.current);
      toastDismissTimeoutRef.current = null;
    }

    if (toastCloseTimeoutRef.current !== null) {
      window.clearTimeout(toastCloseTimeoutRef.current);
      toastCloseTimeoutRef.current = null;
    }
  }

  function dismissToast() {
    if (!toastMessage || isToastClosing) {
      return;
    }

    clearToastTimers();
    setIsToastClosing(true);
    toastCloseTimeoutRef.current = window.setTimeout(() => {
      setToastMessage('');
      setIsToastClosing(false);
      toastCloseTimeoutRef.current = null;
    }, 220);
  }

  function showToast(nextMessage: string, tone: ToastTone = 'success') {
    if (!nextMessage.trim()) {
      return;
    }

    clearToastTimers();
    setIsToastClosing(false);
    setToastTone(tone);
    setToastMessage(nextMessage);
    setToastVersion((currentVersion) => currentVersion + 1);
  }

  function clearToast() {
    clearToastTimers();
    setToastMessage('');
    setIsToastClosing(false);
  }

  function handleToastTouchStart(event: TouchEvent<HTMLDivElement>) {
    toastTouchStartYRef.current = event.changedTouches[0]?.clientY ?? null;
  }

  function handleToastTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startY = toastTouchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY ?? null;

    toastTouchStartYRef.current = null;

    if (startY === null || endY === null) {
      return;
    }

    if (endY - startY >= 36) {
      dismissToast();
    }
  }

  function handleToastTouchCancel() {
    toastTouchStartYRef.current = null;
  }

  useEffect(() => {
    if (!toastMessage) {
      clearToastTimers();
      return undefined;
    }

    setIsToastClosing(false);
    clearToastTimers();
    toastDismissTimeoutRef.current = window.setTimeout(() => {
      dismissToast();
    }, 5000);

    return () => {
      if (toastDismissTimeoutRef.current !== null) {
        window.clearTimeout(toastDismissTimeoutRef.current);
        toastDismissTimeoutRef.current = null;
      }
    };
  }, [toastMessage, toastVersion]);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, []);

  return {
    toastMessage,
    toastTone,
    toastVersion,
    isToastClosing,
    showToast,
    dismissToast,
    clearToast,
    handleToastTouchStart,
    handleToastTouchEnd,
    handleToastTouchCancel,
  };
}