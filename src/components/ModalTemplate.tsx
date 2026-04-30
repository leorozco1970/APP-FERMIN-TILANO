import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ModalTemplateProps {
  isOpen: boolean;
  onClose?: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  hideHeader?: boolean;
}

export function ModalTemplate({ 
  isOpen, 
  onClose, 
  title, 
  subtitle = "Gestión Pedagógica Integral", 
  children,
  maxWidth = "max-w-xl",
  hideHeader = false
}: ModalTemplateProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/95 backdrop-blur-2xl" 
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`bg-[#1A1A1A] rounded-[3rem] shadow-[0_40px_100px_-15px_rgba(0,0,0,0.8)] ${maxWidth} w-full overflow-hidden border border-white/10 relative group z-10 flex flex-col max-h-[90vh]`}
          >
            {/* Conditional header */}
            {!hideHeader && (
              <div className="bg-[#0A1128] px-10 py-10 text-white relative shrink-0">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
                
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-[#D4AF37] text-[10px] font-black tracking-[0.4em] uppercase mb-4 opacity-100 drop-shadow-[0_0_8px_rgba(212,175,55,0.4)] italic">
                      {subtitle}
                    </p>
                    <h3 className="text-2xl lg:text-3xl font-black tracking-tighter uppercase leading-none font-headings italic">
                      INSTITUCIÓN EDUCATIVA <br/>
                      <span className="text-white/40">FERMÍN TILANO</span>
                    </h3>
                  </div>
                  
                  {onClose && (
                    <button 
                      onClick={onClose}
                      className="p-3 text-white/20 hover:text-white hover:bg-white/5 rounded-2xl transition-all z-20 -mr-4 -mt-4 active:scale-90"
                    >
                      <X size={24} />
                    </button>
                  )}
                </div>
                
                <div className="mt-8 flex items-center gap-4">
                   <div className="h-0.5 w-12 bg-blue-600 rounded-full"></div>
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] italic">{title}</span>
                </div>
              </div>
            )}

            {hideHeader && onClose && (
               <button 
                onClick={onClose}
                className="absolute top-8 right-8 p-3 text-white/20 hover:text-white hover:bg-white/5 rounded-2xl transition-all z-50 active:scale-90"
              >
                <X size={24} />
              </button>
            )}

            {/* Content Body */}
            <div className={`overflow-y-auto custom-scrollbar ${hideHeader ? 'p-12' : 'p-10'}`}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
