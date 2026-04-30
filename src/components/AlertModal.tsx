import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ModalTemplate } from './ModalTemplate';

interface AlertModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export function AlertModal({ isOpen, message, onClose }: AlertModalProps) {
  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title="Alerta de Sistema" 
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="text-center">
        <div className="mx-auto w-20 h-20 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
          <AlertCircle size={40} />
        </div>
        <p className="text-sm font-bold text-slate-300 uppercase tracking-tight mb-10 leading-relaxed italic">
          {message}
        </p>
        <button
          onClick={onClose}
          className="w-full py-4 bg-white text-black hover:bg-amber-600 hover:text-white font-black text-[10px] tracking-[0.3em] rounded-2xl transition-all uppercase shadow-lg shadow-black/20"
        >
          Entendido
        </button>
      </div>
    </ModalTemplate>
  );
}
