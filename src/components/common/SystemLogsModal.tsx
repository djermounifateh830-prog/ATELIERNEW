import React from 'react';
import { SystemLogsViewer } from './SystemLogsViewer';

interface SystemLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  extraSystemInfo?: any;
}

export const SystemLogsModal: React.FC<SystemLogsModalProps> = ({
  isOpen,
  onClose,
  extraSystemInfo
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        <SystemLogsViewer
          extraSystemInfo={extraSystemInfo}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
