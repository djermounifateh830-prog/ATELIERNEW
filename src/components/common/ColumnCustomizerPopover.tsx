import React, { useState, useEffect, useRef } from 'react';
import { SlidersHorizontal, Check, RotateCcw, X, Eye } from 'lucide-react';
import { columnConfigService, TableId, TABLE_COLUMNS_DEFINITIONS } from '../../services/columnConfigService';

interface ColumnCustomizerPopoverProps {
  tableId: TableId;
  align?: 'left' | 'right';
}

export const ColumnCustomizerPopover: React.FC<ColumnCustomizerPopoverProps> = ({
  tableId,
  align = 'right'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [, setTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = columnConfigService.subscribe(() => {
      setTick(t => t + 1);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const tableDef = TABLE_COLUMNS_DEFINITIONS[tableId];
  if (!tableDef) return null;

  const visibleCount = tableDef.columns.filter(c => columnConfigService.isColumnVisible(tableId, c.id)).length;
  const totalCount = tableDef.columns.length;

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Personnaliser les colonnes affichées pour ce tableau"
        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
          isOpen
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border-slate-700/80'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline">Colonnes</span>
        <span className="text-[10px] font-mono px-1 rounded bg-slate-900/80 text-amber-300 border border-slate-700">
          {visibleCount}/{totalCount}
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute z-40 mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 text-slate-100 text-xs ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>Colonnes visibles</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between text-[11px] mb-2 px-1 text-slate-400">
            <button
              type="button"
              onClick={() => columnConfigService.setAllColumns(tableId, true)}
              className="hover:text-sky-300 hover:underline cursor-pointer"
            >
              Tout afficher
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => columnConfigService.resetTable(tableId)}
              className="hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Par défaut</span>
            </button>
          </div>

          {/* List of Columns */}
          <div className="max-h-60 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            {tableDef.columns.map(col => {
              const isVisible = columnConfigService.isColumnVisible(tableId, col.id);
              const isAction = col.id === 'actions';

              return (
                <label
                  key={col.id}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition cursor-pointer select-none ${
                    isVisible
                      ? 'bg-slate-800/60 border-slate-700/60 text-slate-100'
                      : 'bg-slate-950/40 border-slate-800/50 text-slate-500'
                  } ${isAction ? 'opacity-70 cursor-not-allowed' : 'hover:border-amber-500/40'}`}
                >
                  <span className="truncate pr-2 font-medium">{col.label}</span>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={isAction}
                    onChange={() => {
                      if (!isAction) {
                        columnConfigService.toggleColumn(tableId, col.id);
                      }
                    }}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
