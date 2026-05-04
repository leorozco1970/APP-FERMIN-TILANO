import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, setDoc, doc, addDoc, query, orderBy, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Search,
  BookOpen,
  Calendar,
  Users,
  ExternalLink,
  Download,
  Layout,
  ClipboardList,
  FileDown,
  Clock,
  Briefcase,
  Pencil
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';
import { InstitutionalLoading } from '../components/InstitutionalLoading';
import { motion, AnimatePresence } from 'motion/react';
import { DOCENTES, GRADOS, AREAS, PERIODOS } from '../lib/constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  drawExecutiveHeader, 
  drawExecutiveFooter, 
  drawWatermark, 
  drawSignatureLines,
  PDF_COLORS, 
  PDF_MARGIN, 
  getPerfectTableStyles,
  INTRO_TEXTS
} from '../lib/pdfUtils';
import { isValidUrl } from '../lib/urlUtils';
import { RefreshCw } from 'lucide-react';

interface PlanArea {
  id: string;
  fechaEntrega: string;
  area: string;
  responsables: string;
  version: string;
  documentUrl: string;
  createdAt: any;
  authorEmail: string;
  authorUid?: string;
}

interface PlanAula {
  id: string;
  fecha: string;
  periodo: string;
  docente: string;
  area: string;
  grado: string;
  fechaInicio: string;
  fechaFin: string;
  aprendizaje: string;
  competencia: string;
  evidencia: string;
  documentUrl: string;
  createdAt: any;
  authorEmail: string;
  authorUid: string;
}

export function PlanesAreaAula() {
  const [activeTab, setActiveTab] = useState<'AREA' | 'AULA'>('AREA');
  const [plans, setPlans] = useState<PlanArea[]>([]);
  const [aulaPlans, setAulaPlans] = useState<PlanAula[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    fechaEntrega: new Date().toISOString().split('T')[0],
    area: '',
    responsables: '',
    version: '2025',
    documentUrl: ''
  });

  const [aulaFormData, setAulaFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    periodo: 'I',
    docente: '',
    area: '',
    grado: '',
    fechaInicio: '',
    fechaFin: '',
    aprendizaje: '',
    competencia: '',
    evidencia: '',
    documentUrl: ''
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const [modalMessage, setModalMessage] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<'AREA' | 'AULA'>('AREA');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Persistence logic
  useEffect(() => {
    const savedArea = localStorage.getItem('planes_area_draft');
    const savedAula = localStorage.getItem('planes_aula_draft');
    if (savedArea) setFormData(JSON.parse(savedArea));
    if (savedAula) setAulaFormData(JSON.parse(savedAula));
  }, []);

  useEffect(() => {
    localStorage.setItem('planes_area_draft', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    localStorage.setItem('planes_aula_draft', JSON.stringify(aulaFormData));
  }, [aulaFormData]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const qArea = query(collection(db, 'planes_area'), orderBy('createdAt', 'desc'));
      const qAula = query(collection(db, 'planes_aula'), orderBy('createdAt', 'desc'));
      
      const [snapArea, snapAula] = await Promise.all([
        getDocs(qArea),
        getDocs(qAula)
      ]);

      const areaData = snapArea.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanArea));
      const aulaData = snapAula.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanAula));
      
      setPlans(areaData);
      setAulaPlans(aulaData);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'planes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.area || !formData.responsables || !formData.documentUrl) {
      setModalType('error');
      setModalMessage('POR FAVOR COMPLETE TODOS LOS CAMPOS OBLIGATORIOS.');
      setModalOpen(true);
      return;
    }

    if (!isValidUrl(formData.documentUrl)) {
      setModalType('error');
      setModalMessage('EL ENLACE DEL DOCUMENTO NO ES VÁLIDO. POR FAVOR PEGUE UNA URL REAL (HTTP/HTTPS).');
      setModalOpen(true);
      return;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'planes_area', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        setModalMessage('PLAN DE ÁREA ACTUALIZADO CON ÉXITO.');
      } else {
        await addDoc(collection(db, 'planes_area'), {
          ...formData,
          authorUid: auth.currentUser?.uid || 'ANONYMOUS',
          authorEmail: auth.currentUser?.email || 'ANONYMOUS',
          createdAt: serverTimestamp()
        });
        setModalMessage('PLAN DE ÁREA REGISTRADO CON ÉXITO.');
      }
      await fetchData();

      setModalType('success');
      setModalOpen(true);
      setIsFormOpen(false);
      setEditingId(null);
      setFormData({
        fechaEntrega: new Date().toISOString().split('T')[0],
        area: '',
        responsables: '',
        version: '2025',
        documentUrl: ''
      });
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'planes_area');
    }
  };

  const handleEditArea = (plan: PlanArea) => {
    setFormData({
      fechaEntrega: plan.fechaEntrega,
      area: plan.area,
      responsables: plan.responsables,
      version: plan.version,
      documentUrl: plan.documentUrl
    });
    setEditingId(plan.id);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAula = async (e: React.FormEvent) => {
    e.preventDefault();
    const required = [
      aulaFormData.docente, 
      aulaFormData.area, 
      aulaFormData.grado, 
      aulaFormData.fechaInicio, 
      aulaFormData.fechaFin,
      aulaFormData.documentUrl
    ];

    if (required.some(f => !f)) {
      setModalType('error');
      setModalMessage('CAMPOS OBLIGATORIOS PENDIENTES EN IDENTIFICACIÓN Y SOPORTE.');
      setModalOpen(true);
      return;
    }

    if (!isValidUrl(aulaFormData.documentUrl)) {
      setModalType('error');
      setModalMessage('EL ENLACE DEL PLAN DE AULA NO ES VÁLIDO. PEGUE UNA URL DE GOOGLE DRIVE O SIMILAR.');
      setModalOpen(true);
      return;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'planes_aula', editingId), {
          ...aulaFormData,
          updatedAt: serverTimestamp()
        });
        setModalMessage('PLAN DE AULA ACTUALIZADO CORRECTAMENTE.');
      } else {
        await addDoc(collection(db, 'planes_aula'), {
          ...aulaFormData,
          authorUid: auth.currentUser?.uid || 'ANONYMOUS',
          authorEmail: auth.currentUser?.email || 'ANONYMOUS',
          createdAt: serverTimestamp()
        });
        setModalMessage('PLAN DE AULA REGISTRADO CORRECTAMENTE.');
      }
      await fetchData();

      setModalType('success');
      setModalOpen(true);
      setIsFormOpen(false);
      setEditingId(null);
      setAulaFormData({
        fecha: new Date().toISOString().split('T')[0],
        periodo: 'I',
        docente: '',
        area: '',
        grado: '',
        fechaInicio: '',
        fechaFin: '',
        aprendizaje: '',
        competencia: '',
        evidencia: '',
        documentUrl: ''
      });
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'planes_aula');
    }
  };

  const handleEditAula = (plan: PlanAula) => {
    setAulaFormData({
      fecha: plan.fecha,
      periodo: plan.periodo,
      docente: plan.docente,
      area: plan.area,
      grado: plan.grado,
      fechaInicio: plan.fechaInicio,
      fechaFin: plan.fechaFin,
      aprendizaje: plan.aprendizaje,
      competencia: plan.competencia,
      evidencia: plan.evidencia,
      documentUrl: plan.documentUrl
    });
    setEditingId(plan.id);
    setIsFormOpen(true);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    const coll = confirmDeleteType === 'AREA' ? 'planes_area' : 'planes_aula';
    try {
      await deleteDoc(doc(db, coll, id));
      await fetchData();
      setModalType('success');
      setModalMessage('REGISTRO ELIMINADO.');
      setModalOpen(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${coll}/${id}`);
    }
  };

  const exportToPDF = async (plan: PlanAula) => {
    try {
      const doc = new jsPDF();
      const reportTitle = "PLAN DE AULA INSTITUCIONAL";
      const metaInfo = `DOCENTE: ${plan.docente.toUpperCase()} | GRADO: ${plan.grado} | ASIGNATURA: ${plan.area.toUpperCase()}`;
      const introText = INTRO_TEXTS.PLAN_AULA;

      const startY = drawExecutiveHeader(doc, reportTitle, introText, metaInfo);

      const tableStyles = getPerfectTableStyles();

      // 1. Identification
      autoTable(doc, {
        ...tableStyles,
        startY: startY,
        head: [['IDENTIFICACIÓN INSTITUCIONAL', 'DETALLES']],
        body: [
          ['FECHA DE REGISTRO', plan.fecha],
          ['PERIODO ACADÉMICO', `PERIODO ${plan.periodo}`],
          ['VIGENCIA CRONOGRAMA', `${plan.fechaInicio} AL ${plan.fechaFin}`],
          ['DOCENTE RESPONSABLE', plan.docente.toUpperCase()],
          ['ÁREA / ASIGNATURA', plan.area.toUpperCase()],
          ['GRADO / NIVEL', plan.grado]
        ],
        theme: 'grid',
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 60 },
          1: { halign: 'left' }
        }
      });

      // 2. Quality
      autoTable(doc, {
        ...tableStyles,
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['REFERENTES DE CALIDAD', 'DESCRIPCIÓN TÉCNICA PEDAGÓGICA']],
        body: [
          ['APRENDIZAJE (HABILIDADES)', plan.aprendizaje || 'SIN ESPECIFICAR'],
          ['COMPETENCIA', plan.competencia || 'SIN ESPECIFICAR'],
          ['EVIDENCIA DE APRENDIZAJE', plan.evidencia || 'SIN ESPECIFICAR']
        ],
        theme: 'grid',
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 60 },
          1: { halign: 'justify' }
        }
      });

      // 3. Support
      autoTable(doc, {
        ...tableStyles,
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['SOPORTE DOCUMENTAL Y TRAZABILIDAD', 'INFORMACIÓN']],
        body: [
          ['URL PLAN MAESTRO (DRIVE)', plan.documentUrl],
          ['REGISTRADO POR', plan.authorEmail],
          ['FECHA SISTEMATIZACIÓN', plan.createdAt?.toDate ? plan.createdAt.toDate().toLocaleString() : 'PENDIENTE']
        ],
        theme: 'grid',
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 60 },
          1: { halign: 'left', textColor: [0, 51, 153] }
        }
      });

      // 4. Verification Signatures (Standard for professional documents)
      const finalY = (doc as any).lastAutoTable.finalY + 30;
      drawSignatureLines(doc, [plan.docente, "Coordinación Académica"], finalY);

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, totalPages);
        if (i > 1) drawWatermark(doc);
      }

      doc.save(`PLAN_AULA_${plan.docente.replace(/ /g, '_')}_${plan.grado}.pdf`);
    } catch (error) {
      console.error(error);
    }
  };

  const filteredPlans = plans.filter(p => 
    p.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.responsables.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAulaPlans = aulaPlans.filter(p => 
    p.docente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.grado.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <InstitutionalLoading message="Cargando Auditoría de Planeación..." />;
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-700 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader 
        title="Planes de Área y Aula" 
        description="Gestión integral de la planeación curricular institucional. Organice y haga seguimiento a los planes de área y aula de todos los docentes."
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

      {/* Sub-tabs */}
      <div className="flex gap-4">
        <button
          onClick={() => setActiveTab('AREA')}
          className={`flex-1 py-6 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 border-2 ${
            activeTab === 'AREA' 
              ? 'bg-blue-600 text-white border-blue-500 shadow-glow-blue' 
              : 'bg-black/20 text-slate-500 border-white/5 hover:bg-white/5'
          }`}
        >
          <Layout size={18} />
          Planes de Área
        </button>
        <button
          onClick={() => setActiveTab('AULA')}
          className={`flex-1 py-6 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 border-2 ${
            activeTab === 'AULA' 
              ? 'bg-purple-600 text-white border-purple-500 shadow-glow-purple' 
              : 'bg-black/20 text-slate-500 border-white/5 hover:bg-white/5'
          }`}
        >
          <ClipboardList size={18} />
          Plan de Aula
        </button>
      </div>

      <div className="bg-black/40 backdrop-blur-3xl rounded-[3rem] shadow-2xl border border-white/10 overflow-hidden relative">
        <div className="p-8 lg:p-12 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          <div>
            <h2 className="text-3xl lg:text-4xl font-black text-white uppercase italic leading-none mb-4">
              {activeTab === 'AREA' ? 'Registro de Planes de Área' : 'Gestión de Planes de Aula'}
            </h2>
            <div className="flex items-center gap-4">
              <span className="w-12 h-1 bg-blue-600 rounded-full"></span>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Documentación Pedagógica Actualizada</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="text"
                placeholder={activeTab === 'AREA' ? "BUSCAR ÁREA..." : "BUSCAR DOCENTE/GRADO..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-14 pr-8 py-4 bg-black/40 border border-white/10 rounded-2xl focus:border-blue-500/50 w-full sm:w-64 transition-all font-black text-[10px] text-white"
              />
            </div>
            <button 
              onClick={() => setIsFormOpen(!isFormOpen)}
              className={`px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${
                isFormOpen ? 'bg-rose-600/10 text-rose-500 border border-rose-500/20' : activeTab === 'AREA' ? 'bg-blue-600 text-white shadow-glow-blue' : 'bg-purple-600 text-white shadow-glow-purple'
              }`}
            >
              <Plus size={18} className={isFormOpen ? 'rotate-45 transition-transform' : ''} />
              {isFormOpen ? 'CERRAR PANEL' : 'NUEVO REGISTRO'}
            </button>
          </div>
        </div>

        <div className="p-8 lg:p-12">
          {activeTab === 'AULA' ? (
            <>
              <AnimatePresence>
                {isFormOpen && (
                  <motion.form 
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                    onSubmit={handleSaveAula}
                    className="mb-12 bg-white/5 p-8 lg:p-12 rounded-[2.5rem] border border-purple-500/20 space-y-10 shadow-glow-purple/5"
                  >
                    {/* Section 1: Identificación */}
                    <div className="space-y-6">
                       <h4 className="text-[11px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-3">
                         <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-glow-purple"></div>
                         {editingId ? 'Editando Plan de Aula' : 'Identificación Institucional'}
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fecha de Planificación</label>
                             <input type="date" value={aulaFormData.fecha} onChange={(e) => setAulaFormData({...aulaFormData, fecha: e.target.value})} className="executive-input w-full text-white text-[13px]" />
                          </div>
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Periodo Escolar</label>
                             <select value={aulaFormData.periodo} onChange={(e) => setAulaFormData({...aulaFormData, periodo: e.target.value})} className="executive-input w-full text-white text-[13px]">
                               {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">Periodo {p}</option>)}
                             </select>
                          </div>
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Docente Responsable</label>
                             <select value={aulaFormData.docente} onChange={(e) => setAulaFormData({...aulaFormData, docente: e.target.value})} className="executive-input w-full text-white text-[13px]" required>
                               <option value="" className="bg-[#1A1A1A]">SELECCIONE DOCENTE</option>
                               {DOCENTES.map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d}</option>)}
                             </select>
                          </div>
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Área / Asignatura</label>
                             <select value={aulaFormData.area} onChange={(e) => setAulaFormData({...aulaFormData, area: e.target.value})} className="executive-input w-full text-white text-[13px]" required>
                               <option value="" className="bg-[#1A1A1A]">SELECCIONE ÁREA</option>
                               {AREAS.map(a => <option key={a} value={a} className="bg-[#1A1A1A]">{a}</option>)}
                             </select>
                          </div>
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Grado</label>
                             <select value={aulaFormData.grado} onChange={(e) => setAulaFormData({...aulaFormData, grado: e.target.value})} className="executive-input w-full text-white text-[13px]" required>
                               <option value="" className="bg-[#1A1A1A]">SELECCIONE GRADO</option>
                               {GRADOS.map(g => <option key={g} value={g} className="bg-[#1A1A1A]">{g}</option>)}
                             </select>
                          </div>
                          <div className="space-y-4 md:col-span-2 lg:col-span-1">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Cronograma de Vigencia</label>
                             <div className="flex flex-col gap-3">
                               <div className="relative">
                                 <span className="absolute -top-2 left-4 px-2 bg-[#1A1A1A] text-[7px] font-black text-purple-400 uppercase tracking-widest z-10">Desde</span>
                                 <input type="date" value={aulaFormData.fechaInicio} onChange={(e) => setAulaFormData({...aulaFormData, fechaInicio: e.target.value})} className="executive-input w-full text-white text-[13px]" />
                               </div>
                               <div className="relative">
                                 <span className="absolute -top-2 left-4 px-2 bg-[#1A1A1A] text-[7px] font-black text-purple-400 uppercase tracking-widest z-10">Hasta</span>
                                 <input type="date" value={aulaFormData.fechaFin} onChange={(e) => setAulaFormData({...aulaFormData, fechaFin: e.target.value})} className="executive-input w-full text-white text-[13px]" />
                               </div>
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* Section 2: Calidad */}
                    <div className="space-y-6">
                       <h4 className="text-[11px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-3">
                         <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-glow-purple"></div>
                         Referentes de Calidad
                       </h4>
                       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Aprendizaje (Habilidades)</label>
                             <textarea value={aulaFormData.aprendizaje} onChange={(e) => setAulaFormData({...aulaFormData, aprendizaje: e.target.value})} className="executive-input w-full h-32 resize-none text-white text-[13px] leading-relaxed" placeholder="DESCRIBA QUÉ HABILIDAD DESARROLLARÁ EL ESTUDIANTE..." />
                          </div>
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Competencia</label>
                             <textarea value={aulaFormData.competencia} onChange={(e) => setAulaFormData({...aulaFormData, competencia: e.target.value})} className="executive-input w-full h-32 resize-none text-white text-[13px] leading-relaxed" placeholder="DESCRIBA LA COMPETENCIA A DESARROLLAR..." />
                          </div>
                          <div className="space-y-3">
                             <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Evidencia de Aprendizaje</label>
                             <textarea value={aulaFormData.evidencia} onChange={(e) => setAulaFormData({...aulaFormData, evidencia: e.target.value})} className="executive-input w-full h-32 resize-none text-white text-[13px] leading-relaxed" placeholder="INDICADORES DE DESEMPEÑO..." />
                          </div>
                       </div>
                    </div>

                    {/* Section 3: Soporte */}
                    <div className="space-y-6">
                       <h4 className="text-[11px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-3">
                         <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-glow-purple"></div>
                         Soporte Documental
                       </h4>
                       <div className="flex flex-col sm:flex-row gap-4">
                          <input 
                            type="url" 
                            placeholder="PEGUE AQUÍ LA URL DEL DOCUMENTO MAESTRO (GOOGLE DRIVE)..." 
                            value={aulaFormData.documentUrl} 
                            onChange={(e) => setAulaFormData({...aulaFormData, documentUrl: e.target.value})} 
                            className="executive-input flex-1 text-white text-[11px]"
                            required
                          />
                          {aulaFormData.documentUrl && (
                             <div className="flex gap-2">
                               <a href={aulaFormData.documentUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-4 bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-2">VER <ExternalLink size={12} /></a>
                               <button type="button" onClick={() => setAulaFormData({...aulaFormData, documentUrl: ''})} className="px-6 py-4 bg-rose-600/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">BORRAR</button>
                             </div>
                          )}
                       </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-6">
                      {editingId && (
                        <button 
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setIsFormOpen(false);
                            setAulaFormData({
                              fecha: new Date().toISOString().split('T')[0],
                              periodo: 'I',
                              docente: '',
                              area: '',
                              grado: '',
                              fechaInicio: '',
                              fechaFin: '',
                              aprendizaje: '',
                              competencia: '',
                              evidencia: '',
                              documentUrl: ''
                            });
                          }}
                          className="px-10 py-5 bg-white/5 text-slate-400 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                          CANCELAR
                        </button>
                      )}
                      <button 
                        type="submit"
                        className="px-14 py-5 bg-purple-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-purple-700 shadow-glow-purple transition-all"
                      >
                        {editingId ? 'ACTUALIZAR PLANEACIÓN' : 'GUARDAR PLANEACIÓN'}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="space-y-6">
                <div className="flex items-center gap-4 mb-4">
                  <ClipboardList size={20} className="text-purple-500" />
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Bitácora Docente de Planeación</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
                        <th className="px-6 py-2">Docente / Grado</th>
                        <th className="px-6 py-2">Área / Periodo</th>
                        <th className="px-6 py-2">Vigencia</th>
                        <th className="px-6 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAulaPlans.map((plan) => {
                        const isOwner = auth.currentUser?.uid === plan.authorUid;
                        return (
                          <tr key={plan.id} className="group bg-black/40 border border-white/10 hover:bg-white/5 transition-all duration-300">
                            <td className="px-6 py-4 rounded-l-3xl border-l border-y border-white/10">
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-black text-white uppercase italic">{plan.docente}</span>
                                <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Grado: {plan.grado}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-300 uppercase italic">{plan.area}</span>
                                <span className="text-[9px] font-black text-slate-500 uppercase">Periodo {plan.periodo}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10">
                              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase">
                                <Clock size={12} className="text-purple-500" />
                                {plan.fechaInicio} al {plan.fechaFin}
                              </div>
                            </td>
                            <td className="px-6 py-4 rounded-r-3xl border-r border-y border-white/10 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button 
                                  onClick={() => exportToPDF(plan)}
                                  className="p-3 bg-white/5 text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl transition-all border border-purple-600/20 shadow-glow-purple"
                                  title="Exportar PDF"
                                >
                                  <FileDown size={14} />
                                </button>
                                <button 
                                  onClick={() => handleEditAula(plan)}
                                  className="p-3 bg-white/5 text-amber-400 hover:bg-amber-600 hover:text-white rounded-xl transition-all border border-amber-600/20 shadow-glow-amber"
                                  title="Editar"
                                >
                                  <Pencil size={14} />
                                </button>
                                <a 
                                  href={plan.documentUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="p-3 bg-white/5 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl transition-all border border-emerald-600/20 shadow-glow-emerald"
                                  title="Descargar"
                                >
                                  <Download size={14} />
                                </a>
                                {isOwner && (
                                  <button 
                                    onClick={() => { setConfirmDeleteId(plan.id); setConfirmDeleteType('AULA'); }}
                                    className="p-3 bg-white/5 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-all border border-rose-600/20 shadow-glow-rose"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredAulaPlans.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-20 text-center bg-white/5 rounded-3xl">
                            <Briefcase size={32} className="mx-auto text-slate-700 mb-4" />
                            <p className="text-[10px] font-black text-slate-600 uppercase italic">Ningún plan de aula registrado todavía.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              <AnimatePresence>
                {isFormOpen && (
                  <motion.form 
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                    onSubmit={handleSave}
                    className="mb-12 bg-white/5 p-8 lg:p-12 rounded-[2.5rem] border border-blue-500/20 space-y-8 shadow-glow-blue/5"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <h4 className="text-[11px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-3 lg:col-span-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-glow-blue"></div>
                        {editingId ? 'Editando Plan de Área' : 'Registro de Plan de Área'}
                      </h4>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 border-b border-blue-600/30 pb-1">Fecha de Entrega *</label>
                        <input 
                          type="date"
                          value={formData.fechaEntrega}
                          onChange={(e) => setFormData({...formData, fechaEntrega: e.target.value})}
                          required
                          className="executive-input w-full text-white"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 border-b border-blue-600/30 pb-1">Área / Asignatura *</label>
                        <input 
                          type="text"
                          placeholder="EJ: MATEMÁTICAS, CIENCIAS NATURALES..."
                          value={formData.area}
                          onChange={(e) => setFormData({...formData, area: e.target.value})}
                          required
                          className="executive-input w-full uppercase text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 border-b border-blue-600/30 pb-1">Responsables *</label>
                        <input 
                          type="text"
                          placeholder="NOMBRES DE LOS DOCENTES..."
                          value={formData.responsables}
                          onChange={(e) => setFormData({...formData, responsables: e.target.value})}
                          required
                          className="executive-input w-full uppercase text-white"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 border-b border-blue-600/30 pb-1">Versión (Año Escolar) *</label>
                        <select 
                          value={formData.version}
                          onChange={(e) => setFormData({...formData, version: e.target.value})}
                          className="executive-input w-full text-white"
                        >
                          {['2025', '2026', '2027', '2028', '2029', '2030'].map(year => (
                            <option key={year} value={year} className="bg-[#1A1A1A]">{year} - Plan de Área</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 border-b border-blue-600/30 pb-1 block">URL del Documento *</label>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <input 
                          type="url"
                          placeholder="PEGUE AQUÍ LA URL DE GOOGLE DRIVE, ONEDRIVE O SIMILAR..."
                          value={formData.documentUrl}
                          onChange={(e) => setFormData({...formData, documentUrl: e.target.value})}
                          required
                          className="executive-input flex-1 text-white"
                        />
                        {formData.documentUrl && (
                          <div className="flex gap-2">
                             <a 
                               href={formData.documentUrl} 
                               target="_blank" 
                               rel="noopener noreferrer" 
                               className="px-6 py-4 bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-2"
                             >
                               VER <ExternalLink size={12} />
                             </a>
                             <button 
                               type="button"
                               onClick={() => setFormData({...formData, documentUrl: ''})}
                               className="px-6 py-4 bg-rose-600/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all"
                             >
                               BORRAR
                             </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-6">
                      {editingId && (
                        <button 
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setIsFormOpen(false);
                            setFormData({
                              fechaEntrega: new Date().toISOString().split('T')[0],
                              area: '',
                              responsables: '',
                              version: '2025',
                              documentUrl: ''
                            });
                          }}
                          className="px-10 py-5 bg-white/5 text-slate-400 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                          CANCELAR
                        </button>
                      )}
                      <button 
                        type="submit"
                        className="px-14 py-5 bg-blue-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 shadow-glow-blue transition-all"
                      >
                        {editingId ? 'ACTUALIZAR PLAN DE ÁREA' : 'REGISTRAR PLAN DE ÁREA'}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="space-y-6">
                <div className="flex items-center gap-4 mb-4">
                  <BookOpen size={20} className="text-blue-500" />
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Bitácora de Entregas</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
                        <th className="px-6 py-2">Versión</th>
                        <th className="px-6 py-2">Área</th>
                        <th className="px-6 py-2">Responsables</th>
                        <th className="px-6 py-2">Fecha Entrega</th>
                        <th className="px-6 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlans.map((plan) => {
                        const isOwner = auth.currentUser?.uid === plan.authorUid;
                        return (
                          <tr key={plan.id} className="group bg-black/40 border border-white/10 hover:bg-white/5 transition-all duration-300">
                            <td className="px-6 py-4 rounded-l-3xl border-l border-y border-white/10">
                              <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg font-black text-xs">
                                {plan.version}
                              </span>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10">
                              <span className="text-[11px] font-black text-white uppercase italic">{plan.area}</span>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10">
                              <span className="text-[10px] font-bold text-slate-400 uppercase italic truncate max-w-[200px] block">{plan.responsables}</span>
                            </td>
                            <td className="px-6 py-4 border-y border-white/10">
                              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase">
                                <Calendar size={12} className="text-blue-500" />
                                {plan.fechaEntrega}
                              </div>
                            </td>
                            <td className="px-6 py-4 rounded-r-3xl border-r border-y border-white/10 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button 
                                  onClick={() => handleEditArea(plan)}
                                  className="p-3 bg-white/5 text-amber-400 hover:bg-amber-600 hover:text-white rounded-xl transition-all border border-amber-600/20 shadow-glow-amber"
                                  title="Editar"
                                >
                                  <Pencil size={14} />
                                </button>
                                <a 
                                  href={plan.documentUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="p-3 bg-white/5 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl transition-all border border-emerald-600/20 shadow-glow-emerald"
                                  title="Descargar"
                                >
                                  <Download size={14} />
                                </a>
                                {isOwner && (
                                  <button 
                                    onClick={() => { setConfirmDeleteId(plan.id); setConfirmDeleteType('AREA'); }}
                                    className="p-3 bg-white/5 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-all border border-rose-600/20 shadow-glow-rose"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredPlans.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-20 text-center bg-white/5 rounded-3xl">
                            <FileText size={32} className="mx-auto text-slate-700 mb-4" />
                            <p className="text-[10px] font-black text-slate-600 uppercase italic">Ningún plan registrado todavía.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal 
        isOpen={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
        title="Confirmar Eliminación"
        message={`¿ESTÁ SEGURO DE ELIMINAR ESTE PLAN DE ${confirmDeleteType === 'AREA' ? 'ÁREA' : 'AULA'}? ESTA ACCIÓN ES IRREVERSIBLE.`}
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
