import React from 'react';
import {
  AlertTriangle,
  HelpCircle,
  Save,
  Trash2,
  CheckCircle,
  X,
  AlertCircle
} from 'lucide-react';

export type ConfirmationType = 'save' | 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: ConfirmationType;
  details?: string[];
  isProcessing?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  type = 'save',
  details = [],
  isProcessing = false,
  onConfirm,
  onClose
}) => {
  if (!isOpen) return null;

  const getStyle = () => {
    switch (type) {
      case 'danger':
        return {
          icon: <Trash2 className="w-6 h-6 text-rose-400" />,
          iconBg: 'bg-rose-950/80 border-rose-800/80 text-rose-400 ring-4 ring-rose-500/10',
          btnBg: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40',
          borderTop: 'border-rose-500'
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-amber-400" />,
          iconBg: 'bg-amber-950/80 border-amber-800/80 text-amber-400 ring-4 ring-amber-500/10',
          btnBg: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-900/40 font-black',
          borderTop: 'border-amber-500'
        };
      case 'info':
        return {
          icon: <AlertCircle className="w-6 h-6 text-sky-400" />,
          iconBg: 'bg-sky-950/80 border-sky-800/80 text-sky-400 ring-4 ring-sky-500/10',
          btnBg: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-900/40 font-bold',
          borderTop: 'border-sky-500'
        };
      case 'save':
      default:
        return {
          icon: <Save className="w-6 h-6 text-emerald-400" />,
          iconBg: 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400 ring-4 ring-emerald-500/10',
          btnBg: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 font-bold',
          borderTop: 'border-emerald-500'
        };
    }
  };

  const style = getStyle();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className={`bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 border-t-4 ${style.borderTop}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${style.iconBg}`}>
            {style.icon}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <div className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              {message}
            </div>

            {details && details.length > 0 && (
              <ul className="mt-2.5 space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300">
                {details.map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer disabled:opacity-40"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className={`px-5 py-2 text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-40 ${style.btnBg}`}
          >
            {isProcessing && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
