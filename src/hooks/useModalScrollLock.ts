'use client';

import { useEffect, RefObject } from 'react';

let activeModalsCount = 0;
let originalBodyOverflow = '';
let originalHtmlOverflow = '';
let originalBodyPaddingRight = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (activeModalsCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    originalHtmlOverflow = document.documentElement.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeModalsCount++;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeModalsCount = Math.max(0, activeModalsCount - 1);
    if (activeModalsCount === 0) {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.paddingRight = originalBodyPaddingRight;
    }
  };
}

/**
 * Hook to lock background scrolling when any modal is open (TRK-18).
 * - Locks both document.body and document.documentElement with overflow: hidden.
 * - Adds non-passive wheel and touchmove listeners that prevent scrolling when
 *   the cursor is outside the modal card (on backdrop or background).
 * - Allows scrolling inside elements marked with [data-modal-content="true"].
 */
export function useModalScrollLock(
  isOpen: boolean,
  modalContentRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!isOpen) return;

    const releaseScroll = lockBodyScroll();

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (modalContentRef?.current) {
        if (!modalContentRef.current.contains(target)) {
          e.preventDefault();
        }
      } else {
        const isInsideModalContent = target.closest(
          '[data-modal-content="true"], [data-testid="modal-content"]'
        );
        if (!isInsideModalContent) {
          e.preventDefault();
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (modalContentRef?.current) {
        if (!modalContentRef.current.contains(target)) {
          e.preventDefault();
        }
      } else {
        const isInsideModalContent = target.closest(
          '[data-modal-content="true"], [data-testid="modal-content"]'
        );
        if (!isInsideModalContent) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      releaseScroll();
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isOpen, modalContentRef]);
}

export function _resetModalScrollLockForTesting(): void {
  activeModalsCount = 0;
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}
