import React from 'react';
import { SearchX } from 'lucide-react';
import { ModalTemplate } from './ModalTemplate';

interface NoDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NoDataModal({ isOpen, onClose }: NoDataModalProps) {
  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title="VALIDACIÓN DE INFORMACIÓN" 
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="text-center py-4">
        <div className="flex justify-center mb-10">
           <div className="w-24 h-24 bg-blue-500/10 rounded-[2.5rem] flex items-center justify-center border-2 border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.3)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <SearchX size={40} className="text-blue-500" />
              </div>
           </div>
        </div>
        
        <div className="space-y-4 mb-10">
           <h4 className="text-xl font-black tracking-tighter uppercase text-blue-400 italic">
             AUSENCIA DE REGISTROS
           </h4>
           <div className="h-1 w-12 bg-white/10 mx-auto rounded-full" />
           <p className="text-sm font-bold text-slate-300 uppercase tracking-tight leading-relaxed max-w-xs mx-auto italic">
             NO SE DETECTARON REPORTES CONSOLIDADOS PARA EL PERIODO SELECCIONADO. POR FAVOR, VERIFIQUE LA CARGA ACADÉMICA Y SINCRONIZACIÓN DE DATOS.
           </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)] font-black text-[11px] tracking-[0.4em] rounded-[1.5rem] transition-all uppercase italic active:scale-[0.98]"
        >
          CONTINUAR
        </button>
      </div>
    </ModalTemplate>
  );
}
