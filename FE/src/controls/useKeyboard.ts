import { useEffect, useRef } from 'react';

export interface UseKeyboardOptions {
  disabled?: boolean;
  onManualInput?: () => void;
}

export function useKeyboard({ disabled = false, onManualInput }: UseKeyboardOptions = {}) {
  const keysPressedRef = useRef<Set<string>>(new Set());
  const onManualInputRef = useRef(onManualInput);
  onManualInputRef.current = onManualInput;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        keysPressedRef.current.add(key);
        onManualInputRef.current?.();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressedRef.current.delete(key);
    };

    const handleBlur = () => {
      keysPressedRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [disabled]);

  return keysPressedRef;
}
