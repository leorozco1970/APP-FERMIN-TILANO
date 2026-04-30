import React from 'react';
import { ModalTemplate } from './ModalTemplate';
import { HelpCircle, AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
}

export function ConfirmModal({ 
  isOpen, 
  title = "CONFIRMACIÓN DE ACCIÓN", 
  message, 
  onConfirm, 
  onCancel,
  confirmLabel = "ACEPTAR",
  cancelLabel = "CANCELAR",
  isDangerous = false
}: ConfirmModalProps) {
  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title={title} 
      onClose={onCancel}
      maxWidth="max-w-md"
      hideHeader={true}
    >
      <div className="text-center">
        <div className={`mx-auto w-28 h-28 ${isDangerous ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 shadow-[0_0_50px_rgba(244,63,94,0.3)]' : 'bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.3)]'} border-2 rounded-[3rem] flex items-center justify-center mb-10 relative overflow-hidden group`}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {isDangerous ? <AlertCircle size={48} /> : <HelpCircle size={48} />}
        </div>

        <div className="space-y-6 mb-12">
           <h4 className={`text-2xl font-black tracking-tighter uppercase italic drop-shadow-sm ${isDangerous ? 'text-rose-400' : 'text-blue-400'}`}>
             VERIFICACIÓN
           </h4>
           <div className="h-1 w-16 bg-white/5 mx-auto rounded-full" />
           <p className="text-base font-medium text-slate-400 uppercase tracking-tight leading-relaxed max-w-sm mx-auto italic px-4">
             {message}
           </p>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-6 bg-white/5 hover:bg-white/10 text-slate-500 font-black text-[11px] tracking-[0.4em] rounded-[1.8rem] transition-all uppercase border border-white/5 italic active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-6 ${isDangerous ? 'bg-rose-600 hover:bg-rose-700 shadow-[0_10px_20px_rgba(225,29,72,0.3)]' : 'bg-blue-600 hover:bg-blue-700 shadow-[0_10px_20px_rgba(37,99,235,0.3)]'} text-white font-black text-[11px] tracking-[0.4em] rounded-[1.8rem] transition-all uppercase italic active:scale-[0.98] border border-white/10`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalTemplate>
  );
}
