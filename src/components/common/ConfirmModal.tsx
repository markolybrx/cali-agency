import React from 'react';
import type { ThemeTokens } from '../../theme/themes';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface ConfirmModalProps {
  state: ConfirmState | null;
  onCancel: () => void;
  t: ThemeTokens;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ state, onCancel, t }) => {
  if (!state) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-sm rounded-3xl border border-rose-500/40 p-5 space-y-4 shadow-2xl ${t.overlay}`}>
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-rose-400">Danger Zone Confirmation</div>
          <h3 className="text-base font-semibold">{state.title}</h3>
          <p className="text-xs opacity-80 leading-relaxed">{state.message}</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 py-2.5 rounded-full text-xs font-medium border cursor-pointer ${t.secondaryBtn}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              state.onConfirm();
              onCancel();
            }}
            className="flex-1 py-2.5 rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
