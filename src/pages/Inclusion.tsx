import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, setDoc, doc, addDoc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { GRADOS, DOCENTES, AREAS } from '../lib/constants';
import { useCustomLists } from '../hooks/useCustomLists';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  BrainCircuit,
  Plus, 
  Trash2, 
  Search, 
  FileText,
  Edit2,
  FileDown,
  Calendar,
  RefreshCw,
  UserCheck,
  ClipboardList,
  Heart,
  Stethoscope,
  Users,
  MessageSquarePlus,
  ChevronRight,
  Info,
  X
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';
import { useNotification } from '../context/NotificationContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN } from '../lib/pdfUtils';

interface SeguimientoPeriodo {
  id: string;
  fecha: string;
  docente: string;
  area: string;
  ajustesEvaluacion: string[];
  ajustesMetodologicos: string[];
  ajustesMateriales: string[];
  ajustesEntorno: string[];
}

interface EstudianteInclusion {
  id: string;
  fechaReporte: string;
  docenteDirector: string;
  nombre: string;
  grado: string;
  edad: string;
  condicionInclusion: string;
  subCondicion: string;
  subCondicionOtra?: string;
  tieneDiagnostico: 'SI' | 'NO';
  entidadMedica?: string;
  fechaDiagnostico?: string;
  estadoPIAR: string;
  barrerasAprendizaje: string[];
  seguimientos: SeguimientoPeriodo[];
  apoyoTerapeutico: string[];
  apoyoTerapeuticoOtro?: string;
  compromisoFamiliar: string;
  acuerdosFamilia: string;
  createdAt: string;
  updatedAt?: string;
}

const CONDICIONES_INCLUSION = [
  'TRASTORNO DEL ESPECTRO AUTISTA- TEA',
  'DISCAPACIDAD AUDITIVA',
  'DISCAPACIDAD VISUAL',
  'SORDOCEGUERA',
  'DISCAPACIDAD INTELECTUAL',
  'DISCAPACIDAD FÍSICA-MOVILIDAD',
  'TRASTORNO MENTAL',
  'TRASTORNO EN EL APRENDIZAJE ESCOLAR- TDAH O DISLEXIA',
  'TRASTORNOS EN LA VOZ Y HABLA-DISCAPACIDAD SISTÉMICA',
  'CAPACIDADES EXCEPCIONALES',
  'TALENTOS EXCEPCIONALES',
  'TRASTORNOS EMOCIONALES O CONDUCTUALES',
  'OTRA'
];

const BARRERAS = [
  'Metodológicas',
  'Actitudinales',
  'Comunicativas',
  'Físicas/Infraestructura'
];

const APOYOS_TERAPEUTICOS = [
  'Psicología',
  'Fonoaudiología',
  'Terapia Ocupacional',
  'Ninguno',
  'Otro'
];

const AJUSTES_EVALUACION = [
  'Tiempos extendidos en pruebas y actividades.',
  'Evaluaciones orales en sustitución de pruebas escritas.',
  'Reducción en la cantidad de preguntas o ejercicios.',
  'Uso de material de apoyo durante la evaluación (fichas, calculadora, apuntes).',
  'Evaluación fraccionada (por partes o en diferentes sesiones).',
  'Modificación en los criterios de calificación (priorizar proceso sobre resultado).'
];

const AJUSTES_METODOLOGICOS = [
  'Reducción de la carga académica y tareas en casa.',
  'Instrucciones dadas paso a paso (fraccionamiento de la información).',
  'Asignación de un "Tutor Par" (estudiante de apoyo en el aula).',
  'Explicación personalizada o retroalimentación individual y constante.',
  'Priorización de actividades prácticas sobre teóricas.',
  'Verificación de la comprensión de instrucciones antes de iniciar la actividad.'
];

const AJUSTES_MATERIALES = [
  'Uso prioritario de material visual (imágenes, pictogramas, mapas mentales).',
  'Uso de material concreto o manipulable (ábacos, regletas, bloques).',
  'Adaptación de textos (macrotipo/letra grande, resaltado de ideas clave).',
  'Permitir el uso de herramientas tecnológicas (grabadoras de voz, tablets, software lector).',
  'Entrega de resúmenes o esquemas previos a la clase.'
];

const AJUSTES_ENTORNO = [
  'Ubicación estratégica en el aula (lejos de distracciones o cerca del docente).',
  'Implementación de pausas activas programadas o "tiempos fuera".',
  'Anticipación de rutinas y cambios de actividad (uso de agendas visuales).',
  'Reducción de estímulos visuales o auditivos en el entorno de trabajo.',
  'Acuerdos conductuales y refuerzo positivo inmediato.'
];

export function Inclusion() {
  const { notify } = useNotification();
  const { docentes: listaDocentes } = useCustomLists();
  const [estudiantes, setEstudiantes] = useState<EstudianteInclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  // Form State
  const [form, setForm] = useState<Partial<EstudianteInclusion>>({
    fechaReporte: new Date().toISOString().split('T')[0],
    docenteDirector: '',
    nombre: '',
    grado: '',
    edad: '',
    condicionInclusion: '',
    subCondicion: '',
    tieneDiagnostico: 'NO',
    estadoPIAR: 'No aplica',
    barrerasAprendizaje: [],
    seguimientos: [],
    apoyoTerapeutico: [],
    compromisoFamiliar: 'Medio',
    acuerdosFamilia: ''
  });

  // Modal Seguimiento State
  const [segForm, setSegForm] = useState<Partial<SeguimientoPeriodo>>({
    fecha: new Date().toISOString().split('T')[0],
    docente: '',
    area: '',
    ajustesEvaluacion: [],
    ajustesMetodologicos: [],
    ajustesMateriales: [],
    ajustesEntorno: []
  });

  // Persistence Logic
  useEffect(() => {
    const saved = localStorage.getItem('inclusion_draft');
    if (saved) setForm(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('inclusion_draft', JSON.stringify(form));
  }, [form]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'estudiantes_inclusion'));
      const data: EstudianteInclusion[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      } as EstudianteInclusion));
      setEstudiantes(data);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'estudiantes_inclusion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.grado) {
      notify.error("Complete los campos obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nombre: form.nombre.toUpperCase().trim(),
        updatedAt: serverTimestamp()
      };
      
      if (editingId) {
        await setDoc(doc(db, 'estudiantes_inclusion', editingId), payload, { merge: true });
        notify.success("EXPEDIENTE ACTUALIZADO CORRECTAMENTE.");
      } else {
        await addDoc(collection(db, 'estudiantes_inclusion'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        notify.success("ESTUDIANTE REGISTRADO EN EL SISTEMA DE INCLUSIÓN.");
      }
      await fetchData();
      resetForm();
    } catch (e: any) {
      handleFirestoreError(e, editingId ? OperationType.UPDATE : OperationType.CREATE, 'estudiantes_inclusion');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      fechaReporte: new Date().toISOString().split('T')[0],
      docenteDirector: '',
      nombre: '',
      grado: '',
      edad: '',
      condicionInclusion: '',
      subCondicion: '',
      subCondicionOtra: '',
      tieneDiagnostico: 'NO',
      estadoPIAR: 'No aplica',
      barrerasAprendizaje: [],
      seguimientos: [],
      apoyoTerapeutico: [],
      compromisoFamiliar: 'Medio',
      acuerdosFamilia: ''
    });
    setEditingId(null);
  };

  const handleEdit = (est: EstudianteInclusion) => {
    setForm(est);
    setEditingId(est.id);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleDelete = (id: string) => {
    setConfirmAction(() => async () => {
      try {
        await deleteDoc(doc(db, 'estudiantes_inclusion', id));
        await fetchData();
        notify.success("REGISTRO ELIMINADO.");
      } catch (e) {
        notify.error("Error al eliminar.");
      }
    });
    setIsConfirmOpen(true);
  };

  const toggleSelection = (field: keyof EstudianteInclusion, val: string) => {
    const current = (form[field] as string[]) || [];
    if (current.includes(val)) {
      setForm({ ...form, [field]: current.filter(i => i !== val) });
    } else {
      setForm({ ...form, [field]: [...current, val] });
    }
  };

  const toggleSegSelection = (field: keyof SeguimientoPeriodo, val: string) => {
    const current = (segForm[field] as string[]) || [];
    if (current.includes(val)) {
      setSegForm({ ...segForm, [field]: current.filter(i => i !== val) });
    } else {
      setSegForm({ ...segForm, [field]: [...current, val] });
    }
  };

  const handleAddSeguimiento = () => {
    if (!segForm.docente || !segForm.area) {
      notify.error("Complete docente y área en el seguimiento.");
      return;
    }
    const newSeg: SeguimientoPeriodo = {
      ...segForm as SeguimientoPeriodo,
      id: Math.random().toString(36).substring(2)
    };
    setForm({ ...form, seguimientos: [...(form.seguimientos || []), newSeg] });
    setIsModalOpen(false);
    setSegForm({
      fecha: new Date().toISOString().split('T')[0],
      docente: '',
      area: '',
      ajustesEvaluacion: [],
      ajustesMetodologicos: [],
      ajustesMateriales: [],
      ajustesEntorno: []
    });
    notify.success("Seguimiento añadido localmente. Guarde el formulario para persistir.");
  };

  const filtered = useMemo(() => {
    return estudiantes.filter(e => 
      e.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
      e.grado.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [estudiantes, searchTerm]);

  const generatePDF = (est: EstudianteInclusion) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    const reportTitle = "EXPEDIENTE DE ATENCIÓN INTEGRAL E INCLUSIÓN";
    const introText = "Identificación, caracterización y plan individual de ajustes razonables (PIAR). Documento oficial de seguimiento institucional.";
    const startY = drawExecutiveHeader(doc, reportTitle, introText);

    autoTable(doc, {
      startY,
      theme: 'grid',
      head: [['DATOS BÁSICOS', 'DETALLE']],
      body: [
        ['ESTUDIANTE', est.nombre.toUpperCase()],
        ['GRADO', est.grado],
        ['EDAD', est.edad + ' AÑOS'],
        ['FECHA REPORTE', est.fechaReporte],
        ['DIRECTOR DE GRUPO', est.docenteDirector],
      ],
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9 },
      styles: { fontSize: 8 }
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      theme: 'grid',
      head: [['CARACTERIZACIÓN CLÍNICA', 'DETALLE']],
      body: [
        ['CONDICIÓN', est.condicionInclusion === 'OTRA' ? est.subCondicionOtra || 'OTRA' : est.condicionInclusion],
        ['SUB-CATEGORÍA', est.subCondicion],
        ['DIAGNÓSTICO MÉDICO', est.tieneDiagnostico === 'SI' ? 'SÍ' : 'NO'],
        ['ENTIDAD', est.entidadMedica || 'N/A'],
        ['FECHA DIAGNÓSTICO', est.fechaDiagnostico || 'N/A'],
      ],
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9 },
      styles: { fontSize: 8 }
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      theme: 'grid',
      head: [['GESTIÓN PEDAGÓGICA Y PIAR', 'ESTADO/DETALLE']],
      body: [
        ['ESTADO PIAR', est.estadoPIAR],
        ['BARRERAS', est.barrerasAprendizaje.join(', ')],
      ],
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9 },
      styles: { fontSize: 8 }
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      theme: 'grid',
      head: [['RED DE APOYO Y CORRESPONSABILIDAD', 'DETALLE']],
      body: [
        ['APOYO TERAPÉUTICO', est.apoyoTerapeutico.join(', ') + (est.apoyoTerapeuticoOtro ? ` (${est.apoyoTerapeuticoOtro})` : '')],
        ['COMPROMISO FAMILIAR', est.compromisoFamiliar],
        ['ACUERDOS Y TAREAS', est.acuerdosFamilia || 'SIN COMPROMISOS REGISTRADOS'],
      ],
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9 },
      styles: { fontSize: 8 }
    });

    if (est.seguimientos && est.seguimientos.length > 0) {
      doc.addPage();
      const segY = drawExecutiveHeader(doc, "HISTORIAL DE SEGUIMIENTO Y AJUSTES");
      
      est.seguimientos.forEach((s, i) => {
        autoTable(doc, {
          startY: i === 0 ? segY : (doc as any).lastAutoTable.finalY + 10,
          theme: 'grid',
          head: [[`SEGUIMIENTO #${i+1} - ${s.fecha} - ${s.area}`, 'AJUSTES APLICADOS']],
          body: [
            ['DOCENTE', s.docente],
            ['EVALUACIÓN', s.ajustesEvaluacion.length > 0 ? s.ajustesEvaluacion.join('\n• ') : 'NINGUNO'],
            ['METODOLOGÍA', s.ajustesMetodologicos.length > 0 ? s.ajustesMetodologicos.join('\n• ') : 'NINGUNO'],
            ['MATERIALES', s.ajustesMateriales.length > 0 ? s.ajustesMateriales.join('\n• ') : 'NINGUNO'],
            ['ENTORNO', s.ajustesEntorno.length > 0 ? s.ajustesEntorno.join('\n• ') : 'NINGUNO'],
          ],
          headStyles: { fillColor: PDF_COLORS.STEEL_BORDERS, textColor: [0,0,0], fontSize: 9 },
          styles: { fontSize: 7, cellPadding: 3 }
        });
      });
    }

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, totalPages);
    }

    doc.save(`Inclusion_${est.nombre.replace(/ /g, '_')}.pdf`);
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black tracking-widest text-xs uppercase">Cargando Módulo de Inclusión...</div>;

  return (
    <div className="flex flex-col gap-10 max-w-7xl mx-auto pb-20">
      <PageHeader 
        title="ATENCIÓN INTEGRAL A ESTUDIANTES (INCLUSIÓN)" 
        description="“Aquí no registramos dificultades… documentamos cómo las transformamos en oportunidades de aprendizaje.”"
      >
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 px-6 rounded-xl transition-all border border-white/10 disabled:opacity-50 uppercase text-[11px] tracking-widest"
            title="Actualizar Datos"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </PageHeader>

      <div className="space-y-8 animate-in fade-in duration-700">
        
        <form onSubmit={handleSave} className="space-y-8 animate-in fade-in duration-700">
          
          {/* Bloque 1 */}
          <div className="executive-card p-8 border-blue-500/10">
            <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/40">
                <ClipboardList size={20} />
              </div>
              <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">Bloque 1: Identificación y Contexto (Datos Básicos)</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha del Reporte</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="date" value={form.fechaReporte} onChange={e => setForm({...form, fechaReporte: e.target.value})} className="executive-input pl-12 w-full" required />
                </div>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Docente Director de Grupo</label>
                <select value={form.docenteDirector} onChange={e => setForm({...form, docenteDirector: e.target.value})} className="executive-input w-full" required>
                  <option value="">SELECCIONE DOCENTE...</option>
                  {listaDocentes.map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Edad</label>
                <input type="number" value={form.edad} onChange={e => setForm({...form, edad: e.target.value})} placeholder="AÑOS..." className="executive-input w-full" />
              </div>
              <div className="lg:col-span-3 space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre del Estudiante</label>
                <input type="text" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value.toUpperCase()})} placeholder="NOMBRES Y APELLIDOS..." className="executive-input w-full font-black text-lg" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Grado</label>
                <select value={form.grado} onChange={e => setForm({...form, grado: e.target.value})} className="executive-input w-full" required>
                  <option value="">CURSO...</option>
                  {GRADOS.map(g => <option key={g} value={g} className="bg-[#1A1A1A]">{g}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Bloque 2 */}
          <div className="executive-card p-8 border-emerald-500/10">
            <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-900/40">
                <Stethoscope size={20} />
              </div>
              <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">Bloque 2: Caracterización y Estatus Clínico</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Condición de Inclusión</label>
                <select 
                  value={form.condicionInclusion} 
                  onChange={e => setForm({...form, condicionInclusion: e.target.value, subCondicion: ''})} 
                  className="executive-input w-full"
                  required
                >
                  <option value="">SELECCIONE CONDICIÓN...</option>
                  {CONDICIONES_INCLUSION.map(c => <option key={c} value={c} className="bg-[#1A1A1A]">{c}</option>)}
                </select>
              </div>

              {form.condicionInclusion === 'OTRA' && (
                <div className="space-y-4 md:col-span-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Especifique la Condición</label>
                  <input 
                    type="text" 
                    value={form.subCondicionOtra} 
                    onChange={e => setForm({...form, subCondicionOtra: e.target.value.toUpperCase()})}
                    placeholder="DESCRIBA LA CONDICIÓN NO LISTADA..."
                    className="executive-input w-full bg-blue-900/10 border-blue-500/30 font-black"
                  />
                </div>
              )}

              <div className="space-y-4 md:col-span-2">
                <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <ChevronRight size={14} /> Sub-condición / Especificación del diagnóstico:
                </label>
                <input 
                  type="text" 
                  value={form.subCondicion} 
                  onChange={e => setForm({...form, subCondicion: e.target.value.toUpperCase()})}
                  placeholder="EJ: BAJA VISIÓN, CEGUERA, SORDERA PROFUNDA, TALENTO MATEMÁTICO..."
                  className="executive-input w-full bg-emerald-900/10 border-emerald-500/30 font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">¿Cuenta con Diagnóstico Médico Clínico?</label>
                <div className="flex gap-4 p-2 bg-black/40 rounded-2xl border border-white/5">
                  {['SI', 'NO'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm({...form, tieneDiagnostico: opt as 'SI' | 'NO'})}
                      className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase transition-all ${form.tieneDiagnostico === opt ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {form.tieneDiagnostico === 'SI' && (
                <>
                  <div className="space-y-2 animate-in fade-in duration-500">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Entidad que emite el diagnóstico</label>
                    <input type="text" value={form.entidadMedica} onChange={e => setForm({...form, entidadMedica: e.target.value.toUpperCase()})} className="executive-input w-full" placeholder="EJ: EPS, MÉDICO ESPECIALISTA..." />
                  </div>
                  <div className="space-y-2 animate-in fade-in duration-500">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha del Diagnóstico</label>
                    <input type="date" value={form.fechaDiagnostico} onChange={e => setForm({...form, fechaDiagnostico: e.target.value})} className="executive-input w-full" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bloque 3 */}
          <div className="executive-card p-8 border-indigo-500/10">
            <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
                <RefreshCw size={20} />
              </div>
              <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">Bloque 3: Gestión Pedagógica y PIAR</h3>
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado del PIAR (Plan Individual de Ajustes Razonables)</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['No aplica', 'En diseño', 'Implementado', 'En evaluación'].map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setForm({...form, estadoPIAR: e})}
                        className={`text-left px-5 py-4 rounded-xl text-[10px] font-black uppercase transition-all tracking-tight border ${form.estadoPIAR === e ? 'bg-indigo-600 text-white border-indigo-400 shadow-xl' : 'bg-white/5 text-slate-500 border-white/5'}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Barreras de Aprendizaje Identificadas</label>
                  <div className="flex flex-wrap gap-3">
                    {BARRERAS.map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleSelection('barrerasAprendizaje', b)}
                        className={`flex-1 px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all border ${form.barrerasAprendizaje?.includes(b) ? 'bg-amber-600/20 text-amber-500 border-amber-600/40' : 'bg-white/5 text-slate-500 border-white/5'}`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-indigo-900/10 p-8 rounded-[2rem] border border-indigo-500/20 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[12px] font-black text-indigo-400 uppercase tracking-[0.2em] italic">Seguimiento de Periodo por Docente</h4>
                    <p className="text-[9px] text-slate-400 font-medium uppercase mt-1">Registros periódicos de ajustes y avances pedagógicos en el aula.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-900/40 transition-all flex items-center gap-3 border border-white/10"
                  >
                    <Plus size={18} />
                    [+] Añadir Seguimiento de Periodo
                  </button>
                </div>

                {form.seguimientos && form.seguimientos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {form.seguimientos.map((s, idx) => (
                      <div key={idx} className="bg-black/40 p-5 rounded-2xl border border-white/5 flex flex-col gap-3 group relative">
                        <button 
                           type="button"
                           onClick={() => setForm({...form, seguimientos: form.seguimientos?.filter((_, i) => i !== idx)})}
                           className="absolute top-4 right-4 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                           <Trash2 size={16} />
                        </button>
                        <div className="flex justify-between items-center text-[9px] font-black text-indigo-400 uppercase border-b border-white/5 pb-2">
                           <span>DOCENTE: {s.docente}</span>
                           <span>FECHA: {s.fecha}</span>
                        </div>
                        <div className="text-[10px] font-black text-white italic uppercase">{s.area}</div>
                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-tight">
                          {s.ajustesEvaluacion.length + s.ajustesMetodologicos.length + s.ajustesMateriales.length + s.ajustesEntorno.length} AJUSTES REGISTRADOS
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-10 border-2 border-dashed border-white/5 rounded-3xl text-center opacity-30 flex flex-col items-center gap-3 uppercase font-black text-[10px] tracking-widest text-slate-500">
                     <Info size={32} />
                     Sin seguimientos de periodo registrados para este expediente
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bloque 4 */}
          <div className="executive-card p-8 border-rose-500/10">
            <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
              <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-900/40">
                <Heart size={20} />
              </div>
              <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">Bloque 4: Red de Apoyo y Corresponsabilidad</h3>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Apoyo Terapéutico Externo / Complementario</label>
                <div className="flex flex-wrap gap-3">
                  {APOYOS_TERAPEUTICOS.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleSelection('apoyoTerapeutico', a)}
                      className={`flex-1 min-w-[150px] px-5 py-4 rounded-xl text-[10px] font-black uppercase transition-all border ${form.apoyoTerapeutico?.includes(a) ? 'bg-rose-600 text-white border-rose-400 shadow-xl' : 'bg-white/5 text-slate-500 border-white/5'}`}
                    >
                      {a}
                    </button>
                  ))}
                  {form.apoyoTerapeutico?.includes('Otro') && (
                    <input 
                       type="text" 
                       value={form.apoyoTerapeuticoOtro}
                       onChange={e => setForm({...form, apoyoTerapeuticoOtro: e.target.value.toUpperCase()})}
                       placeholder="ESPECIFIQUE EL APOYO..."
                       className="executive-input w-full border-rose-500/20 font-black mt-2"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nivel de Compromiso Familiar</label>
                  <select value={form.compromisoFamiliar} onChange={e => setForm({...form, compromisoFamiliar: e.target.value})} className="executive-input w-full">
                     {['Alto', 'Medio', 'Bajo', 'Nulo'].map(v => <option key={v} value={v} className="bg-[#1A1A1A]">{v.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Acuerdos o Tareas para la Familia (Compromisos)</label>
                  <textarea 
                    value={form.acuerdosFamilia} 
                    onChange={e => setForm({...form, acuerdosFamilia: e.target.value.toUpperCase()})}
                    className="executive-input w-full min-h-[100px] py-4"
                    placeholder="CONSIGNAR AQUÍ LOS ACUERDOS LOGRADOS CON EL ACUDIENTE..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Acciones Finales */}
          <div className="flex items-center gap-4 pt-10 sticky bottom-8 z-50">
             <button 
                type="submit" 
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-6 rounded-[2rem] font-black text-[12px] tracking-[0.3em] uppercase transition-all shadow-2xl flex items-center justify-center gap-4 hover:-translate-y-2 active:scale-[0.98] border border-white/10"
             >
                {saving ? <RefreshCw className="animate-spin" /> : <Save size={24} />}
                {editingId ? 'ACTUALIZAR EXPEDIENTE' : 'GUARDAR EXPEDIENTE'}
             </button>
             {editingId && (
               <button 
                  type="button" 
                  onClick={resetForm}
                  className="p-6 bg-rose-600/10 text-rose-500 rounded-[2rem] hover:bg-rose-600 hover:text-white transition-all border border-rose-500/20"
               >
                  <Trash2 size={24} />
               </button>
             )}
          </div>

        </form>

        {/* Bitácora Horizontal (Full Width Table) */}
        <div className="mt-12 space-y-8 animate-in slide-in-from-bottom-8 duration-700">
           <div className="executive-header-section flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-blue-500">
                   <ClipboardList size={24} />
                </div>
                <div>
                   <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Bitácora de Estudiantes</h3>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Visualización integral de la población caracterizada ({filtered.length} expedientes)</p>
                </div>
              </div>

              <div className="flex-1 max-w-xl relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="FILTRAR POR NOMBRE O GRADO..." 
                  className="executive-input w-full pl-16 py-4 bg-black/40" 
                />
              </div>
           </div>

           <div className="executive-card overflow-hidden border-white/5">
              <div className="overflow-x-auto custom-scrollbar">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="bg-[#1e1e1e] border-b border-white/5">
                          <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Estudiante / Director</th>
                          <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Grado</th>
                          <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Condición / Diagnóstico</th>
                          <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Plan PIAR</th>
                          <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                       {filtered.length === 0 ? (
                         <tr>
                            <td colSpan={5} className="py-20 text-center opacity-20">
                               <div className="flex flex-col items-center gap-4">
                                  <Users size={64} className="text-slate-500" />
                                  <p className="text-[12px] font-black uppercase tracking-[0.4em]">Sin registros que coincidan con la búsqueda</p>
                               </div>
                            </td>
                         </tr>
                       ) : (
                         filtered.map(est => (
                            <tr key={est.id} className={`hover:bg-blue-600/5 transition-all group ${editingId === est.id ? 'bg-blue-600/10' : ''}`}>
                               <td className="px-10 py-8">
                                  <div className="text-white font-black text-sm italic uppercase tracking-tighter group-hover:text-blue-400 transition-colors">{est.nombre}</div>
                                  <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">Dir: {est.docenteDirector} • {est.fechaReporte}</div>
                               </td>
                               <td className="px-10 py-8 text-center text-slate-400 font-black italic">{est.grado}</td>
                               <td className="px-10 py-8">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-[#D4AF37] uppercase tracking-widest">
                                       {est.condicionInclusion === 'OTRA' ? (est.subCondicionOtra || 'OTRA') : est.condicionInclusion}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter italic">
                                       {est.subCondicion}
                                       {est.tieneDiagnostico === 'SI' ? ' • DIAGNÓSTICO MÉDICO' : ' • PENDIENTE DIAGNÓSTICO'}
                                    </span>
                                  </div>
                               </td>
                               <td className="px-10 py-8 text-center">
                                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border shadow-sm ${est.estadoPIAR === 'Implementado' ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20' : est.estadoPIAR === 'En diseño' ? 'bg-amber-600/10 text-amber-400 border-amber-500/20' : 'bg-rose-600/10 text-rose-400 border-rose-500/20'}`}>
                                    {est.estadoPIAR.toUpperCase()}
                                  </span>
                               </td>
                               <td className="px-10 py-8">
                                  <div className="flex justify-end gap-3 translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                    <button 
                                      onClick={() => generatePDF(est)}
                                      className="text-slate-500 hover:text-white p-3 bg-white/5 hover:bg-blue-600 rounded-2xl transition-all border border-white/5 shadow-xl"
                                      title="Generar Informe PDF"
                                    >
                                      <FileDown size={18} />
                                    </button>
                                    <button 
                                      onClick={() => handleEdit(est)} 
                                      className="text-emerald-500 hover:text-white p-3 bg-emerald-600/10 hover:bg-emerald-600 rounded-2xl transition-all border border-emerald-500/10 shadow-xl"
                                      title="Editar Expediente"
                                    >
                                      <Edit2 size={18} />
                                    </button>
                                      <button 
                                        onClick={() => handleDelete(est.id)} 
                                        className="text-rose-500 hover:text-white p-3 bg-rose-500/10 hover:bg-rose-600 rounded-2xl transition-all border border-rose-500/10 shadow-xl"
                                        title="Eliminar Registro"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                  </div>
                               </td>
                            </tr>
                         ))
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

      </div>

      {/* Modal Seguimiento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-[#020617]/95 backdrop-blur-xl" onClick={() => setIsModalOpen(false)} />
           <div className="relative w-full max-w-4xl bg-[#121212] rounded-[3rem] border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
              
            <div className="p-8 border-b border-indigo-500 bg-indigo-600 flex items-center justify-between shrink-0 shadow-2xl">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-white/20 text-white rounded-2xl flex items-center justify-center shadow-inner backdrop-blur-md">
                  <MessageSquarePlus size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Añadir Seguimiento de Periodo</h3>
                  <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mt-1 opacity-90">Sistematización de ajustes razonables y avances pedagógicos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-12 h-12 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center border border-white/20"
              >
                 <X size={24} />
              </button>
            </div>

              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-12">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</label>
                       <input type="date" value={segForm.fecha} onChange={e => setSegForm({...segForm, fecha: e.target.value})} className="executive-input w-full" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Docente Responsable</label>
                       <select value={segForm.docente} onChange={e => setSegForm({...segForm, docente: e.target.value})} className="executive-input w-full">
                          <option value="">SELECCIONE DOCENTE...</option>
                          {listaDocentes.map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Área Académica</label>
                       <select value={segForm.area} onChange={e => setSegForm({...segForm, area: e.target.value})} className="executive-input w-full">
                          <option value="">SELECCIONE ÁREA...</option>
                          {AREAS.map(a => <option key={a} value={a} className="bg-[#1A1A1A]">{a}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {/* Ajuste 1 */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-black text-lg border border-blue-500/20 shadow-lg shadow-blue-900/40">1</div>
                          <div>
                            <h5 className="text-[13px] font-black text-white uppercase tracking-tight italic">Ajustes en la Evaluación</h5>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Adaptaciones al proceso evaluativo institucional.</p>
                          </div>
                       </div>
                       <div className="space-y-3 pl-14">
                          {AJUSTES_EVALUACION.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleSegSelection('ajustesEvaluacion', opt)}
                              className={`w-full text-left p-5 rounded-xl text-xs font-bold border transition-all ${segForm.ajustesEvaluacion?.includes(opt) ? 'bg-blue-600/30 text-white border-blue-400 shadow-lg' : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-blue-500/20'}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 ${segForm.ajustesEvaluacion?.includes(opt) ? 'bg-blue-500 border-blue-400 text-white' : 'border-white/20 text-transparent'}`}>
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                </div>
                                <span className="flex-1 leading-snug">{opt}</span>
                              </div>
                            </button>
                          ))}
                       </div>
                    </div>
                    {/* Ajuste 2 */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-black text-lg border border-emerald-500/20 shadow-lg shadow-emerald-900/40">2</div>
                          <div>
                            <h5 className="text-[13px] font-black text-white uppercase tracking-tight italic">Ajustes Metodológicos</h5>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Estrategias de enseñanza y mediación pedagógica.</p>
                          </div>
                       </div>
                       <div className="space-y-3 pl-14">
                          {AJUSTES_METODOLOGICOS.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleSegSelection('ajustesMetodologicos', opt)}
                              className={`w-full text-left p-5 rounded-xl text-xs font-bold border transition-all ${segForm.ajustesMetodologicos?.includes(opt) ? 'bg-emerald-600/30 text-white border-emerald-400 shadow-lg' : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-emerald-500/20'}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 ${segForm.ajustesMetodologicos?.includes(opt) ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-white/20 text-transparent'}`}>
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                </div>
                                <span className="flex-1 leading-snug">{opt}</span>
                              </div>
                            </button>
                          ))}
                       </div>
                    </div>
                    {/* Ajuste 3 */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-black text-lg border border-indigo-500/20 shadow-lg shadow-indigo-900/40">3</div>
                          <div>
                            <h5 className="text-[13px] font-black text-white uppercase tracking-tight italic">Ajustes en Materiales</h5>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Recursos didácticos y acceso a la información.</p>
                          </div>
                       </div>
                       <div className="space-y-3 pl-14">
                          {AJUSTES_MATERIALES.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleSegSelection('ajustesMateriales', opt)}
                              className={`w-full text-left p-5 rounded-xl text-xs font-bold border transition-all ${segForm.ajustesMateriales?.includes(opt) ? 'bg-indigo-600/30 text-white border-indigo-400 shadow-lg' : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-indigo-500/20'}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 ${segForm.ajustesMateriales?.includes(opt) ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-white/20 text-transparent'}`}>
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                </div>
                                <span className="flex-1 leading-snug">{opt}</span>
                              </div>
                            </button>
                          ))}
                       </div>
                    </div>
                    {/* Ajuste 4 */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center font-black text-lg border border-rose-500/20 shadow-lg shadow-rose-900/40">4</div>
                          <div>
                            <h5 className="text-[13px] font-black text-white uppercase tracking-tight italic">Ajustes de Entorno</h5>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Clima de aula, comportamiento y organización.</p>
                          </div>
                       </div>
                       <div className="space-y-3 pl-14">
                          {AJUSTES_ENTORNO.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleSegSelection('ajustesEntorno', opt)}
                              className={`w-full text-left p-5 rounded-xl text-xs font-bold border transition-all ${segForm.ajustesEntorno?.includes(opt) ? 'bg-rose-600/30 text-white border-rose-400 shadow-lg' : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-rose-500/20'}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 ${segForm.ajustesEntorno?.includes(opt) ? 'bg-rose-500 border-rose-400 text-white' : 'border-white/20 text-transparent'}`}>
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                </div>
                                <span className="flex-1 leading-snug">{opt}</span>
                              </div>
                            </button>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t border-white/5 flex gap-4 shrink-0 bg-black/60 backdrop-blur-md">
                 <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 rounded-2xl bg-white/5 text-slate-500 font-black text-[10px] tracking-[0.2em] uppercase transition-all hover:bg-white/10 hover:text-white border border-white/5">CANCELAR REGISTRO</button>
                 <button onClick={handleAddSeguimiento} className="flex-[2] py-5 rounded-2xl bg-indigo-600 text-white font-black text-[10px] tracking-[0.2em] uppercase transition-all hover:bg-indigo-700 shadow-2xl shadow-indigo-900/50 border border-white/10 active:scale-[0.98]">REGISTRAR Y ADJUNTAR SEGUIMIENTO AL EXPEDIENTE</button>
              </div>

           </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={isConfirmOpen} 
        onCancel={() => setIsConfirmOpen(false)} 
        onConfirm={() => {
          setIsConfirmOpen(false);
          confirmAction?.();
        }}
        message="¿ESTÁ SEGURO DE ELIMINAR ESTE EXPEDIENTE DE INCLUSIÓN? ESTA ACCIÓN NO SE PUEDE DESHACER."
        isDangerous
      />

    </div>
  );
}
