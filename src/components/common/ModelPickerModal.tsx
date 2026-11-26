import React, { useMemo, useState } from 'react';
import type { KeySlotId } from '../../types/agency';
import type { ThemeTokens } from '../../theme/themes';

interface ModelPickerModalProps {
  open: boolean;
  keyId: KeySlotId | null;
  models: string[];
  selectedModel: string;
  onSelect: (model: string) => void;
  onClose: () => void;
  t: ThemeTokens;
}

export const ModelPickerModal: React.FC<ModelPickerModalProps> = ({
  open,
  keyId,
  models,
  selectedModel,
  onSelect,
  onClose,
  t
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
  }, [models, query]);

  if (!open || !keyId) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-md rounded-3xl border border-current/15 p-5 space-y-3.5 shadow-2xl max-h-[78%] flex flex-col ${t.overlay}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent">{keyId} Model Selector</div>
            <h3 className="text-base font-semibold">Choose Gemini Model</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer ${t.secondaryBtn}`}
          >
            Done
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter detected models..."
          className={`w-full px-3.5 py-2.5 rounded-2xl text-xs border focus:outline-none ${t.input}`}
        />

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-6">No matching models.</p>
          ) : (
            filtered.map((m) => {
              const isSelected = m === selectedModel;
              const isRecommended = m.includes('3.1-flash-lite');
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onSelect(m);
                    setQuery('');
                    onClose();
                  }}
                  className={`w-full rounded-2xl border px-3.5 py-3 text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                    isSelected ? t.accentCard : t.surface
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-medium truncate">{m}</div>
                    {isRecommended && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-accent">Recommended for Agency</span>
                    )}
                  </div>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${isSelected ? t.primaryBtn : 'border-current/25'}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
