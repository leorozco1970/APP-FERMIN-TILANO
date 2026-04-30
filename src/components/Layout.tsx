import React, { useState, useEffect } from 'react';
import { auth, loginWithPassword, logout, db, signInAnonymously } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { LayoutDashboard, FileText, List, LogOut, BrainCircuit, FileOutput, KeyRound, ArrowRight, UserSearch, ShieldCheck, ClipboardList, BookOpen, Target, AlertCircle, Settings, MapPin, Calendar, Menu, X, Users, AlertTriangle, AlertOctagon, Handshake, Sparkles, FileSpreadsheet, UserMinus } from 'lucide-react';
import { LOGO_BASE64 } from '../lib/logo';
import { AdminSettingsModal } from './AdminSettingsModal';
import { PasswordModal } from './PasswordModal';
import { ChangePinModal } from './ChangePinModal';
import { formatName } from '../lib/formatter';
import { PERIODOS } from '../lib/constants';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [teacherNameInput, setTeacherNameInput] = useState('');
  const [loggedInTeacherName, setLoggedInTeacherName] = useState('Docente');

  // Add a new state for role
  const [loginRole, setLoginRole] = useState<'docente' | 'directivo' | 'administrativo'>('docente');
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('userRole'));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        setLoggedInTeacherName(localStorage.getItem('teacherName') || 'Docente');
        setUserRole(localStorage.getItem('userRole'));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    
    const sanitizedName = teacherNameInput.trim().toUpperCase();
    if (!sanitizedName) {
      setLoginError(`Por favor, ingrese el nombre del ${loginRole === 'docente' ? 'docente' : loginRole === 'directivo' ? 'directivo' : 'administrativo'}.`);
      return;
    }
    
    setIsLoggingIn(true);
    setLoginError('');
    try {
      // Parallelize initial fetches to speed up login
      const [authSnap, pinsSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'auth')),
        getDoc(doc(db, 'settings', 'docentes_pins')),
        signInAnonymously(auth)
      ]);
      
      const authData = authSnap.exists() ? authSnap.data() : {};
      const pinsData = pinsSnap.exists() ? pinsSnap.data().pins || {} : {};
      
      let isValid = false;
      if (loginRole === 'directivo') {
        const adminPass = authData.adminPassword || 'TILANO';
        if (passwordInput === adminPass) isValid = true;
      } else {
        const individualPin = pinsData[sanitizedName];
        const docPass = authData.docentePassword || '1234';
        
        if (individualPin) {
          if (passwordInput === individualPin) isValid = true;
        } else {
          if (passwordInput === docPass) isValid = true;
        }
      }

      if (!isValid) {
        throw new Error('Clave de acceso incorrecta para el rol seleccionado.');
      }

      localStorage.setItem('teacherName', sanitizedName);
      localStorage.setItem('userRole', loginRole);
      setLoggedInTeacherName(sanitizedName);
      setUserRole(loginRole);

      // Track login history
      try {
        await addDoc(collection(db, 'login_history'), {
          nombre: sanitizedName,
          rol: loginRole,
          timestamp: serverTimestamp()
        });
      } catch (e) { console.error(e); }

    } catch (error: any) {
      setLoginError(error.message || 'Error al iniciar sesión.');
      await auth.signOut();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('userRole');
    localStorage.removeItem('teacherName');
    setUserRole(null);
    setTeacherNameInput('');
    setPasswordInput('');
    setLoginError('');
  };

  const handleOpenAdmin = () => {
    setIsPasswordModalOpen(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#020617] font-sans text-slate-500 font-bold uppercase tracking-[0.3em] animate-pulse">Cargando Plataforma Tilana...</div>;
  }

  if (!user || !userRole) {
    return (
      <div className="flex h-screen w-full font-sans bg-[#020617] overflow-hidden select-none relative">
        {/* Desk Surface (Walnut/Wood Texture simulated) */}
        <div className="absolute inset-0 bg-[#2D1F16] z-0 opacity-40 mix-blend-overlay" style={{ 
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 100px, rgba(0,0,0,0.1) 100px, rgba(0,0,0,0.1) 200px), linear-gradient(to right, rgba(61,43,31,1), rgba(45,31,22,1))' 
        }}></div>
        
        <div className="relative z-10 flex h-full w-full items-center justify-center p-4 lg:p-8">
          {/* Main Executive Container - Perspective Flat Lay feel */}
          <div className="flex flex-col lg:flex-row w-full max-w-6xl h-[90vh] bg-white rounded-[2.5rem] shadow-[0_80px_150px_-30px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10 transform rotate-x-2 perspective-1000">
            
            {/* Left Panel - Branding (Premium Mesh Gradient & Metallic accents) */}
            <div className="relative w-full lg:w-1/2 h-1/2 lg:h-full bg-[#0A0F1E] overflow-hidden">
              {/* Mesh Gradient Deep Background */}
              <div className="absolute inset-0 z-0" style={{ 
                background: 'radial-gradient(at 0% 0%, #172554 0px, transparent 50%), radial-gradient(at 100% 0%, #1e1b4b 0px, transparent 50%), radial-gradient(at 100% 100%, #312e81 0px, transparent 50%), radial-gradient(at 0% 100%, #1e3a8a 0px, transparent 50%), linear-gradient(135deg, #020617 0%, #0f172a 100%)'
              }}></div>
              
              {/* LED Lighting Halos */}
              <div className="absolute top-[10%] left-[-10%] w-[120%] h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent blur-[2px]"></div>
              <div className="absolute bottom-[10%] right-[-10%] w-[120%] h-[1px] bg-gradient-to-r from-transparent via-blue-400/30 to-transparent blur-[1px]"></div>
              
              {/* Texture Layer */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/leather.png")' }}></div>

              <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-6 lg:p-10">
                {/* Logo Medallion (Metallic High-end Gold/Silver) */}
                <div className="relative mb-6 group">
                  <div className="p-1 rounded-full bg-gradient-to-br from-[#D4AF37] via-[#F5E1A4] to-[#8B4513] shadow-[0_10px_30px_rgba(0,0,0,0.5)] transform group-hover:scale-105 transition-transform duration-700">
                    <div className="bg-white p-3 rounded-full shadow-inner border-[2px] border-[#D4AF37]/40 relative overflow-hidden backdrop-blur-xl">
                       <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-80 animate-shine"></div>
                       <img src={LOGO_BASE64} alt="Logo" className="w-16 h-16 lg:w-20 lg:h-20 object-contain relative z-10 filter drop-shadow-md mix-blend-multiply" />
                    </div>
                  </div>
                  {/* Outer Glass Ring */}
                  <div className="absolute -inset-2 rounded-full border border-white/5 pointer-events-none scale-105 blur-[0.5px]"></div>
                </div>

                <div className="space-y-3">
                  <h1 className="text-xl lg:text-3xl font-black text-[#D4AF37] tracking-wider leading-tight uppercase drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] font-sans">
                    GESTIÓN<br/>PEDAGÓGICA INTEGRAL
                  </h1>
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-60"></div>
                    <p className="text-[9px] lg:text-[11px] font-black text-[#C0C0C0] uppercase tracking-[0.4em] drop-shadow-md">PLATAFORMA INSTITUCIONAL TILANISTA</p>
                  </div>
                </div>

                {/* Author Info Integrated - Instead of floating card */}
                <div className="mt-8 opacity-80 group">
                  <div className="flex flex-col items-center gap-1 border-t border-white/5 pt-4">
                    <p className="text-[10px] lg:text-[11px] font-black tracking-[0.1em] text-white/90 uppercase">
                      PLATAFORMA TILANISTA • Copyright © 2026
                    </p>
                    <h3 className="text-[10px] lg:text-[11px] font-black tracking-[0.1em] text-white/90 uppercase">
                      LEONARDO OROZCO • TUTOR PTA/FI – ATLÁNTICO
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Interaction & Form (Clean Marble feel) */}
            <div className="w-full lg:w-1/2 h-1/2 lg:h-full bg-white relative overflow-hidden p-6 lg:p-10 flex flex-col justify-center">
              {/* Subtle marble pattern background */}
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/white-diamond.png")' }}></div>
              <div className="absolute top-[-5%] right-[-5%] w-[30rem] h-[30rem] bg-blue-50/50 rounded-full blur-[120px] pointer-events-none"></div>

              <div className="relative z-10 w-full max-w-sm mx-auto">
                {/* Role Selector - Segmented Control (Metallic/Acrylic) */}
                <div className="grid grid-cols-3 p-1 bg-slate-100/50 rounded-xl mb-6 border border-slate-200 shadow-inner backdrop-blur-sm">
                  {(['docente', 'administrativo', 'directivo'] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => { setLoginRole(role); setLoginError(''); }}
                      className={`relative flex items-center justify-center px-1 py-2.5 rounded-lg text-[9px] font-black transition-all duration-500 overflow-hidden tracking-wider ${
                        loginRole === role 
                          ? 'bg-white text-blue-700 shadow-[0_5px_15px_-5px_rgba(37,99,235,0.2)] ring-1 ring-blue-600/10 scale-[1.03] z-10' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {role.toUpperCase()}
                      {loginRole === role && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>
                      )}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-4">
                    <div className="group relative">
                      <div className="flex items-center gap-2 mb-2 ml-1">
                        <div className={`p-1.5 rounded-lg transition-all duration-300 bg-blue-600 text-white shadow-md shadow-blue-500/30`}>
                          <UserSearch size={14} strokeWidth={3} />
                        </div>
                        <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider group-focus-within:text-blue-600">
                          Nombre del {loginRole}
                        </label>
                      </div>
                      <input 
                        type="text" 
                        value={teacherNameInput}
                        onChange={(e) => setTeacherNameInput(e.target.value.toUpperCase())}
                        className="w-full px-5 py-3.5 bg-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:ring-8 focus:ring-blue-600/5 transition-all font-black text-slate-900 placeholder:text-slate-200 shadow-sm text-sm uppercase tracking-wider"
                        placeholder="INGRESE SU NOMBRE COMPLETO..." 
                        required 
                      />
                    </div>

                    <div className="group relative">
                      <div className="flex justify-between items-center mb-2 ml-1">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg transition-all duration-300 bg-slate-100 text-slate-400 group-focus-within:bg-blue-600 group-focus-within:text-white group-focus-within:shadow-md group-focus-within:shadow-blue-500/30`}>
                            <KeyRound size={14} strokeWidth={3} />
                          </div>
                          <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider group-focus-within:text-blue-600">
                            Clave de Acceso
                          </label>
                        </div>
                        {loginRole === 'directivo' && (
                          <button 
                            type="button" onClick={handleOpenAdmin}
                            className="text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest bg-blue-50 px-2.5 py-1 rounded-full"
                          >
                            MODIFICAR
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full px-5 py-3.5 bg-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:ring-8 focus:ring-blue-600/5 transition-all font-black text-slate-900 placeholder:text-slate-200 shadow-sm font-mono tracking-[0.5em] text-lg"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  
                  {loginError && (
                    <div className="bg-rose-50 text-rose-700 px-5 py-3 rounded-xl border-l-4 border-rose-600 text-[10px] font-black animate-in fade-in slide-in-from-top-2 flex items-center gap-3 shadow-sm">
                      <AlertTriangle size={18} />
                      <span className="uppercase tracking-tight">{loginError}</span>
                    </div>
                  )}
                  
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="group relative w-full flex items-center justify-center gap-4 bg-blue-700 hover:bg-blue-800 text-white font-black py-4 px-8 rounded-2xl shadow-[0_20px_50px_-15px_rgba(37,99,235,0.5)] transition-all hover:-translate-y-1 active:scale-98 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <span className="tracking-[0.2em] text-[12px] brightness-125">
                      {isLoggingIn ? 'AUTENTICANDO...' : 'INGRESAR A LA PLATAFORMA'}
                    </span>
                    {!isLoggingIn && <ArrowRight size={20} strokeWidth={3} className="group-hover:translate-x-2 transition-transform text-[#D4AF37]" />}
                    <div className="absolute inset-0 rounded-2xl shadow-[0_0_15px_rgba(37,99,235,0.3)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </button>
                </form>
                
                <div className="mt-12 flex flex-col items-center gap-2">
                  <div className="h-[1px] w-12 bg-slate-200"></div>
                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">
                    Copyright © 2026 LEONARDO OROZCO
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest opacity-80">
                    SISTEMA DE GESTIÓN ACADÉMICA INSTITUCIONAL
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDirectivo = userRole === 'directivo';

  const navSeguimientoAcademico = [
    { id: 'nuevo', label: 'NUEVO REPORTE', subLabel: 'Gestión de clases', icon: FileText },
    { id: 'registros', label: 'REGISTRO DOCENTE', subLabel: 'Bitácora oficial', icon: List },
    { id: 'registro-estudiante', label: 'REGISTRO ESTUDIANTES', subLabel: 'Seguimiento individual', icon: Users },
    { id: 'informes', label: 'REPORTES INSTITUCIONALES', subLabel: 'Consolidados finales', icon: FileOutput },
    { id: 'enfoque', label: 'ANÁLISIS PEDAGÓGICO', subLabel: 'Investigación docente', icon: BrainCircuit },
    { id: 'planillas-institucionales', label: 'PLANILLAS INSTITUCIONALES', subLabel: 'Gestión y Generación', icon: FileSpreadsheet },
    { id: 'planes-area-aula', label: 'PLANES DE AREA Y DE AULA', subLabel: 'Gestión Curricular', icon: BookOpen },
  ];

  const navClimaConvivencial = [
    { id: 'registro-convivencia', label: 'ACTAS DE CONVIVENCIA', subLabel: 'Clima institucional', icon: ClipboardList },
  ];

  const navGestionMatricula = [
    { id: 'matriculas-general', label: 'Directorio Activo', subLabel: 'Censo Estudiantil', icon: Users },
    { id: 'matriculas-retirados', label: 'Historial de Retiros', subLabel: 'Control de Bajas', icon: UserMinus },
  ];

  const navGestionAdministrativa = [
    { id: 'dashboard', label: 'DASHBOARD', subLabel: 'Analítica integral', icon: LayoutDashboard },
    { id: 'evaluacion-institucional', label: 'EVALUACIÓN INSTITUCIONAL', subLabel: 'Calidad y Gestión', icon: Target },
  ];

  const navInclusion = [
    { id: 'inclusion', label: 'ATENCIÓN INTEGRAL (INCLUSIÓN)', subLabel: 'Diversidad y Ajustes', icon: BrainCircuit },
  ];

  const navFormacionIntegral = [
    { id: 'proyectos', label: 'Registro de Estrategias de F.I.', subLabel: 'Gestión pedagógica', icon: Sparkles },
    { id: 'articulacion-curricular', label: 'Articulación y Armonización', subLabel: 'Tejido Curricular', icon: Handshake },
    { id: 'construccion-pfi', label: 'PLAN DE FORMACION INTEGRAL', subLabel: 'Estructuración P.F.I.', icon: ClipboardList },
    { id: 'plan-formacion', label: 'SEGUIMIENTO AL PLAN DE FORMACION INTEGRAL', subLabel: 'Logros y competencias', icon: Target },
    { id: 'proyectos-transversales', label: 'PROYECTOS TRANSVERSALES', subLabel: 'Integración institucional', icon: BookOpen },
  ];

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#020617] font-sans text-gray-300 selection:bg-blue-500/30 selection:text-white overflow-x-hidden">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar - Dark Midnight Deep Blue Gradient */}
      <aside className={`fixed inset-y-0 left-0 z-[60] w-[280px] bg-gradient-to-b from-[#020617] via-[#050B1A] to-[#01040D] text-[#C0C0C0] transform transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] lg:translate-x-0 lg:static flex flex-col shadow-[15px_0_60px_-15px_rgba(0,0,0,0.8)] border-r border-white/5 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Logo Emblem Section */}
        <div className="p-8 flex items-center justify-center bg-transparent relative overflow-hidden shrink-0 mt-4">
          <div className="relative group flex justify-center">
            {/* Clean Institutional Logo - Minimal Shield as requested */}
            <div className="transform hover:scale-110 transition-transform duration-700">
              <div className="bg-white/90 p-3 rounded-2xl flex items-center justify-center w-20 h-20">
                 <img src={LOGO_BASE64} alt="Logo" className="w-16 h-16 object-contain mix-blend-multiply" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar flex flex-col gap-10">
          
          <div className="relative">
            <div className="flex items-center gap-4 mb-5 px-3">
              <div className="w-1 h-7 bg-gradient-to-b from-[#C5A059] to-[#8E6D3E] rounded-full shadow-[0_0_20px_rgba(197,160,89,0.4)]"></div>
              <span className="text-[12px] font-black text-[#C5A059] uppercase tracking-[0.4em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                SEGUIMIENTO ACADÉMICO
              </span>
            </div>
            
            <nav className="space-y-1.5">
              {navSeguimientoAcademico.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 relative group border border-transparent ${
                      isActive 
                        ? 'bg-[#C5A059]/10 text-white border-[#C5A059]/20 shadow-[0_0_40px_-10px_rgba(197,160,89,0.2)]' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Icon size={18} strokeWidth={1.5} className={`${isActive ? 'text-[#C5A059] scale-110' : 'text-[#C5A059]/40 group-hover:text-[#C5A059]/80'} transition-all duration-500`} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1] flex-1 text-left min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider text-left truncate w-full ${isActive ? 'text-[#C5A059]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.1em] mt-1.5 text-left truncate w-full ${isActive ? 'text-slate-300/80' : 'text-slate-600'}`}>
                        {item.subLabel}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-4 w-1 h-4 bg-[#C5A059] rounded-full shadow-[0_0_15px_#C5A059]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="relative">
            <div className="flex items-center gap-4 mb-5 px-3">
              <div className="w-1 h-7 bg-gradient-to-b from-[#C5A059] to-[#8E6D3E] rounded-full shadow-[0_0_20px_rgba(197,160,89,0.4)]"></div>
              <span className="text-[12px] font-black text-[#C5A059] uppercase tracking-[0.4em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                CLIMA Y APOYO CONVIVENCIAL
              </span>
            </div>
            <nav className="space-y-1.5">
              {navClimaConvivencial.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 relative group border border-transparent ${
                      isActive 
                        ? 'bg-[#C5A059]/10 text-white border-[#C5A059]/20 shadow-[0_0_40px_-10px_rgba(197,160,89,0.2)]' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Icon size={18} strokeWidth={1.5} className={`${isActive ? 'text-[#C5A059] scale-110' : 'text-[#C5A059]/40 group-hover:text-[#C5A059]/80'} transition-all duration-500`} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1] flex-1 text-left min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider text-left truncate w-full ${isActive ? 'text-[#C5A059]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.1em] mt-1.5 text-left truncate w-full ${isActive ? 'text-slate-300/80' : 'text-slate-600'}`}>
                        {item.subLabel}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-4 w-1 h-4 bg-[#C5A059] rounded-full shadow-[0_0_15px_#C5A059]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="relative">
            <div className="flex items-center gap-4 mb-5 px-3">
              <div className="w-1 h-7 bg-gradient-to-b from-[#C5A059] to-[#8E6D3E] rounded-full shadow-[0_0_20px_rgba(197,160,89,0.4)]"></div>
              <span className="text-[12px] font-black text-[#C5A059] uppercase tracking-[0.4em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                GESTIÓN DE MATRÍCULA
              </span>
            </div>
            <nav className="space-y-1.5">
              {navGestionMatricula.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 relative group border border-transparent ${
                      isActive 
                        ? 'bg-[#C5A059]/10 text-white border-[#C5A059]/20 shadow-[0_0_40px_-10px_rgba(197,160,89,0.2)]' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Icon size={18} strokeWidth={1.5} className={`${isActive ? 'text-[#C5A059] scale-110' : 'text-[#C5A059]/40 group-hover:text-[#C5A059]/80'} transition-all duration-500`} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1] flex-1 text-left min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider text-left truncate w-full ${isActive ? 'text-[#C5A059]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.1em] mt-1.5 text-left truncate w-full ${isActive ? 'text-slate-300/80' : 'text-slate-600'}`}>
                        {item.subLabel}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-4 w-1 h-4 bg-[#C5A059] rounded-full shadow-[0_0_15px_#C5A059]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="relative">
            <div className="flex items-center gap-4 mb-5 px-3">
              <div className="w-1 h-7 bg-gradient-to-b from-[#C5A059] to-[#8E6D3E] rounded-full shadow-[0_0_20px_rgba(197,160,89,0.4)]"></div>
              <span className="text-[12px] font-black text-[#C5A059] uppercase tracking-[0.4em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] leading-tight">
                ATENCIÓN INTEGRAL A ESTUDIANTES (INCLUSIÓN)
              </span>
            </div>
            <nav className="space-y-1.5">
              {navInclusion.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 relative group border border-transparent ${
                      isActive 
                        ? 'bg-[#C5A059]/10 text-white border-[#C5A059]/20 shadow-[0_0_40px_-10px_rgba(197,160,89,0.2)]' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Icon size={18} strokeWidth={1.5} className={`${isActive ? 'text-[#C5A059] scale-110' : 'text-[#C5A059]/40 group-hover:text-[#C5A059]/80'} transition-all duration-500`} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1] flex-1 text-left min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider text-left truncate w-full ${isActive ? 'text-[#C5A059]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.1em] mt-1.5 text-left truncate w-full ${isActive ? 'text-slate-300/80' : 'text-slate-600'}`}>
                        {item.subLabel}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-4 w-1 h-4 bg-[#C5A059] rounded-full shadow-[0_0_15px_#C5A059]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="relative">
            <div className="flex items-center gap-4 mb-5 px-3">
              <div className="w-1 h-7 bg-gradient-to-b from-[#C5A059] to-[#8E6D3E] rounded-full shadow-[0_0_20px_rgba(197,160,89,0.4)]"></div>
              <span className="text-[12px] font-black text-[#C5A059] uppercase tracking-[0.4em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                GESTIÓN ADMINISTRATIVA
              </span>
            </div>
            <nav className="space-y-1.5">
              {navGestionAdministrativa.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 relative group border border-transparent ${
                      isActive 
                        ? 'bg-[#C5A059]/10 text-white border-[#C5A059]/20 shadow-[0_0_40px_-10px_rgba(197,160,89,0.2)]' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Icon size={18} strokeWidth={1.5} className={`${isActive ? 'text-[#C5A059] scale-110' : 'text-[#C5A059]/40 group-hover:text-[#C5A059]/80'} transition-all duration-500`} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1] flex-1 text-left min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider text-left truncate w-full ${isActive ? 'text-[#C5A059]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.1em] mt-1.5 text-left truncate w-full ${isActive ? 'text-slate-300/80' : 'text-slate-600'}`}>
                        {item.subLabel}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-4 w-1 h-4 bg-[#C5A059] rounded-full shadow-[0_0_15px_#C5A059]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="relative">
            <div className="flex items-center gap-4 mb-5 px-3">
              <div className="w-1 h-7 bg-gradient-to-b from-[#C5A059] to-[#8E6D3E] rounded-full shadow-[0_0_20px_rgba(197,160,89,0.4)]"></div>
              <span className="text-[12px] font-black text-[#C5A059] uppercase tracking-[0.3em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] leading-tight">
                FORMACIÓN INTEGRAL Y PROYECTOS (F.I.)
              </span>
            </div>
            <nav className="space-y-1.5">
              {navFormacionIntegral.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 relative group border border-transparent ${
                      isActive 
                        ? 'bg-[#C5A059]/10 text-white border-[#C5A059]/20 shadow-[0_0_40px_-10px_rgba(197,160,89,0.2)]' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Icon size={18} strokeWidth={1.5} className={`${isActive ? 'text-[#C5A059] scale-110' : 'text-[#C5A059]/40 group-hover:text-[#C5A059]/80'} transition-all duration-500`} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1] flex-1 text-left min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider text-left truncate w-full ${isActive ? 'text-[#C5A059]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.1em] mt-1.5 text-left truncate w-full ${isActive ? 'text-slate-300/80' : 'text-slate-600'}`}>
                        {item.subLabel}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-4 w-1 h-4 bg-[#C5A059] rounded-full shadow-[0_0_15px_#C5A059]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Minimal Footer Panel */}
        <div className="p-6 bg-[#01040D]/80 border-t border-white/5 mt-auto">
          <div className="flex items-center gap-3">
             <button
               onClick={handleOpenAdmin}
               disabled={!isDirectivo}
               className={`flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl transition-all duration-300 text-[10px] font-bold tracking-[0.2em] uppercase ${!isDirectivo ? 'bg-white/5 text-slate-700 cursor-not-allowed opacity-20' : 'bg-white/5 text-[#D4AF37]/60 hover:bg-white/10 hover:text-[#D4AF37] border border-white/5 group'}`}
             >
               <Settings size={16} strokeWidth={1} className="transition-all duration-500 group-hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]" />
               <span>PANEL</span>
             </button>
            <button
              onClick={handleLogout}
              className="px-4 py-3.5 rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all duration-300 flex items-center justify-center shadow-lg border border-rose-500/20"
              title="SALIR"
            >
              <LogOut size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#020617]">
        
        {/* Header Institucional (Dark Executive) */}
        <header className="bg-[#020617] border-b border-white/5 h-[6rem] flex items-center justify-between px-8 lg:px-12 z-30 shrink-0 sticky top-0">
          <div className="flex items-center gap-8">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden text-slate-400 hover:text-white transition-colors p-3 hover:bg-white/5 rounded-2xl"
            >
              <Menu size={24} strokeWidth={1.5} />
            </button>
            <div className="flex flex-col">
              <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-white tracking-[0.2em] font-headings uppercase leading-none drop-shadow-2xl">
                GESTIÓN PEDAGÓGICA INTEGRAL
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-6 lg:gap-10">
            {/* Institutional Identity - Sede Info */}
            <div className="hidden xl:flex items-center gap-4 bg-white/[0.03] px-6 py-2.5 rounded-2xl border border-white/10 group animate-in fade-in slide-in-from-right-4 duration-700">
              <div className="w-11 h-11 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 shadow-inner group-hover:scale-105 transition-transform duration-500">
                <MapPin size={18} className="text-blue-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] leading-none mb-1.5 opacity-60 italic">Sede Principal:</span>
                <span className="text-[12px] font-black text-white uppercase tracking-wider">Sede Única</span>
              </div>
            </div>

            {/* Premium Teacher ID Card Styling */}
            <div className="flex items-center gap-5 px-6 py-2.5 bg-white/[0.03] backdrop-blur-md rounded-[1.5rem] border border-white/10 group shadow-2xl transition-all hover:bg-white/[0.05]">
              <div className="hidden sm:flex flex-col items-end mr-2">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.8)]"></div>
                   <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] italic">Datos en Vivo</span>
                </div>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Sincronización SIMAT/PIAR</span>
              </div>
              <div className="w-12 h-12 rounded-full bg-white p-1 border border-slate-200 shrink-0">
                 <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center text-[#D4AF37]">
                    {userRole === 'directivo' ? <ShieldCheck size={24} strokeWidth={2} /> : userRole === 'administrativo' ? <Settings size={24} strokeWidth={2} /> : <UserSearch size={24} strokeWidth={2} />}
                 </div>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] leading-none">Sistema Activo</span>
                </div>
                <h4 className="text-[14px] lg:text-[18px] font-black text-white uppercase tracking-wider truncate max-w-[200px] md:max-w-[400px]">
                  {formatName(loggedInTeacherName)}
                </h4>
                <div className="flex items-center gap-4 mt-2">
                  <button 
                    onClick={() => setIsChangePinModalOpen(true)} 
                    className="text-[10px] text-blue-400 hover:text-white font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                  >
                    Personalizar Acceso
                  </button>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10"></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">{userRole}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Content Area */}
        <main className="flex-1 overflow-auto bg-[#020617] relative w-full h-full custom-scrollbar">
          {/* Top glow effect */}
          <div className="absolute top-0 inset-x-0 h-[400px] bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
          
          <div className="master-container py-6 sm:py-10 lg:py-12 relative transition-all duration-500">
            {children}
            
            <footer className="mt-24 pb-16 text-center border-t border-white/5 pt-12">
              <div className="inline-flex flex-col items-center">
                <div className="grid grid-cols-3 gap-8 mb-8 opacity-40">
                  <div className="h-px bg-gradient-to-r from-transparent to-white/20"></div>
                  <div className="w-12 h-1 bg-brand-gold rounded-full mx-auto"></div>
                  <div className="h-px bg-gradient-to-l from-transparent to-white/20"></div>
                </div>
                
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                  PLATAFORMA TILANISTA • Copyright © 2026 LEONARDO OROZCO • TUTOR PTA/FI – ATLÁNTICO
                </p>
              </div>
            </footer>
          </div>
        </main>
      </div>

      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
          setIsAdminModalOpen(true);
        }}
      />
      <AdminSettingsModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
      />
      <ChangePinModal
        isOpen={isChangePinModalOpen}
        onClose={() => setIsChangePinModalOpen(false)}
        teacherName={loggedInTeacherName}
        userRole={userRole}
      />
    </div>
  );
}
