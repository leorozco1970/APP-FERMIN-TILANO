import React, { useState } from 'react';
import { 
  Sparkles, 
  Handshake, 
  ClipboardList, 
  Target, 
  Menu, 
  X, 
  ChevronRight,
  LogOut,
  Building2,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PasswordModal } from './PasswordModal';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Layout_Generic({ children, activeTab, setActiveTab }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const navItems = [
    { id: 'construccion-pfi', label: 'PLAN DE FORMACION INTEGRAL', subLabel: 'Estructuración P.F.I.', icon: ClipboardList },
    { id: 'proyectos', label: 'Estrategias de F.I.', subLabel: 'Gestión pedagógica', icon: Sparkles },
    { id: 'articulacion-curricular', label: 'Armonización Curricular', subLabel: 'Tejido Curricular', icon: Handshake },
    { id: 'plan-formacion', label: 'SEGUIMIENTO P.F.I.', subLabel: 'Logros y metas', icon: Target },
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30 selection:text-blue-200">
      {/* Mobile Header */}
      <div className="lg:hidden h-16 bg-slate-900/50 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-[60]">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/20">
            <Building2 size={20} className="text-white" />
          </div>
          <span className="font-black text-sm tracking-tighter uppercase italic">I.E. GENÉRICA</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-400">
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className="flex relative">
        {/* Sidebar */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="fixed lg:sticky top-0 h-screen w-80 bg-slate-950 border-r border-white/5 z-50 flex flex-col pt-8 pb-10"
            >
               <div className="px-8 mb-12">
                  <div className="flex items-center gap-4 group cursor-pointer">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-2xl shadow-2xl shadow-blue-900/40 group-hover:scale-110 transition-transform duration-500">
                      <Building2 size={28} className="text-white" />
                    </div>
                    <div className="flex flex-col">
                      <h1 className="text-xl font-black text-white italic tracking-tighter leading-none">P.F.I. MANAGER</h1>
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mt-1">SISTEMA GENÉRICO</span>
                    </div>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
                  <div className="space-y-2">
                    <div className="px-4 mb-4">
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Módulos de Formación</span>
                    </div>
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          if (window.innerWidth < 1024) setIsSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group relative ${
                          activeTab === item.id 
                            ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20' 
                            : 'hover:bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <item.icon size={20} className={`${activeTab === item.id ? 'text-white' : 'text-blue-500'} group-hover:scale-110 transition-transform`} />
                        <div className="flex flex-col items-start">
                          <span className="text-xs font-black uppercase tracking-tight italic leading-none mb-1">{item.label}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-widest ${activeTab === item.id ? 'text-blue-200' : 'text-slate-600'}`}>{item.subLabel}</span>
                        </div>
                        {activeTab === item.id && (
                          <motion.div layoutId="activePill" className="absolute left-1 w-1 h-8 bg-white rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="px-6 pt-6 border-t border-white/5 space-y-3">
                  {!isAuthenticated ? (
                    <button 
                      onClick={() => setIsAuthOpen(true)}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-slate-900 hover:bg-slate-800 text-slate-300 font-black text-[10px] tracking-[0.2em] rounded-2xl transition-all border border-white/5 uppercase"
                    >
                      <Lock size={14} /> Acceso Administrativo
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[10px] font-black text-emerald-500 tracking-widest uppercase">Admin OK</span>
                      </div>
                      <button 
                        onClick={() => setIsAuthenticated(false)}
                        className="p-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all border border-rose-500/20"
                      >
                        <LogOut size={18} />
                      </button>
                    </div>
                  )}
               </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 min-h-screen relative bg-[#020617]">
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
          
          <div className="relative z-10 p-4 lg:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: "circOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <PasswordModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          setIsAuthenticated(true);
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
}
