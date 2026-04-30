import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { KeyRound, CheckCircle2, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { ModalTemplate } from './ModalTemplate';
import { formatName } from '../lib/formatter';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherName: string;
  userRole: string | null;
}

export function ChangePinModal({ isOpen, onClose, teacherName, userRole }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      setError('Asegúrese de escribir el nuevo PIN igual en ambas casillas.');
      return;
    }
    if (newPin.length < 4) {
      setError('El PIN debe tener al menos 4 caracteres.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sanitizedName = teacherName.trim().toUpperCase();
      
      const pinsSnap = await getDoc(doc(db, 'settings', 'docentes_pins'));
      let pinsData: Record<string, string> = {};
      
      if (pinsSnap.exists()) {
        pinsData = pinsSnap.data().pins || {};
      }

      const existingPin = pinsData[sanitizedName];
      const authSnap = await getDoc(doc(db, 'settings', 'auth'));
      const authData = authSnap.exists() ? authSnap.data() : {};
      
      let isCurrentValid = false;
      
      if (existingPin) {
        if (currentPin === existingPin) isCurrentValid = true;
      }
      
      if (!isCurrentValid) {
        if (userRole === 'directivo') {
          const adminPass = authData.adminPassword || 'TILANO';
          if (currentPin === adminPass) isCurrentValid = true;
        } else {
          const docPass = authData.docentePassword || '1234';
          const master = authData.appPassword || authData.password || 'TILANO';
          
          if (currentPin === docPass || currentPin === master) {
            isCurrentValid = true;
          }
        }
      }

      if (!isCurrentValid) {
        const hint = userRole === 'directivo' ? '' : ' Recuerde que la inicial es 1234 para docentes.';
        setError(`La clave actual no es correcta.${hint}`);
        setLoading(false);
        return;
      }

      pinsData[sanitizedName] = newPin;
      await setDoc(doc(db, 'settings', 'docentes_pins'), { pins: pinsData }, { merge: true });

      try {
        await addDoc(collection(db, 'login_history'), {
          nombre: sanitizedName,
          rol: userRole || 'docente',
          accion: 'CAMBIO DE CLAVE',
          timestamp: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Error writing audit log:", logErr);
      }
      
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
      
    } catch (err) {
      console.error(err);
      setError('Error al actualizar la clave. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
    setSuccess(false);
    onClose();
  };

  const roleLabel = (userRole || 'Docente').toUpperCase();

  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title="Gestión de Clave Personal" 
      onClose={handleClose}
      maxWidth="max-w-md"
    >
      <div className="flex flex-col items-center text-center mb-8">
         <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-4 shadow-inner">
           <KeyRound className="text-blue-400" size={28} />
         </div>
         <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] italic underline underline-offset-4 decoration-blue-500/30">
           {roleLabel}: {formatName(teacherName)}
         </p>
      </div>
      
      <form onSubmit={handleSubmit}>
        {success && (
          <div className="mb-6 bg-emerald-500/10 text-emerald-400 p-4 rounded-2xl text-[10px] font-black tracking-widest border border-emerald-500/20 flex items-center gap-3 italic">
            <CheckCircle2 size={18} />
            <span>CLAVE ACTUALIZADA CON ÉXITO</span>
          </div>
        )}
        {error && (
          <div className="mb-6 bg-rose-500/10 text-rose-400 p-4 rounded-2xl text-[10px] font-black tracking-widest border border-rose-500/20 flex items-center gap-3 italic">
            <AlertTriangle size={18} />
            <span className="uppercase">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          <div className="group">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3 px-2 italic">
              Clave de Acceso Actual:
            </label>
            <input
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600/50 transition-all font-mono tracking-[0.4em] text-lg text-white italic"
              placeholder="••••"
              required
            />
          </div>
          
          <div className="h-px bg-white/5 mx-4"></div>

          <div className="group">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3 px-2 italic">
              Nueva Clave:
            </label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600/50 transition-all font-mono tracking-[0.4em] text-lg text-white italic"
              placeholder="MÍN. 4 DIG"
              required
            />
          </div>
          
          <div className="group">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3 px-2 italic">
              Confirmar Nueva Clave:
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600/50 transition-all font-mono tracking-[0.4em] text-lg text-white italic"
              placeholder="REPETIR"
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-10">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all font-black shadow-xl shadow-blue-900/20 disabled:opacity-50 uppercase tracking-[0.2em] text-[10px] group flex items-center justify-center gap-3 active:scale-95 italic"
          >
            {loading ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : (
              <>
                <ShieldCheck size={18} className="group-hover:scale-110 transition-transform" />
                <span>ACTUALIZAR CLAVE</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalTemplate>
  );
}
