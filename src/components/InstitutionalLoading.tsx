import React from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  message?: string;
  fullScreen?: boolean;
}

export const InstitutionalLoading = ({ message = "Sincronizando con el Servidor Institucional...", fullScreen = false }: Props) => {
  const content = (
    <div className="flex flex-col items-center justify-center p-12">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-blue-600/10 border-t-blue-600 animate-spin" />
        <RefreshCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500/50 animate-pulse" size={24} />
      </div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center max-w-xs leading-relaxed animate-pulse">
        {message}
      </p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#020617]/80 backdrop-blur-md flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
};
