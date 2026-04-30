import { CheckCircle2, AlertCircle, AlertTriangle, Info, Bell } from 'lucide-react';
import { ModalTemplate } from './ModalTemplate';

interface MessageModalProps {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  onClose: () => void;
}

export function MessageModal({ 
  isOpen, 
  type, 
  title = "NOTIFICACIÓN DE SISTEMA", 
  message, 
  onClose 
}: MessageModalProps) {
  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          text: 'text-emerald-400',
          iconBg: 'bg-emerald-500/10',
          iconBorder: 'border-emerald-500/20',
          iconShadow: 'shadow-[0_0_50px_rgba(16,185,129,0.3)]',
          icon: <CheckCircle2 size={40} className="text-emerald-500" />,
          btn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_10px_20px_rgba(5,150,105,0.3)]'
        };
      case 'error':
        return {
          text: 'text-rose-400',
          iconBg: 'bg-rose-500/10',
          iconBorder: 'border-rose-500/20',
          iconShadow: 'shadow-[0_0_50px_rgba(244,63,94,0.3)]',
          icon: <AlertCircle size={40} className="text-rose-500" />,
          btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-[0_10px_20px_rgba(225,29,72,0.3)]'
        };
      case 'warning':
        return {
          text: 'text-amber-400',
          iconBg: 'bg-amber-500/10',
          iconBorder: 'border-amber-500/20',
          iconShadow: 'shadow-[0_0_50px_rgba(245,158,11,0.3)]',
          icon: <AlertTriangle size={40} className="text-amber-500" />,
          btn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-[0_10px_20px_rgba(217,119,6,0.3)]'
        };
      case 'info':
      default:
        return {
          text: 'text-blue-400',
          iconBg: 'bg-blue-500/10',
          iconBorder: 'border-blue-500/20',
          iconShadow: 'shadow-[0_0_50px_rgba(59,130,246,0.3)]',
          icon: <Info size={40} className="text-blue-500" />,
          btn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)]'
        };
    }
  };

  const style = getStyle();

  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title={title} 
      onClose={onClose}
      maxWidth="max-w-md"
      hideHeader={true}
    >
      <div className="text-center">
        <div className="flex justify-center mb-8">
          <div className={`w-28 h-28 ${style.iconBg} rounded-[3rem] flex items-center justify-center border border-white/5 ${style.iconShadow} relative overflow-hidden group`}>
             <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50 transition-opacity" />
             <div className="relative">
               {style.icon}
             </div>
          </div>
        </div>
        
        <div className="space-y-6 mb-12">
           <h4 className={`text-2xl font-black tracking-tighter uppercase italic ${style.text} drop-shadow-sm`}>
             {type === 'error' ? 'ALERTA DE SISTEMA' : 
              type === 'success' ? 'ÉXITO TOTAL' : 
              type === 'warning' ? 'ADVERTENCIA' : 'NOTIFICACIÓN'}
           </h4>
           <div className="h-1 w-16 bg-white/5 mx-auto rounded-full" />
           <p className="text-base font-medium text-slate-400 uppercase tracking-tight leading-relaxed max-w-sm mx-auto italic px-4">
             {message}
           </p>
        </div>
 
        <button
          type="button"
          onClick={onClose}
          className={`w-full py-6 font-black text-[12px] tracking-[0.5em] rounded-[2rem] transition-all uppercase italic active:scale-[0.98] border border-white/10 ${style.btn}`}
        >
          CONTINUAR
        </button>
      </div>
    </ModalTemplate>
  );
}
