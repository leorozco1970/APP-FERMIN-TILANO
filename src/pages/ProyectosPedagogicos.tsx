import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ProyectoPedagogico, ActividadCronograma, EstudianteParticipante } from '../lib/types';
import { GRADOS, DOCENTES } from '../lib/constants';
import { useCustomLists } from '../hooks/useCustomLists';
import { Save, Plus, Trash2, Download, BookOpen, Edit, Users, Calendar, Clock, Link2, Eye, FileText, ChevronDown, ChevronUp, FileOutput, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGO_BASE64 } from '../lib/logo';
import { PasswordModal } from '../components/PasswordModal';
import { drawExecutiveHeader, drawExecutiveFooter, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS } from '../lib/pdfUtils';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useNotification } from '../context/NotificationContext';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';

const INITIAL_ESTRATEGIAS = [
  'Centros de interés',
  'Semilleros',
  'Clubes',
  'Proyecto pedagógico',
  'Taller'
];

const PERIODICIDADES = ['Anual', 'Semestral', 'Periodo'];
const INTENSIDADES = ['1 Hora', '2 Horas', '3 Horas', '4 Horas', '5 Horas', '6 Horas'];
const MODALIDADES = [
  'Propio (Iniciativa de la I.E.)',
  'Sectorial (Oferta directa del MEN)',
  'Intersectorial (Alianzas: MinCultura, MinCiencias, Cajas de Compensación)',
  'Local / Territorial (Sabedores locales, alcaldías, universidades)'
];

export function ProyectosPedagogicos() {
  const { notify } = useNotification();
  const { docentes: customDocentes, areas: customAreas } = useCustomLists();
  
  const [estrategias, setEstrategias] = useState<string[]>(INITIAL_ESTRATEGIAS);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const [formData, setFormData] = useState<Partial<ProyectoPedagogico>>({
    fechaRegistro: new Date().toISOString().split('T')[0],
    docente: '',
    area: '',
    tipoEstrategia: '',
    nombreEstrategia: '',
    modalidad: '',
    esPeriodico: 'No',
    periodicidad: '',
    intensidadHoraria: '',
    estudiantesParticipantes: [],
    numeroEstudiantes: 0,
    grados: [],
    objetivo: '',
    tieneDocumentoSoporte: 'No',
    documentoSoporte: '',
    cronograma: [{ no: 1, fecha: '', actividad: '' }]
  });

  const [proyectos, setProyectos] = useState<ProyectoPedagogico[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [passwordModalConfig, setPasswordModalConfig] = useState<{
    type: 'admin' | 'docente';
    teacherName?: string;
  }>({ type: 'admin' });

  const [savedStrategies, setSavedStrategies] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const isDirectivo = localStorage.getItem('userRole') === 'directivo';

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('proyectos_form_data');
    if (saved) {
      try {
        setFormData(JSON.parse(saved));
      } catch (e) {
        console.error("Error restoring from localStorage", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('proyectos_form_data', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'proyectos_pedagogicos'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProyectoPedagogico));
      const sorted = data.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setProyectos(sorted);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'proyectos_pedagogicos');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEditProyecto = (proyecto: ProyectoPedagogico) => {
    const teacherName = localStorage.getItem('teacherName')?.toUpperCase();
    setPendingAction(() => () => {
      setEditingId(proyecto.id || null);
      setFormData({
        ...proyecto,
        estudiantesParticipantes: proyecto.estudiantesParticipantes || [],
        cronograma: proyecto.cronograma || [{ no: 1, fecha: '', actividad: '' }]
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    setPasswordModalConfig({ type: isDirectivo ? 'admin' : 'docente', teacherName: teacherName });
    setIsPasswordModalOpen(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      fechaRegistro: new Date().toISOString().split('T')[0],
      docente: '',
      area: '',
      tipoEstrategia: '',
      nombreEstrategia: '',
      modalidad: '',
      esPeriodico: 'No',
      periodicidad: '',
      intensidadHoraria: '',
      estudiantesParticipantes: [],
      numeroEstudiantes: 0,
      grados: [],
      objetivo: '',
      tieneDocumentoSoporte: 'No',
      documentoSoporte: '',
      cronograma: [{ no: 1, fecha: '', actividad: '' }]
    });
  };

  const handleDeleteProyecto = async (proyecto: ProyectoPedagogico) => {
    const teacherName = localStorage.getItem('teacherName')?.toUpperCase();
    const isOwner = proyecto?.docente?.toUpperCase() === teacherName;
    if (!isDirectivo && !isOwner) {
      notify.error("No tiene permisos para eliminar esta estrategia.");
      return;
    }
    setConfirmMessage(`¿ELIMINAR ESTRATEGIA "${proyecto.nombreEstrategia.toUpperCase()}"?`);
    setOnConfirm(() => async () => {
      try {
        await deleteDoc(doc(db, 'proyectos_pedagogicos', proyecto.id!));
        notify.success('Estrategia eliminada.');
      } catch (error: any) {
        handleFirestoreError(error, OperationType.DELETE, `proyectos_pedagogicos/${proyecto.id}`);
      }
    });
    setPendingAction(() => () => setIsConfirmOpen(true));
    setPasswordModalConfig({ type: isDirectivo ? 'admin' : 'docente', teacherName: teacherName });
    setIsPasswordModalOpen(true);
  };

  const addEstudianteRow = () => {
    setFormData(prev => ({
      ...prev,
      estudiantesParticipantes: [...(prev.estudiantesParticipantes || []), { nombre: '', documento: '', grado: '' }]
    }));
  };

  const updateEstudiante = (index: number, field: keyof EstudianteParticipante, value: string) => {
    setFormData(prev => {
      const newList = [...(prev.estudiantesParticipantes || [])];
      newList[index] = { ...newList[index], [field]: value };
      return { ...prev, estudiantesParticipantes: newList };
    });
  };

  const removeEstudiante = (index: number) => {
    setFormData(prev => ({
      ...prev,
      estudiantesParticipantes: (prev.estudiantesParticipantes || []).filter((_, i) => i !== index)
    }));
  };

  const addCronogramaRow = () => {
    setFormData(prev => {
      const current = prev.cronograma || [];
      return {
        ...prev,
        cronograma: [...current, { no: current.length + 1, fecha: '', actividad: '' }]
      };
    });
  };

  const updateCronograma = (index: number, field: keyof ActividadCronograma, value: any) => {
    setFormData(prev => {
      const newList = [...(prev.cronograma || [])];
      newList[index] = { ...newList[index], [field]: value };
      return { ...prev, cronograma: newList };
    });
  };

  const removeCronograma = (index: number) => {
    setFormData(prev => ({
      ...prev,
      cronograma: (prev.cronograma || []).filter((_, i) => i !== index).map((c, i) => ({ ...c, no: i + 1 }))
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || isSaving) return;
    setIsSaving(true);
    try {
      const data = {
        ...formData,
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'proyectos_pedagogicos', editingId), data);
        notify.success('ESTRATEGIA ACTUALIZADA CORRECTAMENTE.');
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'proyectos_pedagogicos'), {
          ...data,
          authorUid: auth.currentUser.uid,
          authorEmail: auth.currentUser.email || '',
          createdAt: serverTimestamp()
        });
        notify.success('ESTRATEGIA REGISTRADA EN EL SISTEMA.');
      }
      localStorage.removeItem('proyectos_form_data');
      cancelEdit();
    } catch (error: any) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'proyectos_pedagogicos');
    } finally {
      setIsSaving(false);
    }
  };

  const exportPDF = (p: ProyectoPedagogico) => {
    const doc = new jsPDF();
    const nextY = drawExecutiveHeader(doc, "REGISTRO DE ESTRATEGIA DE FORMACIÓN INTEGRAL", INTRO_TEXTS.ESTRATEGIA_FORMACION);
    
    // table 1: IDENTIFICACION
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("IDENTIFICACIÓN", PDF_MARGIN, nextY);

    autoTable(doc, {
      startY: nextY + 5,
      head: [['CAMPO TÉCNICO', 'DESCRIPCIÓN DETALLADA']],
      body: [
        ['FECHA DE REGISTRO', p.fechaRegistro || '-'],
        ['COORDINADOR', p.docente.toUpperCase()],
        ['ÁREA', p.area.toUpperCase()],
        ['MODELO DE ESTRATEGIA PEDAGÓGICA', p.tipoEstrategia.toUpperCase()],
        ['NOMBRE DE LA ESTRATEGIA', p.nombreEstrategia.toUpperCase()],
        ['MODALIDAD DE LA ESTRATEGIA PEDAGÓGICA', (p.modalidad || '-').toUpperCase()],
        ['¿SE IMPLEMENTA DE MANERA PERIÓDICA EN EL MARCO DEL CALENDARIO ESCOLAR?', p.esPeriodico || 'NO'],
        ['PERIODICIDAD', (p.periodicidad || '-').toUpperCase()],
        ['INTENSIDAD HORARIA', (p.intensidadHoraria || '-').toUpperCase()],
        ['TOTAL PARTICIPANTES', p.estudiantesParticipantes?.length || p.numeroEstudiantes || 0],
        ['GRADOS IMPACTADOS', (p.grados?.join(', ') || '-').toUpperCase()],
        ['OBJETIVO DE LA ESTRATEGIA', p.objetivo.toUpperCase()],
        ['¿CUENTA CON DOCUMENTO SOPORTE QUE JUSTIFIQUE SU ESTRUCTURACIÓN?', p.tieneDocumentoSoporte || 'NO'],
        ['LA URL COMPARTIDA', p.documentoSoporte || 'NO REGISTRA URL'],
      ],
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9, halign: 'center' },
      styles: { fontSize: 8.5, cellPadding: 3.5, lineColor: [200, 200, 200] },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 85, fillColor: [245, 247, 250] },
        1: { cellWidth: 'auto' }
      }
    });

    // table 2: PARTICIPANTES
    let currentY = (doc as any).lastAutoTable.finalY + 15;
    if (currentY + 40 > 280) { doc.addPage(); currentY = 40; }
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("PARTICIPANTES", PDF_MARGIN, currentY);

    if (p.estudiantesParticipantes?.length) {
      autoTable(doc, {
        startY: currentY + 5,
        head: [['NOMBRES Y APELLIDOS', 'IDENTIFICACIÓN', 'GRADO']],
        body: p.estudiantesParticipantes.map(e => [e.nombre.toUpperCase(), e.documento, e.grado.toUpperCase()]),
        theme: 'striped',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 3 }
      });
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100);
      doc.text("No se registraron participantes individuales en este reporte.", PDF_MARGIN, currentY + 12);
      (doc as any).lastAutoTable = { finalY: currentY + 12 };
    }

    // table 3: CRONOGRAMA
    currentY = (doc as any).lastAutoTable.finalY + 15;
    if (currentY + 40 > 280) { doc.addPage(); currentY = 40; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("CRONOGRAMA DE ACTIVIDADES", PDF_MARGIN, currentY);

    if (p.cronograma?.length) {
      autoTable(doc, {
        startY: currentY + 5,
        head: [['ÍTEM', 'FECHA', 'ACTIVIDADES REALIZADAS']],
        body: p.cronograma.map(c => [c.no, c.fecha, c.actividad.toUpperCase()]),
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 3.5 }
      });
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100);
      doc.text("No se registró cronograma de actividades en este reporte.", PDF_MARGIN, currentY + 12);
      (doc as any).lastAutoTable = { finalY: currentY + 12 };
    }

    // Signatures Section
    let sigY = (doc as any).lastAutoTable.finalY + 30;
    const sigW = 60;
    const sigH = 18;
    const pageWidth = doc.internal.pageSize.width;

    if (sigY + 65 > 280) {
      doc.addPage();
      sigY = 40;
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

    // Row 1: Teacher (Centered)
    const xDocente = (pageWidth / 2) - (sigW / 2);
    doc.setDrawColor(200);
    doc.rect(xDocente, sigY, sigW, sigH);
    doc.line(xDocente, sigY + sigH, xDocente + sigW, sigY + sigH);
    doc.text(p.docente.toUpperCase(), xDocente + sigW/2, sigY + sigH + 5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("DOCENTE COORDINADOR", xDocente + sigW/2, sigY + sigH + 9, { align: 'center' });

    // Row 2: Tutor and Directivo (Below)
    const sigY2 = sigY + sigH + 25;
    
    // Leonardo Orozco (Left)
    const xTutor = PDF_MARGIN + 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.rect(xTutor, sigY2, sigW, sigH);
    doc.line(xTutor, sigY2 + sigH, xTutor + sigW, sigY2 + sigH);
    doc.text("LEONARDO OROZCO", xTutor + sigW/2, sigY2 + sigH + 5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("TUTOR PTAFI 3.0", xTutor + sigW/2, sigY2 + sigH + 9, { align: 'center' });

    // Manuel Maldonado (Right)
    const xDirectivo = pageWidth - PDF_MARGIN - sigW - 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.rect(xDirectivo, sigY2, sigW, sigH);
    doc.line(xDirectivo, sigY2 + sigH, xDirectivo + sigW, sigY2 + sigH);
    doc.text("MANUEL MALDONADO", xDirectivo + sigW/2, sigY2 + sigH + 5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("DIRECTIVO DOCENTE", xDirectivo + sigW/2, sigY2 + sigH + 9, { align: 'center' });

    drawExecutiveFooter(doc, 1, (doc as any).internal.getNumberOfPages());
    doc.save(`EFI_${p.nombreEstrategia.replace(/\s+/g, '_')}.pdf`);

  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      <PageHeader 
        title="REGISTRO DE ESTRATEGIAS DE FORMACIÓN INTEGRAL"
        description="Gestión oficial de Centros de Interés, Semilleros y Proyectos Pedagógicos."
        imageUrl="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?q=80&w=2070&auto=format&fit=crop"
      />

      <div className="executive-card overflow-hidden bg-slate-900/40 border-white/5 backdrop-blur-xl">
        <div className="px-10 py-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-blue-900/20 to-transparent">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-[0.2em] italic">
              {editingId ? 'Editando Estrategia' : 'Nueva Estrategia Pedagógica'}
            </h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 italic">Diligencie todos los campos técnicos requeridos</p>
          </div>
          {editingId && (
            <button onClick={cancelEdit} className="text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Cancelar Edición</button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-12">
          {/* Bloque 1: Datos Básicos y Estrategia */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="space-y-4">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Calendar size={14} className="text-blue-400" /> FECHA DE REGISTRO
               </label>
               <input 
                 type="date" 
                 value={formData.fechaRegistro}
                 onChange={(e) => setFormData({...formData, fechaRegistro: e.target.value})}
                 className="executive-input w-full"
                 required
               />
            </div>
            
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users size={14} className="text-blue-400" /> COORDINADOR
              </label>
              <select 
                value={formData.docente}
                onChange={(e) => setFormData({...formData, docente: e.target.value})}
                className="executive-input w-full"
                required
              >
                <option value="">SELECCIONE DOCENTE...</option>
                {customDocentes.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ÁREA</label>
              <select 
                value={formData.area}
                onChange={(e) => setFormData({...formData, area: e.target.value})}
                className="executive-input w-full"
                required
              >
                <option value="">SELECCIONE ÁREA...</option>
                {customAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">4) MODELO DE ESTRATEGIA PEDAGÓGICA</label>
              <div className="flex gap-2">
                <select 
                  value={formData.tipoEstrategia}
                  onChange={(e) => setFormData({...formData, tipoEstrategia: e.target.value})}
                  className="executive-input flex-1"
                  required
                >
                  <option value="">SELECCIONE...</option>
                  {estrategias.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <button 
                  type="button" 
                  onClick={() => {
                    const res = prompt("Nueva estrategia:");
                    if(res) {
                       setEstrategias(prev => [...prev, res]);
                       setFormData({...formData, tipoEstrategia: res});
                    }
                  }}
                  className="p-3 bg-blue-600/20 text-blue-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NOMBRE DE LA ESTRATEGIA</label>
              <input 
                type="text" 
                value={formData.nombreEstrategia}
                onChange={(e) => setFormData({...formData, nombreEstrategia: e.target.value})}
                className="executive-input w-full py-4 text-xl font-black italic"
                placeholder="NOMBRE DE LA ESTRATEGIA..."
                required
              />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MODALIDAD DE LA ESTRATEGIA PEDAGÓGICA</label>
              <select 
                 value={formData.modalidad}
                 onChange={(e) => setFormData({...formData, modalidad: e.target.value})}
                 className="executive-input w-full"
                 required
               >
                 <option value="">SELECCIONE MODALIDAD...</option>
                 {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
             <div className="space-y-4 col-span-1 lg:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">¿Se implementa de manera periódica en el marco del calendario escolar?</label>
                <select 
                  value={formData.esPeriodico}
                  onChange={(e) => setFormData({...formData, esPeriodico: e.target.value as 'Sí' | 'No'})}
                  className="executive-input w-full"
                  required
                >
                  <option value="">SELECCIONE...</option>
                  <option value="Sí">SÍ</option>
                  <option value="No">NO</option>
                </select>
             </div>
             <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Periodicidad</label>
                <select 
                  value={formData.periodicidad}
                  onChange={(e) => setFormData({...formData, periodicidad: e.target.value})}
                  className={`executive-input w-full transition-all ${formData.esPeriodico === 'No' ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}
                  disabled={formData.esPeriodico === 'No'}
                  required={formData.esPeriodico === 'Sí'}
                >
                  <option value="">SELECCIONE...</option>
                  {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
             </div>
             <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Intensidad Horaria</label>
                <select 
                  value={formData.intensidadHoraria}
                  onChange={(e) => setFormData({...formData, intensidadHoraria: e.target.value})}
                  className={`executive-input w-full transition-all ${formData.esPeriodico === 'No' ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}
                  disabled={formData.esPeriodico === 'No'}
                  required={formData.esPeriodico === 'Sí'}
                >
                  <option value="">SELECCIONE...</option>
                  {INTENSIDADES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
             <div className="space-y-4 col-span-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Participantes</label>
                <input 
                  type="number"
                  value={formData.numeroEstudiantes}
                  onChange={(e) => setFormData({...formData, numeroEstudiantes: Number(e.target.value)})}
                  className="executive-input w-full text-center text-xl font-black"
                />
             </div>
          </div>

          {/* Grados Impactados */}
          <div className="space-y-6">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Grados Impactados</label>
             <div className="flex flex-wrap gap-3">
               {['TRANSICIÓN','1°','2°','3°','4°','5°','6°', '7°','8°','9°','10°','11°'].map(grado => (
                 <button
                   key={grado}
                   type="button"
                   onClick={() => {
                     const cur = formData.grados || [];
                     if(cur.includes(grado)) setFormData({...formData, grados: cur.filter(g => g !== grado)});
                     else setFormData({...formData, grados: [...cur, grado]});
                   }}
                   className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all border ${
                     formData.grados?.includes(grado) 
                       ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-900/30' 
                       : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                   }`}
                 >
                   {grado}
                 </button>
               ))}
             </div>
          </div>

          {/* Dinámico: Estudiantes */}
          <div className="bg-black/20 p-8 rounded-[2rem] border border-white/5 space-y-8">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
               <div>
                  <h3 className="text-white font-black uppercase text-sm tracking-widest">Estudiantes Participantes</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Carga ágil de nómina institucional</p>
               </div>
               <div className="flex gap-3 w-full md:w-auto">
                 <button 
                   type="button" 
                   onClick={() => {
                     const bulkText = prompt("PEGUE LA LISTA DE ESTUDIANTES (Formato: Nombre | Documento | Grado)\nSi solo tiene nombres, pegue uno por línea:");
                     if (bulkText) {
                       const lines = bulkText.split('\n').filter(l => l.trim());
                       const newEstudiantes = lines.map(line => {
                         const parts = line.split(/[|;,]/).map(p => p.trim());
                         return {
                           nombre: parts[0]?.toUpperCase() || '',
                           documento: parts[1] || '',
                           grado: parts[2] || ''
                         };
                       });
                       setFormData(prev => ({
                         ...prev,
                         estudiantesParticipantes: [...(prev.estudiantesParticipantes || []), ...newEstudiantes],
                         numeroEstudiantes: (prev.numeroEstudiantes || 0) + newEstudiantes.length
                       }));
                       notify.success(`${newEstudiantes.length} Estudiantes agregados.`);
                     }
                   }} 
                   className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                 >
                   <FileOutput size={16} /> Pegar desde Excel/Doc
                 </button>
                 <button type="button" onClick={addEstudianteRow} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20">
                   <Plus size={16} /> Agregar Fila
                 </button>
               </div>
             </div>
             
             <div className="space-y-4">
                {(formData.estudiantesParticipantes || []).slice(0, 100).map((est, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 relative group animate-in fade-in zoom-in-95">
                    <input 
                      placeholder="Nombre Completo..."
                      className="executive-input bg-transparent border-white/10 text-white text-[12px] font-bold"
                      value={est.nombre}
                      onChange={(e) => updateEstudiante(idx, 'nombre', e.target.value.toUpperCase())}
                    />
                    <input 
                      placeholder="Identificación..."
                      className="executive-input bg-transparent border-white/10 text-white text-[12px] font-bold"
                      value={est.documento}
                      onChange={(e) => updateEstudiante(idx, 'documento', e.target.value)}
                    />
                    <select 
                      className="executive-input bg-transparent border-white/10 text-white text-[12px] font-bold"
                      value={est.grado}
                      onChange={(e) => updateEstudiante(idx, 'grado', e.target.value)}
                    >
                      <option value="">CURSO...</option>
                      {GRADOS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <div className="flex items-center justify-end">
                       <button onClick={() => removeEstudiante(idx)} type="button" className="p-3 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all">
                         <Trash2 size={20} />
                       </button>
                    </div>
                  </div>
                ))}
             </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivo de la Estrategia</label>
            <textarea 
              value={formData.objetivo}
              onChange={(e) => setFormData({...formData, objetivo: e.target.value})}
              className="executive-input w-full min-h-[120px] p-6 text-lg leading-relaxed italic"
              placeholder="DESCRIBA LOS OBJETIVOS Y METAS..."
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">¿Cuenta con documento soporte que justifique su estructuración?</label>
              <select 
                value={formData.tieneDocumentoSoporte}
                onChange={(e) => setFormData({...formData, tieneDocumentoSoporte: e.target.value as 'Sí' | 'No'})}
                className="executive-input w-full"
                required
              >
                <option value="">SELECCIONE...</option>
                <option value="Sí">SÍ</option>
                <option value="No">NO</option>
              </select>
            </div>

            {formData.tieneDocumentoSoporte === 'Sí' && (
              <div className="space-y-4 animate-in slide-in-from-left-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                   <Link2 size={14} className="text-blue-400" /> URL de Soporte / Ficha Técnica
                 </label>
                 <div className="flex gap-4">
                   <input 
                     type="url"
                     value={formData.documentoSoporte}
                     onChange={(e) => setFormData({...formData, documentoSoporte: e.target.value})}
                     className="executive-input flex-1 p-6 text-blue-400 font-mono text-sm"
                     placeholder="HTTPS://DRIVE.GOOGLE.COM/..."
                     required={formData.tieneDocumentoSoporte === 'Sí'}
                   />
                   {formData.documentoSoporte && (
                     <div className="flex gap-2">
                        <a href={formData.documentoSoporte} target="_blank" rel="noreferrer" className="p-5 bg-white/5 text-slate-400 hover:text-blue-400 rounded-2xl transition-all border border-white/10">
                          <Eye size={24} />
                        </a>
                        <button onClick={() => setFormData({...formData, documentoSoporte: ''})} type="button" className="p-5 bg-white/5 text-slate-400 hover:text-rose-500 rounded-2xl transition-all border border-white/10">
                          <Trash2 size={24} />
                        </button>
                     </div>
                   )}
                 </div>
              </div>
            )}
          </div>

          {/* Cronograma */}
          <div className="bg-black/20 p-8 rounded-[2rem] border border-white/5 space-y-8">
             <div className="flex justify-between items-center px-2">
               <div>
                  <h3 className="text-white font-black uppercase text-sm tracking-widest">Cronograma de Actividades</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Encuentros y despliegue pedagógico</p>
               </div>
               <button type="button" onClick={addCronogramaRow} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20">
                 <Plus size={16} /> Nueva Actividad
               </button>
             </div>
             
             <div className="space-y-4">
                {(formData.cronograma || []).map((c, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row gap-4 bg-white/5 p-6 rounded-[1.5rem] border border-white/5 items-start">
                    <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-white/5 text-slate-500 rounded-xl font-black">{c.no}</div>
                    <div className="w-full md:w-48">
                       <input 
                         type="date"
                         value={c.fecha}
                         onChange={(e) => updateCronograma(idx, 'fecha', e.target.value)}
                         className="executive-input w-full bg-transparent border-white/10"
                       />
                    </div>
                    <div className="flex-1 w-full">
                       <textarea 
                         placeholder="Actividad Pedagógica..."
                         className="executive-input w-full bg-transparent border-white/10 min-h-[60px]"
                         value={c.actividad}
                         onChange={(e) => updateCronograma(idx, 'actividad', e.target.value.toUpperCase())}
                       />
                    </div>
                    <button onClick={() => removeCronograma(idx)} type="button" className="p-4 text-rose-500 hover:bg-white/5 rounded-2xl transition-all self-center">
                       <Trash2 size={22} />
                    </button>
                  </div>
                ))}
             </div>
          </div>

          <button
            type="submit"
            disabled={loading || isSaving}
            className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[2.5rem] font-black text-xl uppercase tracking-[0.5em] transition-all flex items-center justify-center gap-4 shadow-3xl shadow-blue-900/40 active:scale-95 border-b-8 border-blue-800 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={32} /> : <Save size={32} />}
            {isSaving ? 'Guardando...' : (editingId ? 'Actualizar Estrategia' : 'Guardar Estrategia')}
          </button>
        </form>
      </div>

      {/* Listado Consolidado */}
      <div className="mt-12 space-y-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black text-white uppercase tracking-widest italic">Análisis Consolidado de Estrategias F.I.</h2>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest border-l-4 border-blue-600 pl-4">Supervisión Institucional de Programas de Formación Integral</p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {proyectos.map((p) => (
            <div key={p.id} className="executive-card bg-slate-900/60 border-white/5 hover:border-blue-500 transition-all group p-8 flex flex-col md:flex-row gap-8 items-center justify-between">
               <div className="flex items-center gap-8 flex-1 min-w-0">
                  <div className="w-20 h-20 bg-blue-600/10 rounded-[2rem] flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                     <FileText size={32} />
                  </div>
                  <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-3 mb-2">
                       <span className="px-3 py-1 bg-white/5 text-[9px] font-black text-slate-500 rounded-full border border-white/5 uppercase">{p.tipoEstrategia}</span>
                       <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                       <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest truncate">{p.docente}</span>
                     </div>
                     <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2 truncate group-hover:text-blue-200 transition-colors">{p.nombreEstrategia}</h3>
                     <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] italic">
                        <span>Intensidad: <span className="text-white">{p.intensidadHoraria}</span></span>
                        <span>Grados: <span className="text-white">{p.grados?.join(', ')}</span></span>
                        <span>Participantes: <span className="text-white">{p.estudiantesParticipantes?.length || 0}</span></span>
                     </div>
                  </div>
               </div>

               <div className="flex gap-4 flex-shrink-0">
                  <button onClick={() => handleEditProyecto(p)} className="p-4 bg-white/5 text-slate-400 hover:text-blue-400 rounded-2xl hover:bg-white/10 transition-all border border-white/5"><Edit size={22} /></button>
                  <button onClick={() => exportPDF(p)} className="p-4 bg-white/5 text-slate-400 hover:text-emerald-400 rounded-2xl hover:bg-white/10 transition-all border border-white/5"><Download size={22} /></button>
                  <button onClick={() => handleDeleteProyecto(p)} className="p-4 bg-white/5 text-slate-400 hover:text-rose-400 rounded-2xl hover:bg-white/10 transition-all border border-white/5"><Trash2 size={22} /></button>
               </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          if (onConfirm) onConfirm();
        }}
        message={confirmMessage}
      />
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
          pendingAction?.();
          setPendingAction(null);
        }}
        passwordType={passwordModalConfig.type}
        teacherName={passwordModalConfig.teacherName}
      />
    </div>
  );
}
