import React, { useState, useEffect } from 'react';
import { 
  FileText, Calendar, Users, GraduationCap, Link2, Plus, Trash2, 
  Eye, Download, Save, Search, CheckCircle2, AlertCircle, Sparkles,
  BookOpen, Target, Clock, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { AREAS } from '../lib/constants';
import { PageHeader } from '../components/PageHeader';
import { InstitutionalLoading } from '../components/InstitutionalLoading';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const PROYECTOS_OPTIONS = [
  "Proyecto Ambiental Escolar (PRAE)",
  "Proyecto de Educación para la Sexualidad y Construcción de Ciudadanía (PESCC)",
  "Educación y Seguridad Vial (PESV)",
  "Educación para el Ejercicio de los Derechos Humanos",
  "Gestión y Prevención de Riesgos de Desastres",
  "PROYECTO DEL SERVICIO SOCIAL ESTUDIANTIL",
  "Estilos de Vida Saludable",
  "Cátedra de Estudios Afrocolombianos"
];

const PERIODOS_PROYECTO = ["MENSUAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"];

interface Actividad {
  id: string;
  fecha: string;
  descripcion: string;
}

interface ProyectoRegistrado {
  id: string;
  fechaEntrega: string;
  docentesResponsables: string;
  proyecto: string;
  periodo: string;
  url: string;
  areasArticuladas: string[];
  actividades: Actividad[];
  createdAt: any;
}

export function ProyectosTransversales() {
  const [proyectos, setProyectos] = useState<ProyectoRegistrado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [docentes, setDocentes] = useState('');
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(PROYECTOS_OPTIONS[0]);
  const [periodo, setPeriodo] = useState(PERIODOS_PROYECTO[2]); // Trimestral default
  const [url, setUrl] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [tempFecha, setTempFecha] = useState('');
  const [tempActividad, setTempActividad] = useState('');

  const [status, setStatus] = useState({ text: '', type: '' });

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatus({ text, type });
    setTimeout(() => setStatus({ text: '', type: '' }), 5000);
  };

  useEffect(() => {
    // Wait for auth to be ready if it's currently null
    let unsubscribe: () => void = () => {};

    const setupListener = () => {
      const q = query(collection(db, 'proyectos_transversales'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProyectoRegistrado));
        const sortedList = list.sort((a, b) => {
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
        });
        setProyectos(sortedList);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'proyectos_transversales');
        setLoading(false);
      });
    };

    if (auth.currentUser) {
      setupListener();
    } else {
      // If no user yet, wait a bit or just stop loading if we're sure they're not logged in
      // But Layout handles redirected to login, so we might just wait or check once
      const authUnsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          setupListener();
          authUnsubscribe();
        } else {
          setLoading(false);
          authUnsubscribe();
        }
      });
      return () => {
        authUnsubscribe();
        unsubscribe();
      };
    }

    return () => unsubscribe();
  }, []);

  const exportPDF = (p: ProyectoRegistrado) => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('BITÁCORA DE PROYECTO PEDAGÓGICO', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`INSTITUCIÓN EDUCATIVA FERMÍN TILANO`, 105, 28, { align: 'center' });
    
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL PROYECTO', 20, 45);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`PROYECTO: ${p.proyecto}`, 20, 55);
    doc.text(`PERIODO: ${p.periodo}`, 20, 62);
    doc.text(`FECHA DE ENTREGA: ${p.fechaEntrega}`, 20, 69);
    doc.text(`RESPONSABLES: ${p.docentesResponsables}`, 20, 76);
    
    if (p.areasArticuladas && p.areasArticuladas.length > 0) {
      doc.text(`ÁREAS ARTICULADAS: ${p.areasArticuladas.join(', ')}`, 20, 83);
    }

    if (p.actividades && p.actividades.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('CRONOGRAMA DE ACTIVIDADES', 20, 95);
      
      const tableData = p.actividades.map(a => [a.fecha, a.descripcion]);
      (doc as any).autoTable({
        startY: 100,
        head: [['FECHA', 'DESCRIPCIÓN']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }
      });
    }

    doc.save(`PROYECTO_${p.proyecto.replace(/\s+/g, '_')}.pdf`);
  };

  const handleAddActividad = () => {
    if (!tempFecha || !tempActividad.trim()) return;
    const newAct: Actividad = {
      id: Math.random().toString(36).substr(2, 9),
      fecha: tempFecha,
      descripcion: tempActividad.trim()
    };
    setActividades([...actividades, newAct]);
    setTempFecha('');
    setTempActividad('');
  };

  const handleRemoveActividad = (id: string) => {
    setActividades(actividades.filter(a => a.id !== id));
  };

  const toggleArea = (area: string) => {
    setSelectedAreas(prev => 
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const handleSave = async () => {
    if (!fechaEntrega || !docentes || !proyectoSeleccionado) {
      setStatus({ text: 'Complete los campos obligatorios', type: 'error' });
      return;
    }

    try {
      if (!auth.currentUser) {
        showStatus('Debe iniciar sesión para guardar', 'error');
        return;
      }

      const data = {
        fechaEntrega,
        docentesResponsables: docentes,
        proyecto: proyectoSeleccionado,
        periodo,
        url: url || '',
        areasArticuladas: selectedAreas,
        actividades: actividades.map(a => ({ ...a })),
        createdAt: serverTimestamp(),
        authorUid: auth.currentUser.uid,
        authorEmail: auth.currentUser.email
      };

      await addDoc(collection(db, 'proyectos_transversales'), data);
      
      showStatus('Proyecto guardado con éxito', 'success');
      setShowForm(false);
      resetForm();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'proyectos_transversales');
    }
  };

  const resetForm = () => {
    setFechaEntrega('');
    setDocentes('');
    setProyectoSeleccionado(PROYECTOS_OPTIONS[0]);
    setPeriodo(PERIODOS_PROYECTO[2]);
    setUrl('');
    setSelectedAreas([]);
    setActividades([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Desea eliminar este registro de proyecto?')) return;
    try {
      await deleteDoc(doc(db, 'proyectos_transversales', id));
      showStatus('Registro eliminado', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `proyectos_transversales/${id}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <PageHeader 
        title="Proyectos Pedagógicos Transversales" 
        description="Gestión, seguimiento y articulación de proyectos institucionales obligatorios y bitácora de actividades pedagógicas."
      />

      <div className="flex justify-center">
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-3 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 shadow-2xl ${
            showForm 
            ? 'bg-rose-600 hover:bg-rose-700 text-white' 
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
          }`}
        >
          {showForm ? <Trash2 size={18} /> : <Plus size={18} />}
          {showForm ? 'Cancelar Registro' : 'Registrar Nuevo Proyecto'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10 backdrop-blur-xl shadow-2xl space-y-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3 italic">
                  <span className="w-8 h-px bg-[#C5A059]"></span> Datos Generales del Proyecto
                </h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Fecha de Entrega</label>
                      <input 
                        type="date"
                        value={fechaEntrega}
                        onChange={(e) => setFechaEntrega(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-blue-500 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Periodo</label>
                      <select 
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs text-white uppercase font-black tracking-widest"
                      >
                        {PERIODOS_PROYECTO.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Proyecto Pedagógico</label>
                    <select 
                      value={proyectoSeleccionado}
                      onChange={(e) => setProyectoSeleccionado(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-black uppercase tracking-wider"
                    >
                      {PROYECTOS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Docentes Responsables</label>
                    <textarea 
                      value={docentes}
                      onChange={(e) => setDocentes(e.target.value)}
                      placeholder="Ingrese los nombres de los docentes..."
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs text-white min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">URL del Proyecto (Drive / Repositorio)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://drive.google.com/..."
                          className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white font-mono"
                        />
                      </div>
                      {url && (
                        <div className="flex gap-2">
                          <a 
                            href={url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="p-3 bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl hover:bg-blue-600/30 transition-all flex items-center gap-2"
                            title="VER"
                          >
                            <Eye size={16} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">Ver</span>
                          </a>
                          <button 
                            onClick={() => {
                              // Export PDF logic for current form state
                              const p: ProyectoRegistrado = {
                                id: 'preview',
                                fechaEntrega,
                                docentesResponsables: docentes,
                                proyecto: proyectoSeleccionado,
                                periodo,
                                url,
                                areasArticuladas: selectedAreas,
                                actividades,
                                createdAt: new Date()
                              };
                              exportPDF(p);
                            }}
                            className="p-3 bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-600/30 transition-all flex items-center gap-2"
                            title="DESCARGAR"
                          >
                            <Download size={16} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">Descargar</span>
                          </button>
                          <button 
                            onClick={() => setUrl('')}
                            className="p-3 bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl hover:bg-rose-600/30 transition-all flex items-center gap-2"
                            title="BORRAR"
                          >
                            <Trash2 size={16} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">Borrar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3 italic">
                  <span className="w-8 h-px bg-[#C5A059]"></span> Áreas Articuladas
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AREAS.map(area => (
                    <button
                      key={area}
                      onClick={() => toggleArea(area)}
                      className={`p-3 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all border ${
                        selectedAreas.includes(area)
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-white/5">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3 italic">
                <span className="w-8 h-px bg-[#C5A059]"></span> Bitácora de Actividades Realizadas
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-white/5 p-4 rounded-3xl border border-white/5">
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Fecha Actividad</label>
                  <input 
                    type="date"
                    value={tempFecha}
                    onChange={(e) => setTempFecha(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono"
                  />
                </div>
                <div className="md:col-span-7 space-y-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Descripción de Actividad</label>
                  <input 
                    type="text"
                    value={tempActividad}
                    onChange={(e) => setTempActividad(e.target.value)}
                    placeholder="Ej: Taller de reciclaje con primaria..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    onClick={handleAddActividad}
                    className="w-full bg-[#C5A059] hover:bg-[#A68648] text-black font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all"
                  >
                    Añadir
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {actividades.map(act => (
                  <div key={act.id} className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 flex items-center gap-4 group">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-blue-400 uppercase font-mono">{act.fecha}</span>
                      <span className="text-[10px] font-bold text-white uppercase">{act.descripcion}</span>
                    </div>
                    <button 
                      onClick={() => handleRemoveActividad(act.id)}
                      className="text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-rose-500/10 rounded-lg"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-8">
              <button
                onClick={handleSave}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-10 py-4 rounded-2xl text-[11px] uppercase tracking-[0.3em] flex items-center gap-3 transition-all shadow-xl"
              >
                <Save size={18} />
                Guardar Registro Completo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2 mb-8 text-center pt-8">
          <div className="w-12 h-1 bg-[#C5A059]/20 rounded-full mb-2"></div>
          <div className="flex items-center gap-4">
            <BookOpen className="text-[#C5A059]" size={20} />
            <h2 className="text-sm font-black text-white uppercase tracking-[0.4em] italic">Registros Institucionales</h2>
            <BookOpen className="text-[#C5A059]" size={20} />
          </div>
          <div className="w-12 h-1 bg-[#C5A059]/20 rounded-full mt-2"></div>
        </div>

        {loading ? (
          <InstitutionalLoading message="Sincronizando Proyectos Institucionales..." />
        ) : proyectos.length === 0 ? (
          <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[3rem] p-20 text-center">
            <Layers className="mx-auto text-slate-700 mb-6" size={48} />
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No hay proyectos registrados en la bitácora institucional.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {proyectos.map(p => (
              <motion.div
                key={p.id}
                layout
                className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 hover:bg-white/[0.05] transition-all group relative overflow-hidden"
              >


                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-[#C5A059]/10 rounded-2xl">
                      <GraduationCap className="text-[#C5A059]" size={24} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[11px] font-black text-white uppercase tracking-wider mb-1 pr-10">{p.proyecto}</h4>
                      <p className="text-[9px] font-bold text-[#C5A059] uppercase tracking-widest opacity-80">{p.periodo}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Responsables</span>
                      <p className="text-[10px] font-bold text-slate-300 uppercase leading-relaxed">{p.docentesResponsables}</p>
                    </div>
                    <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Fecha Entrega</span>
                      <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500">
                        <Calendar size={12} />
                        {p.fechaEntrega}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block pl-2">Áreas Articuladas</span>
                    <div className="flex flex-wrap gap-2">
                      {p.areasArticuladas.map(a => (
                        <span key={a} className="text-[8px] font-black text-white/50 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>

                <div className="flex flex-wrap gap-4 pt-8 mt-auto border-t border-white/5">
                  {p.url && (
                    <a 
                      href={p.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex-1 min-w-[120px] flex items-center justify-center gap-3 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white font-black py-4 px-6 rounded-2xl text-[10px] uppercase tracking-widest transition-all border border-blue-600/20 shadow-lg shadow-blue-900/10"
                    >
                      <Eye size={18} /> VER
                    </a>
                  )}
                  <button 
                    onClick={() => exportPDF(p)}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-3 bg-[#C5A059]/10 hover:bg-[#C5A059] text-[#C5A059] hover:text-black font-black py-4 px-6 rounded-2xl text-[10px] uppercase tracking-widest transition-all border border-[#C5A059]/20 shadow-lg shadow-[#C5A059]/10"
                  >
                    <Download size={18} /> DESCARGAR
                  </button>
                  <button 
                    onClick={() => handleDelete(p.id)}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white font-black py-4 px-6 rounded-2xl text-[10px] uppercase tracking-widest transition-all border border-rose-500/20 shadow-lg shadow-rose-900/10"
                  >
                    <Trash2 size={18} /> BORRAR
                  </button>
                </div>

                  {p.actividades && p.actividades.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block pl-2">Actividades Cronogramadas</span>
                      <div className="space-y-2">
                        {p.actividades.map(act => (
                          <div key={act.id} className="flex items-center gap-3 bg-black/10 rounded-lg p-2 border border-white/5">
                            <span className="text-[8px] font-black text-[#C5A059] font-mono whitespace-nowrap">{act.fecha}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase flex-1">{act.descripcion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {status.text && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-4 border ${
              status.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' : 
              status.type === 'error' ? 'bg-rose-600 border-rose-500 text-white' : 
              'bg-blue-600 border-blue-500 text-white'
            }`}
          >
            {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-[10px] font-black uppercase tracking-widest">{status.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
