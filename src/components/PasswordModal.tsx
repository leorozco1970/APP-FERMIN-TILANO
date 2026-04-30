import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ShieldAlert, KeyRound, CheckCircle2 } from 'lucide-react';
import { ModalTemplate } from './ModalTemplate';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  message?: string;
  passwordType?: 'app' | 'admin' | 'docente';
  teacherName?: string;
}

export function PasswordModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  title = "VERIFICACIÓN DE SEGURIDAD", 
  message = "Ingrese su clave de autorización para proceder:", 
  passwordType = 'admin',
  teacherName
}: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [realPasswords, setRealPasswords] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setChecking(true);
      const fetchData = async () => {
        try {
          const authSnap = await getDoc(doc(db, 'settings', 'auth'));
          const authData = authSnap.exists() ? authSnap.data() : {};
          
          if (passwordType === 'admin') {
            setRealPasswords([authData.adminPassword || '1023']);
          } else if (passwordType === 'app') {
            setRealPasswords([authData.appPassword || authData.password || 'TILANO']);
          } else if (passwordType === 'docente') {
            const possiblePasswords: string[] = [];
            
            // Individual PIN if teacherName is provided
            let individualPinFound = false;
            if (teacherName) {
              const pinsSnap = await getDoc(doc(db, 'settings', 'docentes_pins'));
              if (pinsSnap.exists()) {
                const pinsData = pinsSnap.data().pins || {};
                const individualPin = pinsData[teacherName.toUpperCase()];
                if (individualPin) {
                  possiblePasswords.push(individualPin);
                  individualPinFound = true;
                }
              }
            }

            // Generic docente password - ONLY if no individual PIN found
            if (!individualPinFound) {
              possiblePasswords.push(authData.docentePassword || '1234');
            }
            
            setRealPasswords(possiblePasswords);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setChecking(false);
        }
      };
      fetchData();
    }
  }, [isOpen, passwordType, teacherName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking) return;
    
    if (realPasswords.includes(password)) {
      // Registrar en la bitácora de auditoría maestra
      try {
        const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
        await addDoc(collection(db, 'login_history'), {
          nombre: teacherName || 'ADMINISTRADOR',
          tipoAcceso: passwordType.toUpperCase(),
          mensaje: `ACCESO EXITOSO${teacherName ? ` - ${teacherName}` : ''}`,
          fecha: serverTimestamp(),
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn("Error recording audit log:", e);
      }

      setPassword('');
      setError('');
      onSuccess();
      onClose();
    } else {
      setError('Credencial de acceso inválida');
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <ModalTemplate 
      isOpen={isOpen} 
      title={title} 
      onClose={handleClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
           <div className="p-5 bg-blue-600/10 border border-blue-600/20 rounded-[2rem] text-blue-500 shadow-xl shadow-blue-900/10 mb-6 transform hover:scale-110 transition-transform">
              <ShieldAlert size={32} />
           </div>
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Acceso Restringido</p>
        </div>

        <div className="mb-10">
          <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1 italic text-center">
            {message}
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
              <KeyRound size={18} />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="executive-input w-full pl-14 font-mono text-2xl tracking-[0.5em] h-20 text-center rounded-2xl"
              autoFocus
              placeholder="••••"
            />
          </div>
          {error && (
            <div className="mt-4 flex items-center justify-center gap-2 text-rose-500 animate-fade-in bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-tight italic">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-6 py-4 text-slate-500 hover:text-white font-black text-[11px] tracking-widest transition-all uppercase rounded-2xl hover:bg-white/5 italic"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={checking}
            className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all font-black text-[11px] tracking-[0.2em] shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 uppercase group disabled:opacity-50 italic"
          >
            {checking ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <>
                Verificar <CheckCircle2 size={16} className="group-hover:scale-110 transition-transform" />
              </>
            )}
          </button>
        </div>
      </form>
    </ModalTemplate>
  );
}
