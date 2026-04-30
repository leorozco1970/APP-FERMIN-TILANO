import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  addDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  deleteDoc 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Plus, 
  Trash2, 
  Edit2, 
  Search,
  LayoutDashboard,
  ShieldCheck,
  BookOpen,
  Users,
  Handshake,
  Calendar,
  Clock,
  Briefcase,
  GraduationCap,
  Users2,
  DollarSign,
  Download,
  ExternalLink,
  Activity
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ReTooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ValoracionItem {
  area: string;
  componente: string;
  scores: { [period: string]: number | '' };
}

interface EvaluacionReport {
  id: string;
  gestion: 'DIRECTIVA' | 'ACADEMICA' | 'COMUNITARIA' | 'FINANCIERA';
  titulo: string;
  descripcion: string;
  integrantes: string;
  pmiUrl?: string;
  cronograma?: string;
  cronogramaItems?: Array<{ date: string; activity: string }>;
  fechaManual: string;
  año: string;
  valoraciones: ValoracionItem[];
  periods: string[];
  authorEmail: string;
  createdAt: any;
}

const GESTION_CONFIG = {
  DIRECTIVA: {
    label: 'Gestión Directiva',
    icon: Briefcase,
    color: 'from-blue-600 to-blue-900',
    data: [
      { area: 'Direccionamiento estratégico y horizonte institucional', componentes: ['Misión, visión y principios en el marco de una institución integrada', 'Conocimiento y apropiación del direccionamiento', 'Metas institucionales'] },
      { area: 'Gestión Estratégica', componentes: ['Articulación de planes, proyectos y acciones', 'Uso de información (interna y externa) para la toma de decisiones', 'Seguimiento y autoevaluación'] },
      { area: 'Gobierno Escolar y Comunidad Educativa', componentes: ['Comité de convivencia', 'Personero estudiantil', 'Consejo de padres de familia'] },
      { area: 'Cultura Institucional', componentes: ['Sentido de pertenencia', 'Trabajo en equipo', 'Reconocimiento de logros'] },
      { area: 'Clima Escolar', componentes: ['Pertenencia y participación', 'Ambiente físico', 'Inducción a los nuevos estudiantes', 'Motivación hacia el aprendizaje'] }
    ]
  },
  ACADEMICA: {
    label: 'Gestión Académica',
    icon: GraduationCap,
    color: 'from-emerald-600 to-emerald-900',
    data: [
      { 
        area: 'Diseño pedagógico (curricular)', 
        componentes: [
          'Plan de estudios', 
          'Enfoque metodológico', 
          'Recursos para el aprendizaje', 
          'Jornada escolar', 
          'Evaluación'
        ] 
      },
      { 
        area: 'Prácticas pedagógicas', 
        componentes: [
          'Opciones didácticas para las áreas, asignaturas y proyectos transversales', 
          'Estrategias para las tareas escolares', 
          'Uso articulado de los recursos para el aprendizaje', 
          'Uso de los tiempos para el aprendizaje'
        ] 
      },
      { 
        area: 'Gestión de aula', 
        componentes: [
          'Relación pedagógica', 
          'Planeación de clases', 
          'Estilo pedagógico', 
          'Evaluación en el aula'
        ] 
      },
      { 
        area: 'Seguimiento académico', 
        componentes: [
          'Seguimiento a los resultados académicos', 
          'Uso pedagógico de las evaluaciones externas', 
          'Seguimiento a la asistencia', 
          'Actividades de recuperación', 
          'Apoyo pedagógico para estudiantes con dificultades de aprendizaje', 
          'Seguimiento a los egresados'
        ] 
      }
    ]
  },
  COMUNITARIA: {
    label: 'Gestión de la Comunidad',
    icon: Users2,
    color: 'from-purple-600 to-purple-900',
    data: [
      { area: 'Inclusión', componentes: ['Accesibilidad física', 'Atención educativa a grupos poblacionales o en situación de vulnerabilidad que experimentan barreras al aprendizaje y la participación'] },
      { area: 'Proyección a la comunidad', componentes: ['Escuela de padres', 'Oferta de servicios a la comunidad', 'Uso de la planta física y de los medios', 'Servicio social estudiantil'] },
      { area: 'Participación y convivencia', componentes: ['Participación de los estudiantes', 'Asamblea y consejo de padres de familia', 'Participación de las familias'] },
      { area: 'Prevención de riesgos', componentes: ['Prevención de riesgos físicos', 'Prevención de riesgos psicosociales', 'Programas de seguridad'] }
    ]
  },
  FINANCIERA: {
    label: 'Gestión Administrativa y Financiera',
    icon: DollarSign,
    color: 'from-amber-600 to-amber-900',
    data: [
      { area: 'Apoyo a la gestión académica', componentes: ['Proceso de matrícula', 'Archivo académico', 'Boletines de notas'] },
      { area: 'Administración de la planta física y de los recursos', componentes: ['Mantenimiento de la planta física', 'Adecuación y embellecimiento de la planta física', 'Seguimiento al uso de los espacios', 'Adquisición y mantenimiento de los recursos para el aprendizaje', 'Seguridad y protección'] },
      { area: 'Administración de servicios complementarios', componentes: ['Transporte, restaurante, cafetería y salud', 'Apoyo a estudiantes con necesidades educativas especiales'] },
      { area: 'Talento humano', componentes: ['Perfiles, inducción, formación y capacitación, evaluación del desempeño, estímulos, bienestar'] },
      { area: 'Apoyo financiero y contable', componentes: ['Presupuesto anual del fondo de servicios educativos (FSE)', 'Contabilidad, ingresos y gastos, control fiscal'] }
    ]
  }
};

export function EvaluacionInstitucional() {
  const [activeTab, setActiveTab] = useState<'DIRECTIVA' | 'ACADEMICA' | 'COMUNITARIA' | 'FINANCIERA' | 'ANALISIS'>('DIRECTIVA');
  const [reports, setReports] = useState<EvaluacionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    integrantes: '',
    pmiUrl: '',
    cronogramaItems: [] as Array<{ date: string; activity: string }>,
    cronogramaDate: new Date().toISOString().split('T')[0],
    cronogramaText: '',
    fechaManual: new Date().toISOString().split('T')[0],
    año: new Date().getFullYear().toString(),
    valoraciones: [] as ValoracionItem[],
    periods: ['2024-2025', '2025-2026']
  });

  useEffect(() => {
    // Initialize valoraciones based on activeTab
    if (activeTab === 'ANALISIS') return;

    const config = GESTION_CONFIG[activeTab];
    const initialVals: ValoracionItem[] = [];
    config.data.forEach(area => {
      area.componentes.forEach(comp => {
        const scores: { [k: string]: number | '' } = {};
        formData.periods.forEach(p => scores[p] = '');
        initialVals.push({ area: area.area, componente: comp, scores });
      });
    });
    
    setFormData(prev => ({
      ...prev,
      valoraciones: initialVals
    }));
  }, [activeTab]);

  const addPeriod = () => {
    const lastPeriod = formData.periods[formData.periods.length - 1];
    let newPeriod = '';
    if (lastPeriod.includes('-')) {
      const [startYear, endYear] = lastPeriod.split('-').map(Number);
      newPeriod = `${startYear + 1}-${endYear + 1}`;
    } else {
      newPeriod = (Number(lastPeriod) + 1).toString();
    }
    
    // Allow user to confirm or change
    const customPeriod = prompt('Ingrese el periodo de valoración (ej: 2026-2027):', newPeriod);
    if (!customPeriod) return;

    setFormData(prev => ({
      ...prev,
      periods: [...prev.periods, customPeriod],
      valoraciones: prev.valoraciones.map(v => ({
        ...v,
        scores: { ...v.scores, [customPeriod]: '' }
      }))
    }));
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const [modalMessage, setModalMessage] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'evaluacion_institucional'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EvaluacionReport));
      setReports(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'evaluacion_institucional');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descripcion || !formData.integrantes) {
      setModalType('error');
      setModalMessage('POR FAVOR COMPLETE LOS CAMPOS OBLIGATORIOS (ANALISIS E INTEGRANTES).');
      setModalOpen(true);
      return;
    }

    try {
      const reportData = {
        gestion: activeTab,
        titulo: `EVALUACIÓN ${activeTab} - ${formData.fechaManual}`,
        descripcion: formData.descripcion,
        integrantes: formData.integrantes,
        pmiUrl: formData.pmiUrl,
        cronograma: formData.cronogramaText ? `${formData.cronogramaDate}|${formData.cronogramaText}` : '',
        cronogramaItems: formData.cronogramaItems,
        fechaManual: formData.fechaManual,
        año: formData.fechaManual.split('-')[0],
        valoraciones: formData.valoraciones,
        periods: formData.periods,
        authorUid: auth.currentUser?.uid || 'ANONYMOUS',
        authorEmail: auth.currentUser?.email || 'ANONYMOUS',
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await setDoc(doc(db, 'evaluacion_institucional', editingId), reportData, { merge: true });
        setModalMessage('EVALUACIÓN ACTUALIZADA CON ÉXITO.');
      } else {
        await addDoc(collection(db, 'evaluacion_institucional'), {
          ...reportData,
          createdAt: serverTimestamp()
        });
        setModalMessage('EVALUACIÓN REGISTRADA CON ÉXITO.');
      }

      setModalType('success');
      setModalOpen(true);
      setIsFormOpen(false);
      setEditingId(null);
      
      const config = GESTION_CONFIG[activeTab];
      const initialVals: ValoracionItem[] = [];
      config.data.forEach(area => {
        area.componentes.forEach(comp => {
          const scores: { [k: string]: number | '' } = {};
          ['2024-2025', '2025-2026'].forEach(p => scores[p] = '');
          initialVals.push({ area: area.area, componente: comp, scores });
        });
      });

      setFormData({
        titulo: '',
        descripcion: '',
        integrantes: '',
        pmiUrl: '',
        cronogramaItems: [] as Array<{ date: string; activity: string }>,
        cronogramaDate: new Date().toISOString().split('T')[0],
        cronogramaText: '',
        fechaManual: new Date().toISOString().split('T')[0],
        año: new Date().getFullYear().toString(),
        valoraciones: initialVals,
        periods: ['2024-2025', '2025-2026']
      });
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'evaluacion_institucional');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'evaluacion_institucional', id));
      setModalType('success');
      setModalMessage('REGISTRO ELIMINADO.');
      setModalOpen(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `evaluacion_institucional/${id}`);
    }
  };

  const exportToPDF = (report: EvaluacionReport) => {
    const doc = new jsPDF();
    const managementLabel = GESTION_CONFIG[report.gestion].label;
    
    doc.setFontSize(20);
    doc.text(`Informe de Gestión: ${managementLabel}`, 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Título: ${report.titulo}`, 14, 32);
    doc.text(`Año: ${report.año}`, 14, 40);
    doc.text(`Fecha: ${report.fechaManual}`, 14, 48);
    doc.text(`Integrantes: ${report.integrantes}`, 14, 56);
    
    if (report.pmiUrl) {
      doc.text(`PMI URL: ${report.pmiUrl}`, 14, 64);
    }
    
    doc.text('Análisis y Resultados:', 14, 72);
    const splitText = doc.splitTextToSize(report.descripcion, 180);
    doc.text(splitText, 14, 78);
    
    let currentY = 78 + (splitText.length * 7);
    
    if (report.cronograma) {
      currentY += 10;
      doc.text('Cronograma de Actividades:', 14, currentY);
      currentY += 6;
      const cronoLines = doc.splitTextToSize(report.cronograma, 180);
      doc.text(cronoLines, 14, currentY);
      currentY += (cronoLines.length * 7);
    }

    const tableHeaders = ['Proceso', 'Componente', ...report.periods.map(p => `V. ${p}`)];
    const tableData = report.valoraciones.map((v, i) => {
      const area = (i === 0 || report.valoraciones[i-1].area !== v.area) ? v.area : '';
      return [area, v.componente, ...report.periods.map(p => v.scores[p] || '-')];
    });

    autoTable(doc, {
      startY: currentY + 10,
      head: [tableHeaders],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`Evaluacion_${report.gestion}_${report.año}.pdf`);
  };

  const filteredReports = reports.filter(r => 
    r.gestion === activeTab &&
    (r.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
     r.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getChartData = (report: EvaluacionReport) => {
    // Group by Process (Area) and average scores per period
    const areaMap = new Map<string, { [period: string]: number[] }>();
    
    report.valoraciones.forEach(v => {
      if (!areaMap.has(v.area)) {
        areaMap.set(v.area, {});
      }
      const periodScores = areaMap.get(v.area)!;
      report.periods.forEach(p => {
        if (!periodScores[p]) periodScores[p] = [];
        if (typeof v.scores[p] === 'number') {
          periodScores[p].push(v.scores[p] as number);
        }
      });
    });

    return Array.from(areaMap.entries()).map(([area, periods]) => {
      const dataPoint: any = { area };
      report.periods.forEach(p => {
        const scores = periods[p] || [];
        dataPoint[p] = scores.length > 0 
          ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
          : 0;
      });
      return dataPoint;
    });
  };

  const tabs = [
    { id: 'DIRECTIVA', label: 'Gestión Directiva', icon: Briefcase, color: 'from-blue-600 to-blue-900' },
    { id: 'ACADEMICA', label: 'Gestión Académica', icon: GraduationCap, color: 'from-emerald-600 to-emerald-900' },
    { id: 'COMUNITARIA', label: 'Gestión Comunitaria', icon: Users2, color: 'from-purple-600 to-purple-900' },
    { id: 'FINANCIERA', label: 'Gestión Financiera', icon: DollarSign, color: 'from-amber-600 to-amber-900' },
    { id: 'ANALISIS', label: 'Análisis Institucional', icon: Activity, color: 'from-rose-600 to-rose-900' }
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-700 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader 
        title="Evaluación Institucional" 
        description="Alineada con los lineamientos de la Guía 34 del MEN, la Autoevaluación Institucional opera como el instrumento técnico y sistemático para auditar el estado de nuestras cuatro áreas de gestión. Este módulo organiza el diagnóstico de la realidad escolar, brindando a directivos y docentes un acceso ágil y directo a los resultados."
      />

      {/* Luxury Tab Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setEditingId(null); setIsFormOpen(false); }}
              className={`relative overflow-hidden group p-6 rounded-[2.5rem] transition-all duration-500 border-2 ${
                isActive 
                  ? 'bg-white shadow-[0_30px_70px_-15px_rgba(255,255,255,0.1)] border-[#C5A059]/50' 
                  : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${tab.color} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`} />
              <div className="flex items-center gap-4 relative z-10">
                <div className={`p-4 rounded-2xl transition-all duration-500 ${
                  isActive ? `bg-gradient-to-br ${tab.color} text-white shadow-xl scale-110 shadow-blue-900/30` : 'bg-white/5 text-slate-400 group-hover:scale-105'
                }`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <h3 className={`text-[14px] font-black uppercase tracking-widest ${isActive ? 'text-blue-600' : 'text-slate-200'} drop-shadow-md`}>
                    {tab.label}
                  </h3>
                  <p className={`text-[10px] font-bold uppercase tracking-tighter mt-1 ${isActive ? 'text-slate-600' : 'text-slate-500'}`}>Guía 34 MEN</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Actions and Content */}
      <div className="bg-black/40 backdrop-blur-3xl rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden relative group">
        <div className="absolute inset-0 bg-blue-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div className="p-8 lg:p-12 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-10 relative z-10">
          <div className="flex flex-col">
            <h2 className="text-3xl lg:text-5xl font-black text-white uppercase tracking-tighter italic leading-tight mb-4 drop-shadow-2xl">
              {activeTab === 'DIRECTIVA' ? 'Gestión Directiva' :
               activeTab === 'ACADEMICA' ? 'Gestión Académica' :
               activeTab === 'COMUNITARIA' ? 'Gestión de la Comunidad' :
               activeTab === 'FINANCIERA' ? 'Gestión Administrativa y Financiera' :
               'Análisis Institucional Estratégico'}
            </h2>
            <div className="flex items-center gap-4">
              <span className="w-12 h-1 bg-[#D4AF37] rounded-full shadow-[0_0_15px_rgba(212,175,55,0.5)]"></span>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] italic leading-none">Reporte Estratégico e Institucional</p>
            </div>
          </div>

          {activeTab !== 'ANALISIS' && (
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="relative group w-full sm:w-auto">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="text"
                  placeholder="BUSCAR EN ESTA GESTIÓN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-14 pr-8 py-5 bg-black/40 border border-white/10 rounded-2xl focus:bg-black/60 focus:border-blue-500/50 w-full sm:w-80 transition-all font-black text-[10px] tracking-widest text-white placeholder:text-slate-700 shadow-2xl"
                />
              </div>
              <button 
                onClick={() => { 
                  setIsFormOpen(!isFormOpen); 
                  setEditingId(null); 
                  setFormData({ 
                    titulo: '', 
                    descripcion: '', 
                    integrantes: '',
                    pmiUrl: '',
                    cronogramaItems: [] as Array<{ date: string; activity: string }>,
                    cronogramaDate: new Date().toISOString().split('T')[0],
                    cronogramaText: '',
                    fechaManual: new Date().toISOString().split('T')[0],
                    año: new Date().getFullYear().toString(),
                    valoraciones: (() => {
                    const initialVals: ValoracionItem[] = [];
                    GESTION_CONFIG[activeTab as keyof typeof GESTION_CONFIG].data.forEach(area => {
                      area.componentes.forEach(comp => {
                        const scores: { [k: string]: number | '' } = {};
                        ['2024-2025', '2025-2026'].forEach(p => scores[p] = '');
                        initialVals.push({ area: area.area, componente: comp, scores });
                      });
                    });
                    return initialVals;
                  })(),
                  periods: ['2024-2025', '2025-2026']
                }); 
                }}
                className={`w-full sm:w-auto px-10 py-5 rounded-2xl transition-all duration-500 flex items-center justify-center gap-4 shadow-2xl group border border-white/5 ${
                  isFormOpen 
                    ? 'bg-rose-600/10 text-rose-500 hover:bg-rose-600 hover:text-white border-rose-500/20' 
                    : 'bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white border-blue-500/20'
                }`}
              >
                <Plus className={`transition-transform duration-700 ${isFormOpen ? 'rotate-45' : 'group-hover:rotate-90'}`} size={20} strokeWidth={3} />
                <span className="text-[11px] font-black uppercase tracking-widest">{isFormOpen ? 'CERRAR PANEL' : 'NUEVO REPORTE'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="p-8 lg:p-12 relative z-10">
          <AnimatePresence mode="wait">
            {activeTab === 'ANALISIS' ? (
              <motion.div 
                key="analisis"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                {/* Aggregate Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Management Area Comparison */}
                  <div className="bg-black/40 backdrop-blur-3xl rounded-[3rem] border border-white/10 p-8 lg:p-12 shadow-2xl relative overflow-hidden group">
                     <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none" />
                     <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic mb-8 flex items-center gap-4">
                       <LayoutDashboard size={24} className="text-blue-500" />
                       Comparativo por Gestiones
                     </h3>
                     <div className="h-80 w-full">
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={(() => {
                           const gestionTotals: any = {
                             DIRECTIVA: {}, ACADEMICA: {}, COMUNITARIA: {}, FINANCIERA: {}
                           };
                           reports.forEach(r => {
                             const data = getChartData(r);
                             r.periods.forEach(p => {
                               if (!gestionTotals[r.gestion][p]) gestionTotals[r.gestion][p] = [];
                               data.forEach((d: any) => {
                                 if (d[p]) gestionTotals[r.gestion][p].push(d[p]);
                               });
                             });
                           });
                           return Object.entries(gestionTotals).map(([key, periods]: [string, any]) => {
                             const dp: any = { name: GESTION_CONFIG[key as keyof typeof GESTION_CONFIG].label.split(' ')[1] };
                             Object.entries(periods).forEach(([p, scores]: [string, any]) => {
                               dp[p] = scores.length > 0 ? Number((scores.reduce((a:any, b:any) => a + b, 0) / scores.length).toFixed(2)) : 0;
                             });
                             return dp;
                           });
                         })()}>
                           <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                           <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                           <YAxis domain={[0, 4]} ticks={[1, 2, 3, 4]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                           <ReTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                           <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.1em', marginBottom: '20px' }} />
                           {Array.from(new Set(reports.flatMap(r => r.periods))).sort().map((p, idx) => (
                             <Bar key={p} dataKey={p} fill={idx === 0 ? '#3b82f6' : idx === 1 ? '#10b981' : idx === 2 ? '#f59e0b' : '#ef4444'} radius={[6, 6, 0, 0]} />
                           ))}
                         </BarChart>
                       </ResponsiveContainer>
                     </div>
                  </div>

                  {/* Trend Analysis Card */}
                  <div className="bg-black/40 backdrop-blur-3xl rounded-[3rem] border border-white/10 p-8 lg:p-12 shadow-2xl relative overflow-hidden group">
                     <div className="absolute inset-0 bg-emerald-500/[0.02] pointer-events-none" />
                     <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic mb-8 flex items-center gap-4">
                       <Activity size={24} className="text-emerald-500" />
                       Tendencia de Evolución
                     </h3>
                     <div className="space-y-6">
                        {Object.entries(GESTION_CONFIG).map(([key, config]) => {
                          const gestionReports = reports.filter(r => r.gestion === key);
                          const periods = Array.from(new Set(gestionReports.flatMap(r => r.periods))).sort();
                          
                          let trendText = "SIN DATOS SUFICIENTES";
                          let trendColor = "text-slate-500";
                          let bgTrend = "bg-slate-500/10";
                          let iconTrend = Clock;

                          if (periods.length >= 2) {
                            const p1 = periods[0];
                            const p2 = periods[periods.length - 1];
                            
                            const getAvg = (p: string) => {
                              let sum = 0, count = 0;
                              gestionReports.forEach(r => {
                                r.valoraciones.forEach(v => {
                                  if (typeof v.scores[p] === 'number') {
                                    sum += v.scores[p] as number;
                                    count++;
                                  }
                                });
                              });
                              return count > 0 ? sum / count : 0;
                            };

                            const avg1 = getAvg(p1);
                            const avg2 = getAvg(p2);

                            if (avg2 > avg1) {
                              trendText = "AVANCE POSITIVO";
                              trendColor = "text-emerald-400";
                              bgTrend = "bg-emerald-400/10";
                              iconTrend = ShieldCheck;
                            } else if (avg2 < avg1) {
                              trendText = "RETROCESO DETECTADO";
                              trendColor = "text-rose-400";
                              bgTrend = "bg-rose-400/10";
                              iconTrend = AlertCircle;
                            } else {
                              trendText = "ESTABILIDAD MANTENIDA";
                              trendColor = "text-blue-400";
                              bgTrend = "bg-blue-400/10";
                              iconTrend = CheckCircle2;
                            }
                          }

                          return (
                            <div key={key} className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/5">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{config.label}</span>
                                <div className={`flex items-center gap-2 ${trendColor} font-black text-xs italic tracking-tight`}>
                                  {React.createElement(iconTrend, { size: 14 })}
                                  {trendText}
                                </div>
                              </div>
                              <div className={`px-4 py-2 ${bgTrend} ${trendColor} rounded-xl text-[10px] font-black tracking-widest`}>
                                GUÍA 34
                              </div>
                            </div>
                          );
                        })}
                     </div>
                  </div>
                </div>

                {/* Detailed Diagnostic & Analytics Analysis */}
                <div className="space-y-16">
                  {Object.entries(GESTION_CONFIG).filter(([k]) => k !== 'ANALISIS').map(([key, config]) => {
                    const gestionReports = reports.filter(r => r.gestion === key);
                    const periods = Array.from(new Set(gestionReports.flatMap(r => r.periods))).sort();
                    
                    return (
                      <div key={key} className="space-y-8">
                        <div className="flex items-center gap-4">
                          <div className={`p-4 rounded-2xl bg-gradient-to-br ${config.color} text-white shadow-lg`}>
                            <config.icon size={24} />
                          </div>
                          <div>
                            <h4 className="text-xl font-black text-white uppercase italic tracking-widest leading-none">
                              {config.label}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-2">Diagnóstico Detallado Guía 34</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                           {config.data.map(area => {
                             const areaAverages = periods.map(p => {
                               let sum = 0, count = 0;
                               gestionReports.forEach(r => {
                                 r.valoraciones.forEach(v => {
                                   if (v.area === area.area && typeof v.scores[p] === 'number') {
                                     sum += v.scores[p] as number;
                                     count++;
                                   }
                                 });
                               });
                               return { period: p, avg: count > 0 ? (sum / count).toFixed(1) : '-' };
                             });
                             
                             return (
                               <div key={area.area} className="bg-black/20 backdrop-blur-md p-6 rounded-[2.5rem] border border-white/5 flex flex-col gap-6 group hover:bg-white/[0.04] transition-all hover:border-blue-500/30">
                                 <h5 className="text-[11px] font-black text-blue-400 uppercase tracking-widest leading-tight h-10 line-clamp-2 italic">
                                   {area.area}
                                 </h5>
                                 
                                 <div className="flex justify-between items-center bg-black/40 p-4 rounded-2xl border border-white/5">
                                   {areaAverages.map(a => (
                                      <div key={a.period} className="text-center">
                                        <p className="text-[8px] font-black text-slate-600 uppercase mb-1">{a.period}</p>
                                        <p className="text-lg font-black text-white">{a.avg}</p>
                                      </div>
                                   ))}
                                 </div>

                                 <div className="space-y-3">
                                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Estado por Componentes</p>
                                   <div className="space-y-2">
                                     {area.componentes.slice(0, 4).map((comp, idx) => {
                                       let compSum = 0, compCount = 0;
                                       gestionReports.forEach(r => {
                                         const val = r.valoraciones.find(v => v.componente === comp);
                                         periods.forEach(p => {
                                           if (val && typeof val.scores[p] === 'number') {
                                             compSum += val.scores[p] as number;
                                             compCount++;
                                           }
                                         });
                                       });
                                       const avgScore = compCount > 0 ? compSum / compCount : 0;
                                       
                                       return (
                                         <div key={idx} className="flex items-center gap-3">
                                           <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                             avgScore >= 3.5 ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' :
                                             avgScore >= 2.5 ? 'bg-amber-500 shadow-[0_0_5px_#f59e0b]' :
                                             avgScore > 0 ? 'bg-rose-500 shadow-[0_0_5px_#ef4444]' : 'bg-white/10'
                                           }`} />
                                           <span className="text-[9px] font-bold text-slate-400 truncate uppercase hover:text-white transition-colors cursor-default" title={comp}>
                                             {comp}
                                           </span>
                                         </div>
                                       );
                                     })}
                                     {area.componentes.length > 4 && (
                                       <p className="text-[8px] font-black text-slate-700 italic uppercase">
                                         + {area.componentes.length - 4} componentes adicionales
                                       </p>
                                     )}
                                   </div>
                                 </div>
                               </div>
                             );
                           })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : isFormOpen ? (
              <motion.form 
                key="form"
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                onSubmit={handleSave}
                className="space-y-10 bg-black/30 p-8 lg:p-14 rounded-[3.5rem] border border-white/10 shadow-inner overflow-hidden relative shadow-2xl"
              >
                <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none" />
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 relative z-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2 italic">
                      Equipo Dinamizador - {activeTab === 'DIRECTIVA' ? 'Gestión Directiva' :
                                        activeTab === 'ACADEMICA' ? 'Gestión Académica' :
                                        activeTab === 'COMUNITARIA' ? 'Gestión de la Comunidad' :
                                        'Gestión Administrativa/Financiera'} *
                    </label>
                    <input 
                      type="text"
                      placeholder="EJ: LEO OROZCO, MARIA PEREZ..."
                      value={formData.integrantes}
                      onChange={(e) => setFormData({...formData, integrantes: e.target.value})}
                      required
                      className="executive-input w-full"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2 italic">Fecha de Evaluación *</label>
                    <input 
                      type="date"
                      value={formData.fechaManual}
                      onChange={(e) => setFormData({...formData, fechaManual: e.target.value})}
                      required
                      className="executive-input w-full cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-6 relative z-10 bg-white/5 p-8 rounded-3xl border border-white/10 shadow-inner">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] ml-2 italic">Cronograma de Actividades (Equipo de Gestión)</label>
                    <button 
                      type="button"
                      onClick={() => {
                        if (formData.cronogramaText.trim()) {
                          setFormData({
                            ...formData,
                            cronogramaItems: [...formData.cronogramaItems, { date: formData.cronogramaDate, activity: formData.cronogramaText }],
                            cronogramaText: ''
                          });
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 shadow-glow-blue"
                    >
                      <Plus size={14} />
                      Añadir Actividad
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</label>
                      <input 
                        type="date"
                        value={formData.cronogramaDate}
                        onChange={(e) => setFormData({...formData, cronogramaDate: e.target.value})}
                        className="executive-input w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Actividad</label>
                      <textarea 
                        placeholder="DESCRIBA LA ACTIVIDAD..."
                        value={formData.cronogramaText}
                        onChange={(e) => setFormData({...formData, cronogramaText: e.target.value})}
                        rows={1}
                        className="executive-input w-full resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {formData.cronogramaItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 group/act hover:border-blue-500/30 transition-all">
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase">
                            <Calendar size={14} />
                            {item.date}
                          </div>
                          <p className="text-[11px] text-slate-300 font-bold italic">{item.activity}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const nextItems = [...formData.cronogramaItems];
                            nextItems.splice(idx, 1);
                            setFormData({...formData, cronogramaItems: nextItems});
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all opacity-0 group-hover/act:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {formData.cronogramaItems.length === 0 && !formData.cronogramaText && (
                      <p className="text-center py-6 text-[10px] text-slate-600 uppercase font-black tracking-widest italic border border-dashed border-white/5 rounded-2xl">Sin actividades registradas</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 relative z-10">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2 italic">URL Plan de Mejoramiento Institucional (PMI)</label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <input 
                      type="url"
                      placeholder="PEGAR"
                      value={formData.pmiUrl}
                      onChange={(e) => setFormData({...formData, pmiUrl: e.target.value})}
                      className="executive-input flex-1"
                    />
                    <div className="flex gap-2">
                       {formData.pmiUrl && (
                         <a href={formData.pmiUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2">
                           VER <ExternalLink size={12} />
                         </a>
                       )}
                       <button 
                         type="button" 
                         onClick={() => setFormData({...formData, pmiUrl: ''})}
                         className="px-6 py-4 bg-rose-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-700 transition-all"
                       >
                         BORRAR
                       </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 relative z-10 overflow-x-auto">
                   <div className="flex items-center justify-between mb-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2 italic block">Matriz de Valoración Estratégica (1 - 4)</label>
                     <button 
                       type="button"
                       onClick={addPeriod}
                       className="px-4 py-2 bg-blue-600/10 text-blue-500 rounded-xl text-[9px] font-black uppercase tracking-widest border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                     >
                       <Plus size={14} />
                       Añadir Periodo
                     </button>
                   </div>
                   <table className="w-full text-left border-collapse bg-black/40 rounded-3xl overflow-hidden border border-white/10 min-w-[900px] shadow-2xl">
                     <thead>
                       <tr className="bg-white/5 border-b border-white/10 uppercase tracking-[0.2em] text-[10px] font-black text-blue-400">
                         <th className="p-6 w-64 border-r border-white/5">Proceso / Área</th>
                         <th className="p-6">Componente Estratégico</th>
                         {formData.periods.map(period => (
                            <th key={period} className="p-6 text-center w-40 border-l border-white/5">Valoración {period}</th>
                         ))}
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                       {formData.valoraciones.map((val, idx) => {
                         const firstIndexInArea = formData.valoraciones.findIndex(v => v.area === val.area);
                         return (
                           <tr key={idx} className="group hover:bg-blue-600/5 transition-all duration-300">
                             <td className="p-6 text-[12px] font-black text-white/90 italic border-r border-white/5 align-top leading-tight uppercase tracking-tight">
                               {idx === firstIndexInArea ? val.area : ''}
                             </td>
                             <td className="p-6 text-[13px] font-bold text-slate-300 leading-relaxed group-hover:text-white transition-colors">
                               {val.componente}
                             </td>
                             {formData.periods.map(period => (
                               <td key={period} className="p-4 text-center border-l border-white/5">
                                 <select 
                                   value={val.scores[period]}
                                   onChange={(e) => {
                                     const nextVals = [...formData.valoraciones];
                                     const v = parseInt(e.target.value);
                                     nextVals[idx].scores[period] = isNaN(v) ? '' : v;
                                     setFormData({...formData, valoraciones: nextVals});
                                   }}
                                   className="w-20 bg-black/40 border border-white/10 rounded-lg py-2 text-center font-black text-xs text-[#D4AF37] focus:border-blue-500/50 outline-none transition-all shadow-inner appearance-none cursor-pointer hover:bg-black/60"
                                 >
                                   <option value="" className="bg-[#1A1A1A]">-</option>
                                   {[1, 2, 3, 4].map(n => (
                                     <option key={n} value={n} className="bg-[#1A1A1A]">{n}</option>
                                   ))}
                                 </select>
                               </td>
                             ))}
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                </div>

                <div className="space-y-4 relative z-10">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2 italic">Análisis y Resultados Detallados *</label>
                  <textarea 
                    rows={8}
                    placeholder="DESCRIBA LAS ACCIONES REALIZADAS, LOGROS ALCANZADOS, INDICADORES O ASPECTOS A VALORAR EN ESTA GESTIÓN..."
                    value={formData.descripcion}
                    onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                    required
                    className="executive-input w-full resize-none leading-relaxed"
                  />
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-5 pt-8 border-t border-white/5 relative z-10">
                  <button 
                    type="button"
                    onClick={() => { setIsFormOpen(false); setEditingId(null); }}
                    className="px-12 py-5 rounded-2xl font-black text-[11px] tracking-[0.2em] uppercase text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
                  >
                    DESCARTAR CAMBIOS
                  </button>
                  <button 
                    type="submit"
                    className="px-14 py-5 bg-blue-600 text-white rounded-2xl font-black text-[11px] tracking-[0.2em] uppercase hover:bg-blue-700 transition-all shadow-2xl shadow-blue-600/20 flex items-center justify-center gap-4 group active:scale-95"
                  >
                    <Save size={20} className="group-hover:scale-110 transition-transform duration-500" />
                    <span>{editingId ? 'GUARDAR ACTUALIZACIÓN' : 'REGISTRAR EVALUACIÓN'}</span>
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.div 
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {filteredReports.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-y-3">
                      <thead>
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
                          <th className="px-6 py-2">Año</th>
                          <th className="px-6 py-2">Fecha</th>
                          <th className="px-6 py-2">Equipo</th>
                          <th className="px-6 py-2">PMI</th>
                          <th className="px-6 py-2 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReports.map((report) => (
                          <tr key={report.id} className="group bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-white/5 transition-all duration-300">
                            <td className="px-6 py-4 rounded-l-3xl border-l border-y border-white/10">
                              <span className="px-3 py-1 bg-blue-600/20 text-[#D4AF37] rounded-lg font-black text-[11px] border border-[#D4AF37]/20">
                                {report.año}
                              </span>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10 whitespace-nowrap">
                              <div className="flex items-center gap-2 text-slate-300 font-bold text-xs italic">
                                <Calendar size={12} className="text-blue-400" />
                                {report.fechaManual}
                              </div>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10 max-w-[200px]">
                              <p className="text-[11px] text-slate-400 font-black uppercase truncate italic">{report.integrantes}</p>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10">
                              {report.pmiUrl ? (
                                <a href={report.pmiUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors">
                                  <ExternalLink size={10} />
                                  PMI ASOCIADO
                                </a>
                              ) : (
                                <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest italic">SIN PMI</span>
                              )}
                            </td>
                            <td className="px-6 py-4 rounded-r-3xl border-r border-y border-white/10 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => exportToPDF(report)}
                                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-blue-400 hover:bg-blue-600 hover:text-white transition-all border border-blue-600/20 shadow-glow-blue"
                                  title="Exportar PDF"
                                >
                                  <Download size={14} />
                                </button>
                                <button 
                                  onClick={() => {
                                    const config = GESTION_CONFIG[activeTab as keyof typeof GESTION_CONFIG];
                                    const defaultVals: ValoracionItem[] = [];
                                    const reportPeriods = report.periods || ['2024-2025', '2025-2026'];
                                    
                                    config.data.forEach(area => {
                                      area.componentes.forEach(comp => {
                                        const scores: { [k: string]: number | '' } = {};
                                        reportPeriods.forEach(p => scores[p] = '');
                                        defaultVals.push({ area: area.area, componente: comp, scores });
                                      });
                                    });

                                    setFormData({ 
                                      titulo: report.titulo, 
                                      descripcion: report.descripcion, 
                                      integrantes: report.integrantes || '',
                                      pmiUrl: report.pmiUrl || '',
                                      cronogramaItems: report.cronogramaItems || (report.cronograma ? [{ date: report.cronograma.split('|')[0], activity: report.cronograma.split('|')[1] }] : []),
                                      cronogramaDate: new Date().toISOString().split('T')[0],
                                      cronogramaText: '',
                                      fechaManual: report.fechaManual || new Date().toISOString().split('T')[0],
                                      año: report.año,
                                      valoraciones: report.valoraciones || defaultVals,
                                      periods: reportPeriods
                                    });
                                    setEditingId(report.id);
                                    setIsFormOpen(true);
                                    window.scrollTo({ top: 300, behavior: 'smooth' });
                                  }}
                                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all border border-emerald-600/20 shadow-glow-emerald"
                                  title="Editar"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={() => setConfirmDeleteId(report.id)}
                                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-rose-500 hover:bg-rose-600 hover:text-white transition-all border border-rose-600/20 shadow-glow-rose"
                                  title="Borrar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-32 text-center bg-black/20 rounded-[4rem] border-2 border-dashed border-white/5">
                    <FileText size={48} className="mx-auto text-slate-800 mb-6" />
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic mb-4">Sin hallazgos documentados</h3>
                    <p className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em] italic">DOCUMENTACIÓN ESTRATÉGICA REQUERIDA</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ConfirmModal 
        isOpen={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
        title="Confirmar Eliminación"
        message="¿ESTÁ SEGURO DE ELIMINAR ESTE REGISTRO DE EVALUACIÓN ESTRATÉGICA? ESTA ACCIÓN ES IRREVERSIBLE."
      />

      <MessageModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalType}
        message={modalMessage}
      />
    </div>
  );
}
