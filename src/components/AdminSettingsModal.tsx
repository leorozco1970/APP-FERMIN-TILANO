import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, query, orderBy, limit, getDocs, writeBatch } from 'firebase/firestore';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { formatName } from '../lib/formatter';
import { useCustomLists } from '../hooks/useCustomLists';
import { ShieldCheck, CheckCircle2, AlertCircle, Settings, KeyRound, RefreshCw, Trash2, Users, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { ModalTemplate } from './ModalTemplate';

interface AdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSettingsModal({ isOpen, onClose }: AdminSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'master' | 'pins' | 'history'>('master');

  // Master password state
  const [passwordToChange, setPasswordToChange] = useState<'docentePassword' | 'adminPassword'>('docentePassword');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Teachers PIN state
  const { docentes } = useCustomLists();
  const [teacherPins, setTeacherPins] = useState<Record<string, string>>({});
  
  // Login History state
  const [history, setHistory] = useState<any[]>([]);
  
  // Delete History Confirmation state
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'login_history'), orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(data);
      // Cache in localStorage to respect "Costo Cero"
      localStorage.setItem('admin_login_history_cache', JSON.stringify(data));
    } catch (err) {
      console.error(err);
      setError('ERROR AL CARGAR EL HISTORIAL DE ACCESO.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'pins') loadPins();
      if (activeTab === 'history') {
        const cached = localStorage.getItem('admin_login_history_cache');
        if (cached && history.length === 0) {
          try {
            setHistory(JSON.parse(cached));
          } catch (e) {
            fetchHistory();
          }
        } else {
          fetchHistory();
        }
      }
    }
  }, [isOpen, activeTab]);

  const loadPins = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'docentes_pins'));
      if (snap.exists()) {
        const pinsData = snap.data().pins || {};
        setTeacherPins(pinsData);
        localStorage.setItem('docentes_pins_cache', JSON.stringify(pinsData));
      }
    } catch (e) { console.error(e); }
  };

  const deleteHistory = async () => {
    setIsConfirmDeleteOpen(false);
    
    try {
      setLoading(true);
      setError('');
      const q = query(collection(db, 'login_history'));
      const snap = await getDocs(q);
      
      const chunks = Array.from({ length: Math.ceil(snap.docs.length / 500) }, (_, i) =>
        snap.docs.slice(i * 500, (i + 1) * 500)
      );

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      
      setHistory([]);
      localStorage.removeItem('admin_login_history_cache');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      setError('ERROR AL ELIMINAR EL HISTORIAL.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('LAS CONTRASEÑAS NO COINCIDEN.');
      return;
    }
    if (newPassword.length < 4) {
      setError('LA CLAVE DEBE TENER AL MENOS 4 CARACTERES.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await setDoc(doc(db, 'settings', 'auth'), { [passwordToChange]: newPassword }, { merge: true });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError('ERROR AL ACTUALIZAR LA CONTRASEÑA.');
    } finally {
      setLoading(false);
    }
  };

  const savePin = async (docente: string, val: string) => {
    try {
      const newPins = { ...teacherPins, [docente]: val };
      setTeacherPins(newPins);
      // Actualizamos solo el estado local para fluidez, y persistimos
      localStorage.setItem('docentes_pins_cache', JSON.stringify(newPins));
      
      // Para costo cero, podríamos usar un botón de "Guardar Cambios", 
      // pero el usuario pidió no cambiar estructura visual.
      // Escribiremos a Firebase pero con precaución.
      await setDoc(doc(db, 'settings', 'docentes_pins'), { pins: newPins }, { merge: true });
    } catch (e) {
      console.error(e);
      setError('ERROR AL GUARDAR LA CLAVE DE ACCESO DEL DOCENTE.');
    }
  }

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess(false);
    setActiveTab('master');
    onClose();
  };

  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title="Configuración de Accesos" 
      onClose={handleClose}
      maxWidth="max-w-2xl"
    >
      <div className="flex items-center gap-6 mb-10 relative z-10">
        <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-[1.5rem] flex items-center justify-center text-blue-500 shadow-xl shadow-blue-900/10 transform rotate-3 hover:rotate-0 transition-transform duration-500">
          <ShieldCheck size={32} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white tracking-tighter uppercase italic leading-none mb-2">Panel Directivo</h3>
          <p className="text-[10px] font-black text-blue-400/80 uppercase tracking-[0.4em] italic">ADMINISTRACIÓN DE SEGURIDAD</p>
        </div>
      </div>
      
      {success && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-emerald-500/10 text-emerald-400 p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 flex items-center gap-4 shrink-0 italic"
        >
          <CheckCircle2 size={18} /> LOS CAMBIOS SE GUARDARON CORRECTAMENTE.
        </motion.div>
      )}
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-rose-500/10 text-rose-400 p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-500/20 flex items-center gap-4 shrink-0 italic"
        >
          <AlertCircle size={18} /> {error}
        </motion.div>
      )}

      <LayoutGroup>
        <div className="flex bg-[#0F172A]/80 p-2 rounded-[2rem] mb-10 border border-white/5 shrink-0 shadow-2xl backdrop-blur-md relative z-10">
          {[
            { id: 'master', label: 'ACCESOS MAESTROS' },
            { id: 'pins', label: 'CLAVES DOCENTES' },
            { id: 'history', label: 'BITÁCORA' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`flex-1 px-4 py-4 font-black text-[10px] tracking-[0.25em] transition-all duration-700 rounded-[1.5rem] relative group/tab overflow-hidden ${activeTab === tab.id ? 'text-black italic' : 'text-slate-500 hover:text-white'}`}
              onClick={() => { setActiveTab(tab.id as any); setError(''); setSuccess(false); }}
            >
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTabBadge"
                  className="absolute inset-0 bg-white"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'master' && (
            <motion.form 
              key="master"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleSubmitMaster} 
              className="space-y-8"
            >
              <div className="bg-white/5 p-8 rounded-[2rem] border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl group-hover:bg-blue-600/10 transition-colors duration-700" />
                
                <div className="mb-8">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-1 italic">
                    OBJETIVO DE MODIFICACIÓN
                  </label>
                  <div className="relative">
                    <select
                      value={passwordToChange}
                      onChange={(e) => setPasswordToChange(e.target.value as 'docentePassword' | 'adminPassword')}
                      className="w-full appearance-none rounded-2xl border border-white/10 px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 bg-black/20 font-black text-[11px] text-white tracking-widest uppercase transition-all shadow-inner italic"
                    >
                      <option value="docentePassword">Clave General Docentes / Administrativos</option>
                      <option value="adminPassword">Clave Maestra Directivos</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-6 pointer-events-none text-slate-500">
                      <Settings size={14} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-1 italic">
                      NUEVA CLAVE
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 bg-black/20 font-mono text-xl tracking-[0.5em] text-white transition-all shadow-inner placeholder:text-white/10 italic text-center"
                      required
                      placeholder="••••"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-1 italic">
                      CONFIRMAR CLAVE
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 bg-black/20 font-mono text-xl tracking-[0.5em] text-white transition-all shadow-inner placeholder:text-white/10 italic text-center"
                      required
                      placeholder="••••"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-white text-black rounded-2xl hover:bg-blue-600 hover:text-white transition-all font-black text-[11px] tracking-[0.3em] shadow-[0_20px_40px_-10px_rgba(255,255,255,0.1)] active:scale-95 disabled:opacity-50 uppercase italic"
                >
                  {loading ? 'SINCRONIZANDO...' : 'ACTUALIZAR SEGURIDAD'}
                </button>
              </div>
            </motion.form>
          )}

          {activeTab === 'pins' && (
            <motion.div 
              key="pins"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-blue-500/5 p-6 rounded-[1.5rem] border border-blue-500/10 flex items-start gap-4 italic">
                <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-lg">
                  <ShieldCheck size={20} />
                </div>
                <p className="text-[10px] font-black text-blue-400/60 leading-relaxed uppercase tracking-widest text-left mt-1">
                  Relación de claves individuales. Como Directivo, puede modificar estos accesos para garantizar la integridad institucional.
                </p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {docentes.map(docente => (
                  <div key={docente} className="group relative bg-white/5 border border-white/5 rounded-[1.5rem] p-6 hover:border-blue-500/30 hover:bg-white/[0.08] transition-all duration-500 shadow-xl">
                    <label className="block text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2 ml-1 italic italic">IDENTIFICACIÓN / DOCENTE</label>
                    <div className="flex flex-col gap-4">
                      <span className="font-black text-white text-[11px] truncate uppercase tracking-tight italic" title={docente}>
                        {formatName(docente)}
                      </span>
                      <div className="relative">
                         <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-blue-500/40">
                            <KeyRound size={14} />
                         </div>
                         <input
                          type="text"
                          maxLength={10}
                          placeholder="ASIGNAR CLAVE"
                          value={teacherPins[docente] || ''}
                          onChange={(e) => savePin(docente, e.target.value)}
                          className="w-full pl-10 pr-4 py-3 text-xs bg-black/40 border border-white/5 focus:border-blue-500/50 rounded-xl font-mono font-black tracking-[0.2em] text-white shadow-inner placeholder:text-white/5 italic"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 px-2 italic">
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-2">Bitácora de Accesos</h3>
                  <p className="text-[10px] font-black text-blue-400/40 uppercase tracking-[0.4em]">Historial predictivo de seguridad</p>
                </div>
                <div className="flex gap-3">
                   <button 
                     onClick={fetchHistory}
                     disabled={loading}
                     className="p-4 text-blue-400 hover:text-white hover:bg-blue-600/20 bg-blue-500/5 rounded-2xl transition-all border border-blue-500/10 shadow-lg"
                     title="Actualizar Bitácora"
                   >
                      <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
                   </button>
                   <button
                    type="button"
                    onClick={() => setIsConfirmDeleteOpen(true)}
                    className="bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 px-8 py-4 rounded-2xl flex items-center gap-3 font-black transition-all text-[10px] tracking-[0.2em] border border-rose-500/10 shadow-xl uppercase italic"
                  >
                    <Trash2 size={18} /> Limpiar
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[2rem] border border-white/5 shadow-2xl bg-black/20">
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#1E293B] z-20 backdrop-blur-md">
                      <tr>
                        <th className="px-8 py-5 text-[9px] font-black text-white/40 uppercase tracking-widest border-b border-white/5 italic">Operador</th>
                        <th className="px-8 py-5 text-[9px] font-black text-white/40 uppercase tracking-widest text-right border-b border-white/5 italic">Sincronización</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.map((item, index) => (
                        <tr key={index} className="hover:bg-white/[0.03] transition-all duration-300 group">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-5">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg transition-all group-hover:scale-110 duration-500 shadow-xl border ${item.rol === 'directivo' ? 'bg-gradient-to-br from-slate-700 to-slate-900 text-white border-white/20' : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-white/20'}`}>
                                {item.nombre ? item.nombre.charAt(0) : '?'}
                              </div>
                              <div>
                                 <div className="text-[12px] font-black text-white uppercase italic tracking-tight mb-1">{formatName(item.nombre)}</div>
                                 <div className="flex items-center gap-2">
                                  <span className={`text-[8px] font-black tracking-[0.2em] uppercase px-2.5 py-1 rounded-lg border ${item.rol === 'directivo' ? 'bg-white/5 text-slate-400 border-white/10' : 'bg-blue-600/10 text-blue-400 border-blue-500/20'} italic`}>
                                    {item.rol}
                                  </span>
                                  {item.accion && (
                                    <span className="text-[8px] font-black tracking-[0.2em] uppercase px-2.5 py-1 rounded-lg border bg-amber-500/10 text-amber-500 border-amber-500/20 italic">
                                      {item.accion}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="inline-flex flex-col items-end bg-black/40 group-hover:bg-black/60 px-5 py-3 rounded-xl border border-white/5 group-hover:border-blue-500/30 transition-all shadow-lg italic">
                              <div className="flex items-center gap-2 mb-1">
                                 <Calendar size={10} className="text-white/20" />
                                 <span className="text-[9px] font-black text-white/40 uppercase tracking-tight">
                                    {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : new Date(item.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                 </span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <Clock size={12} className="text-blue-500" />
                                 <span className="text-lg font-black text-white tracking-widest leading-none italic">
                                    {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : new Date(item.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                 </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Confirm Delete Mini Modal */}
      <AnimatePresence>
        {isConfirmDeleteOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmDeleteOpen(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#0F172A] rounded-[3rem] shadow-2xl max-w-sm w-full p-10 border border-rose-500/20 relative z-10 text-center italic"
            >
              <div className="w-20 h-20 bg-rose-500/10 rounded-[2rem] flex items-center justify-center mb-6 border border-rose-500/20 mx-auto">
                <AlertTriangle size={40} className="text-rose-500" />
              </div>
              <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-4 italic">¿Borrar Historial?</h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] leading-loose mb-8 italic">
                ESTA ACCIÓN ELIMINARÁ TODOS LOS REGISTROS DE BITÁCORA.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsConfirmDeleteOpen(false)}
                  className="flex-1 px-6 py-4 bg-white/5 text-white/50 rounded-2xl font-black text-[10px] tracking-widest uppercase italic"
                >
                  No
                </button>
                <button 
                  onClick={deleteHistory}
                  className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] tracking-widest uppercase shadow-xl italic"
                >
                  Sí, Borrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ModalTemplate>
  );
}
