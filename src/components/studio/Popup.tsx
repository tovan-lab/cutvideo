import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface PopupProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'md' | 'xl';
  children: React.ReactNode;
}

const SIZE = {
  md: 'max-w-lg',
  xl: 'max-w-6xl',
};

/** Popup kính mờ nổi trên hệ mặt trời. Đóng bằng nút X, phím Esc hoặc bấm ra ngoài. */
export const Popup: React.FC<PopupProps> = ({ open, onClose, title, subtitle, icon, size = 'md', children }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-950/55 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            className={`relative w-full ${SIZE[size]} max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-[0_30px_120px_-20px_rgba(56,189,248,0.35)] overflow-hidden`}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
            <header className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-white/5">
              {icon && (
                <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-400/30 text-sky-300">
                  {icon}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{title}</h3>
                {subtitle && <div className="mt-1 text-xs text-slate-400">{subtitle}</div>}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
