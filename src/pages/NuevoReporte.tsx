import React, { useState, useEffect, useMemo } from 'react';
import { PERIODOS, GRADOS, DOCENTES, AREAS, BARRERAS } from '../lib/constants';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Save, RefreshCw, Plus, Trash2, CloudUpload, Lock, ShieldCheck, PencilLine, AlertTriangle, AlertOctagon, BrainCircuit, FileOutput } from 'lucide-react';
import { useCustomLists } from '../hooks/useCustomLists';
import { AccionMejoramiento } from '../lib/types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { PasswordModal } from '../components/PasswordModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS, getPerfectTableStyles } from '../lib/pdfUtils';

import { PageHeader } from '../components/PageHeader';
import { InstitutionalLoading } from '../components/InstitutionalLoading';
import { formatName } from '../lib/formatter';

export function NuevoReporte() {
  const { docentes: customDocentes, areas: customAreas, addDocente, removeDocente, addArea, removeArea } = useCustomLists();

  const userRole = localStorage.getItem('userRole');
  const teacherName = localStorage.getItem('teacherName');
  const isDirectivo = userRole === 'directivo';
  const isAdministrativo = userRole === 'administrativo';

  const [formData, setFormData] = useState({
    periodo: 'I',
    docente: '',
    grado: '',
    area: '',
    estudiantesPreventivo: '',
    estudiantesPierden: '',
    estrategias: '',
    barreras: [] as string[],
    accionesMejoramiento: [] as AccionMejoramiento[]
  });

  const [totalPreestablecido, setTotalPreestablecido] = useState<number>(0);

  const [existingReportId, setExistingReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'warning'>('success');
  const [modalMessage, setModalMessage] = useState('');

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [promptAction, setPromptAction] = useState<((val: string) => void) | null>(null);

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptValue.trim()) {
      promptAction?.(promptValue.trim());
      setIsPromptModalOpen(false);
      setPromptValue('');
    }
  };

  // Auto-check for existing report when key fields change
  useEffect(() => {
    const checkExisting = async () => {
      if (formData.periodo && formData.docente && formData.grado && formData.area) {
        try {
          const q = query(
            collection(db, 'reportes'),
            where('periodo', '==', formData.periodo),
            where('docente', '==', formData.docente),
            where('grado', '==', formData.grado),
            where('area', '==', formData.area)
          );
          const snapshot = await getDocs(q);

          // Also fetch total students for this grade
          const matriculaSnap = await getDoc(doc(db, 'matriculas', formData.grado));
          if (matriculaSnap.exists()) {
            setTotalPreestablecido(matriculaSnap.data().totalEstudiantes || 0);
          }

          if (!snapshot.empty) {
            const docData = snapshot.docs[0];
            setExistingReportId(docData.id);
            setMessage({
              type: 'warning',
              text: 'Ya existe un reporte para esta combinación. Al guardar, se actualizará el registro existente.'
            });
            
            const data = docData.data();
            setFormData(prev => ({
              ...prev,
              estudiantesPreventivo: (data.estudiantesPreventivo || []).join('\n'),
              estudiantesPierden: (data.estudiantesPierden || []).join('\n'),
              estrategias: (data.estrategias || []).join('\n'),
              barreras: data.barreras || [],
              accionesMejoramiento: data.accionesMejoramiento || []
            }));
          } else {
            setExistingReportId(null);
            setMessage(null);
          }
        } catch (error) {
          console.error("Error checking existing report:", error);
        }
      }
    };
    checkExisting();
  }, [formData.periodo, formData.docente, formData.grado, formData.area]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (barrera: string) => {
    setFormData(prev => {
      const isSelected = prev.barreras.includes(barrera);
      if (isSelected) {
        return { ...prev, barreras: prev.barreras.filter(b => b !== barrera) };
      } else {
        return { ...prev, barreras: [...prev.barreras, barrera] };
      }
    });
  };

  const cleanList = (text: string) => {
    if (!text) return [];
    return String(text).split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const countLines = (text: string) => {
    return cleanList(text).length;
  };

  const generarActaCortePreventivo = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      const preventivo = cleanList(formData.estudiantesPreventivo).slice().sort();
      if (preventivo.length === 0) {
        setModalType('warning');
        setModalMessage('NO HAY ESTUDIANTES EN CORTE PREVENTIVO PARA GENERAR EL ACTA.');
        setIsMessageModalOpen(true);
        return;
      }

      const reportTitle = "ACTA DE CORTE PREVENTIVO ACADÉMICO";
      const metaInfo = `DOCENTE: ${formData.docente.toUpperCase()}   |   PERIODO: ${formData.periodo}   |   GRADO: ${formData.grado}   |   ÁREA: ${formData.area.toUpperCase()}`;
      const startY = drawExecutiveHeader(doc, reportTitle, INTRO_TEXTS.ACTA_CORTE_PREVENTIVO, metaInfo);
      
      let currentY = startY;

      // Table
      autoTable(doc, {
        startY: currentY,
        ...getPerfectTableStyles(),
        head: [['#', 'ESTUDIANTE EN RIESGO ACADÉMICO']],
        body: preventivo.map((name, idx) => [idx + 1, name.toUpperCase()]),
        columnStyles: { 
          0: { cellWidth: 12, halign: 'center' }, 
          1: { halign: 'left' } 
        },
        didDrawPage: (data) => {
          doc.setPage(data.pageNumber);
          drawExecutiveFooter(doc, data.pageNumber, (doc.internal as any).getNumberOfPages());
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 25;

      if (currentY > pageHeight - 50) {
        doc.addPage();
        currentY = drawExecutiveHeader(doc, reportTitle);
      }

      // Signature
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      const directorX = pageWidth / 2;
      
      doc.line(directorX - 40, currentY + 15, directorX + 40, currentY + 15);
      doc.text(formData.docente.toUpperCase(), directorX, currentY + 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("DOCENTE TITULAR", directorX, currentY + 24, { align: "center" });

      currentY += 40;
      if (currentY > pageHeight - 40) { doc.addPage(); currentY = 40; }

      doc.line(directorX - 40, currentY + 15, directorX + 40, currentY + 15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("MANUEL MALDONADO", directorX, currentY + 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("RECTOR INSTITUCIONAL", directorX, currentY + 24, { align: "center" });

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, totalPages);
      }

      doc.save(`Acta_Corte_Preventivo_${formData.grado}_P${formData.periodo}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  const studentsFailing = useMemo(() => {
    return cleanList(formData.estudiantesPierden);
  }, [formData.estudiantesPierden]);

  const handleAddAccion = () => {
    setFormData(prev => ({
      ...prev,
      accionesMejoramiento: [...prev.accionesMejoramiento, { estudiante: '', realizoAccion: 'No' }]
    }));
  };

  const handleRemoveAccion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      accionesMejoramiento: prev.accionesMejoramiento.filter((_, i) => i !== index)
    }));
  };

  const handleAccionChange = (index: number, field: keyof AccionMejoramiento, value: string) => {
    setFormData(prev => {
      const newAcciones = [...prev.accionesMejoramiento];
      newAcciones[index] = { ...newAcciones[index], [field]: value };
      
      // Reset dependent fields if realizoAccion changes to 'No'
      if (field === 'realizoAccion' && value === 'No') {
        newAcciones[index].accionRealizada = '';
        newAcciones[index].aprobo = undefined;
        newAcciones[index].nota = '';
      }
      
      return { ...prev, accionesMejoramiento: newAcciones };
    });
  };

  const handleAddDocente = () => {
    if (!isDirectivo) return;
    setPendingAction(() => () => {
      setPromptMessage('Ingrese el nombre del nuevo docente:');
      setPromptAction(() => (val: string) => {
        const nombre = val.trim().toUpperCase();
        addDocente(nombre);
        setFormData(prev => ({ ...prev, docente: nombre }));
      });
      setIsPromptModalOpen(true);
    });
    setIsPasswordModalOpen(true);
  };

  const handleRemoveDocente = () => {
    if (!isDirectivo) return;
    if (formData.docente && customDocentes.includes(formData.docente)) {
      setPendingAction(() => () => {
        removeDocente(formData.docente);
        setFormData(prev => ({ ...prev, docente: '' }));
      });
      setIsPasswordModalOpen(true);
    }
  };

  const handleAddArea = () => {
    if (!isDirectivo) return;
    setPendingAction(() => () => {
      setPromptMessage('Ingrese el nombre de la nueva área/asignatura:');
      setPromptAction(() => (val: string) => {
        const nombre = val.trim().toUpperCase();
        addArea(nombre);
        setFormData(prev => ({ ...prev, area: nombre }));
      });
      setIsPromptModalOpen(true);
    });
    setIsPasswordModalOpen(true);
  };

  const handleRemoveArea = () => {
    if (!isDirectivo) return;
    if (formData.area && customAreas.includes(formData.area)) {
      setPendingAction(() => () => {
        removeArea(formData.area);
        setFormData(prev => ({ ...prev, area: '' }));
      });
      setIsPasswordModalOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const preventivoList = cleanList(formData.estudiantesPreventivo);
      const pierdenList = cleanList(formData.estudiantesPierden);
      const estrategiasList = cleanList(formData.estrategias);

      // Remove duplicates
      const uniquePreventivo = Array.from(new Set(preventivoList));
      const uniquePierden = Array.from(new Set(pierdenList));

      const reportData = {
        periodo: formData.periodo,
        docente: formData.docente,
        grado: formData.grado,
        area: formData.area,
        totalEstudiantes: totalPreestablecido,
        estudiantesPreventivo: uniquePreventivo,
        estudiantesPierden: uniquePierden,
        estrategias: estrategiasList,
        barreras: formData.barreras,
        accionesMejoramiento: formData.accionesMejoramiento.filter(a => a.estudiante),
        authorUid: auth.currentUser.uid,
        authorEmail: auth.currentUser.email || '',
        updatedAt: serverTimestamp()
      };

      if (existingReportId) {
        await updateDoc(doc(db, 'reportes', existingReportId), reportData);
        setModalType('success');
        setModalMessage('REPORTE ACTUALIZADO CORRECTAMENTE.');
        setIsMessageModalOpen(true);
      } else {
        await addDoc(collection(db, 'reportes'), {
          ...reportData,
          createdAt: serverTimestamp()
        });
        setModalType('success');
        setModalMessage('REPORTE CREADO CORRECTAMENTE.');
        setIsMessageModalOpen(true);
        // Reset form
        setFormData(prev => ({
          ...prev,
          docente: '',
          grado: '',
          area: '',
          estudiantesPreventivo: '',
          estudiantesPierden: '',
          estrategias: '',
          barreras: [],
          accionesMejoramiento: []
        }));
      }
    } catch (error: any) {
      console.error("Error saving report:", error);
      
      // Expert Error Handling
      const path = existingReportId ? `reportes/${existingReportId}` : 'reportes';
      const operation = existingReportId ? OperationType.UPDATE : OperationType.CREATE;
      
      try {
        handleFirestoreError(error, operation, path);
      } catch (jsonErr: any) {
        setModalType('error');
        setModalMessage('ERROR DE PERMISOS: REVISE SU NIVEL DE ACCESO O EL FORMATO DE LOS DATOS.');
        setIsMessageModalOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader 
        title="REGISTRO DE SEGUIMIENTO ACADÉMICO"
        description="Gestione el progreso académico de sus estudiantes y diseñe intervenciones pedagógicas oportunas para garantizar el éxito y la permanencia institucional."
        imageUrl="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1200"
      />

      <div className="executive-card overflow-hidden">
        {loading && <InstitutionalLoading message="Estableciendo conexión estratégica..." />}
        <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-10">
        {message && (
          <div className={`p-5 rounded-2xl flex items-start gap-4 animate-fade-in-up border-2 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100 shadow-sm shadow-emerald-200/50' :
            message.type === 'warning' ? 'bg-indigo-50 text-indigo-800 border-indigo-100 shadow-sm shadow-indigo-200/50' :
            'bg-rose-50 text-rose-800 border-rose-100 shadow-sm shadow-rose-200/50'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-600" size={24} /> :
             message.type === 'warning' ? <RefreshCw className="shrink-0 mt-0.5 text-indigo-600" size={24} /> :
             <AlertCircle className="shrink-0 mt-0.5 text-rose-600" size={24} />}
            <div>
              <p className="text-sm font-black uppercase tracking-wide mb-1">
                {message.type === 'success' ? 'Operación Exitosa' : message.type === 'warning' ? 'Aviso del Sistema' : 'Error de Registro'}
              </p>
              <p className="text-sm font-medium leading-relaxed uppercase opacity-90">{message.text}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
          <div className="relative group">
            <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-blue-600 transition-colors">Periodo Lectivo *</label>
            <select
              name="periodo"
              value={formData.periodo}
              onChange={handleInputChange}
              required
              className="executive-input"
            >
              <option value="">Seleccione...</option>
              {PERIODOS.map(p => <option key={p} value={p}>Periodo {p}</option>)}
            </select>
          </div>

          <div className="relative group">
             <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-blue-600 transition-colors">Docente Titular *</label>
            <div className="flex gap-3">
              <select
                name="docente"
                value={formData.docente}
                onChange={handleInputChange}
                required
                className="executive-input disabled:opacity-70 disabled:bg-black/20"
              >
                  <option value="">TODOS LOS DOCENTES...</option>
                  {[...customDocentes].sort().map(d => <option key={d} value={d}>{d}</option>)}
                  {formData.docente && !customDocentes.includes(formData.docente) && (
                    <option value={formData.docente}>{formData.docente}</option>
                  )}
                </select>
              {isDirectivo && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAddDocente}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-2xl shadow-lg transition-all active:scale-95"
                    title="Añadir nuevo docente"
                  >
                    <Plus size={22} strokeWidth={3} />
                  </button>
                  {formData.docente && (
                    <button
                      type="button"
                      onClick={handleRemoveDocente}
                      className="bg-rose-500 hover:bg-rose-600 text-white p-3.5 rounded-2xl shadow-lg transition-all active:scale-95"
                      title="Eliminar docente"
                    >
                      <Trash2 size={22} strokeWidth={3} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="relative group">
            <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-blue-600 transition-colors">Grado / Curso *</label>
              <select
                name="grado"
                value={formData.grado}
                onChange={handleInputChange}
                required
                className="executive-input"
              >
                <option value="">TODOS LOS GRADOS...</option>
                {GRADOS.map(g => <option key={g} value={g}>Grado {g}</option>)}
              </select>
          </div>

          <div className="relative group">
            <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-blue-600 transition-colors">Área / Asignatura *</label>
            <div className="flex gap-3">
              <select
                name="area"
                value={formData.area}
                onChange={handleInputChange}
                required
                className="executive-input"
              >
                <option value="">TODAS LAS ASIGNATURAS</option>
                {[...customAreas]
                  .filter(a => !a.toUpperCase().includes('TODAS LAS'))
                  .sort()
                  .map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {isDirectivo && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAddArea}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 rounded-2xl shadow-lg transition-all active:scale-95"
                    title="Añadir nueva área"
                  >
                    <Plus size={22} strokeWidth={3} />
                  </button>
                  {formData.area && (
                    <button
                      type="button"
                      onClick={handleRemoveArea}
                      className="bg-rose-500 hover:bg-rose-600 text-white p-3.5 rounded-2xl shadow-lg transition-all active:scale-95"
                      title="Eliminar área"
                    >
                      <Trash2 size={22} strokeWidth={3} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="flex flex-col bg-white/5 p-8 md:p-10 rounded-[2.5rem] border border-white/5 transition-all hover:bg-white/10 hover:shadow-2xl group">
            <div className="flex flex-col items-center justify-center mb-8 text-center gap-4">
              <div className="bg-amber-600/10 p-6 rounded-[2rem] text-amber-500 shadow-sm border border-amber-500/20 transition-transform group-hover:scale-110 duration-500">
                <AlertTriangle size={40} strokeWidth={2.5} />
              </div>
              <label className="block text-xl font-black text-white uppercase tracking-tight leading-tight max-w-[90%] font-headings">
                ESTUDIANTES EN ALERTA ACADÉMICA:<br/>
                <span className="text-amber-500">CORTE PREVENTIVO DEL PERIODO</span>
              </label>
              <div className="bg-blue-600 text-white px-8 py-2.5 rounded-full shadow-xl shadow-blue-900/20 uppercase text-[10px] font-black tracking-[0.3em] mt-2 flex items-center justify-center min-w-[200px]">
                {countLines(formData.estudiantesPreventivo)} ESTUDIANTES REPORTADOS
              </div>
            </div>
            
            <div className="flex justify-center mb-6">
              <div className="bg-blue-600/10 text-blue-400 px-8 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-wider border border-blue-500/20 shadow-sm text-center max-w-[92%] leading-relaxed">
                Registre a los estudiantes con bajo desempeño según los criterios del SIEE para el presente periodo lectivo.
              </div>
            </div>

            <textarea
              name="estudiantesPreventivo"
              value={formData.estudiantesPreventivo}
              onChange={handleInputChange}
              rows={8}
              className="w-full bg-black/40 border-2 border-white/5 px-6 py-6 text-white focus:outline-none focus:ring-8 focus:ring-blue-600/5 focus:border-blue-500 focus:bg-black/60 transition-all resize-y custom-scrollbar rounded-3xl text-sm font-bold placeholder:text-slate-700 shadow-inner uppercase tracking-wide"
              placeholder="ESCRIBA UN NOMBRE POR LÍNEA..."
            />
          </div>

          <div className="flex flex-col bg-white/5 p-8 md:p-10 rounded-[2.5rem] border border-white/5 transition-all hover:bg-white/10 hover:shadow-2xl group">
            <div className="flex flex-col items-center justify-center mb-8 text-center gap-4">
              <div className="bg-rose-600/10 p-6 rounded-[2rem] text-rose-500 shadow-sm border border-rose-500/20 transition-transform group-hover:scale-110 duration-500">
                <AlertOctagon size={40} strokeWidth={2.5} />
              </div>
              <label className="block text-xl font-black text-white uppercase tracking-tight leading-tight max-w-[90%] font-headings">
                CONSOLIDADO DE DESEMPEÑO BAJO<br/>
                <span className="text-rose-500">(FINAL DE PERIODO)</span>
              </label>
              <div className="bg-blue-600 text-white px-8 py-2.5 rounded-full shadow-xl shadow-blue-900/20 uppercase text-[10px] font-black tracking-[0.3em] mt-2 flex items-center justify-center min-w-[200px]">
                {countLines(formData.estudiantesPierden)} ESTUDIANTES REPORTADOS
              </div>
            </div>

            <div className="flex justify-center mb-6">
              <div className="bg-rose-600/10 text-rose-400 px-8 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-wider border border-rose-500/20 shadow-sm text-center max-w-[92%] leading-relaxed">
                Relacione los estudiantes que presentan valoración de desempeño bajo al cierre definitivo del periodo.
              </div>
            </div>

            <textarea
              name="estudiantesPierden"
              value={formData.estudiantesPierden}
              onChange={handleInputChange}
              rows={8}
              className="w-full bg-black/40 border-2 border-white/5 px-6 py-6 text-white focus:outline-none focus:ring-8 focus:ring-rose-600/5 focus:border-rose-500 focus:bg-black/60 transition-all resize-y custom-scrollbar rounded-3xl text-sm font-bold placeholder:text-slate-700 shadow-inner uppercase tracking-wide"
              placeholder="ESCRIBA UN NOMBRE POR LÍNEA..."
            />
          </div>
        </div>

        {/* Acciones de Mejoramiento */}
        <div className="pt-8 border-t border-white/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div className="flex items-start gap-4">
              {studentsFailing.length === 0 ? (
                <div className="p-3 bg-white/5 rounded-2xl shrink-0">
                  <Lock size={24} className="text-slate-600" />
                </div>
              ) : (
                <div className="p-3 bg-blue-600/20 rounded-2xl shrink-0 border border-blue-500/30 shadow-[0_0_20px_rgba(37,99,235,0.2)]">
                  <ShieldCheck size={24} className="text-blue-400" />
                </div>
              )}
              <div>
                <label className="block text-xl font-headings font-black text-white uppercase tracking-wide">
                  ACCIONES DE MEJORAMIENTO
                </label>
                <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl uppercase tracking-tighter">
                  Sincronización pedagógica para la superación de debilidades académicas registradas.
                </p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleAddAccion}
              disabled={studentsFailing.length === 0}
              className="shrink-0 flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed font-black px-8 py-4 rounded-2xl transition-all text-[11px] tracking-[0.2em] shadow-xl shadow-blue-900/20 active:scale-95 border border-blue-400/20"
            >
              <Plus size={18} strokeWidth={3} /> AÑADIR REGISTRO
            </button>
          </div>

          <div className="space-y-4">
            {formData.accionesMejoramiento.map((accion, index) => (
              <div key={index} className="flex flex-col gap-4 p-8 bg-black/40 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group hover:border-blue-500/20 transition-all duration-500">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accion.realizoAccion === 'No' ? 'bg-slate-800' : accion.aprobo === 'Sí' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]'}`}></div>
                
                <div className="flex flex-col lg:flex-row gap-5 items-start lg:items-end w-full pl-2">
                  <div className="w-full lg:flex-[2.5] min-w-0">
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 tracking-[0.2em] ml-1">Estudiante</label>
                    <select
                      value={accion.estudiante}
                      onChange={(e) => handleAccionChange(index, 'estudiante', e.target.value)}
                      className="executive-input py-3.5 text-[13px] font-bold"
                    >
                      <option value="" className="bg-[#1A1A1A]">SELECCIONAR...</option>
                      {studentsFailing.map(est => (
                        <option key={est} value={est} className="bg-[#1A1A1A]">{est}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-full lg:w-32 shrink-0">
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 tracking-[0.2em] ml-1">¿Se realizó?</label>
                    <select
                      value={accion.realizoAccion}
                      onChange={(e) => handleAccionChange(index, 'realizoAccion', e.target.value)}
                      className="executive-input py-3.5 text-[13px] font-bold text-center"
                    >
                      <option value="Sí" className="bg-[#1A1A1A]">Sí</option>
                      <option value="No" className="bg-[#1A1A1A]">No</option>
                    </select>
                  </div>

                  <div className="w-full lg:flex-[4] min-w-0">
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 tracking-[0.2em] ml-1">Acción Implementada</label>
                    <input
                      type="text"
                      value={accion.accionRealizada || ''}
                      onChange={(e) => handleAccionChange(index, 'accionRealizada', e.target.value)}
                      placeholder="DESCRIPCIÓN DE LA ACCIÓN PEDAGÓGICA..."
                      className="executive-input py-3.5 px-6 text-[13px] font-bold uppercase placeholder:text-slate-700 placeholder:normal-case placeholder:font-medium"
                      disabled={accion.realizoAccion === 'No'}
                    />
                  </div>
                  
                  <div className="w-full lg:w-28 shrink-0">
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 tracking-[0.2em] ml-1">¿Aprobó?</label>
                    <select
                      value={accion.aprobo || ''}
                      onChange={(e) => {
                        handleAccionChange(index, 'aprobo', e.target.value);
                        if (e.target.value !== 'Sí') {
                          handleAccionChange(index, 'nota', '');
                        }
                      }}
                      className="executive-input py-3.5 text-[13px] font-bold text-center"
                      disabled={accion.realizoAccion === 'No'}
                    >
                      <option value="" className="bg-[#1A1A1A]">SEL...</option>
                      <option value="Sí" className="bg-[#1A1A1A]">Sí</option>
                      <option value="No" className="bg-[#1A1A1A]">No</option>
                    </select>
                  </div>
                  
                  <div className="w-full lg:w-24 shrink-0">
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 tracking-[0.2em] ml-1">Nota</label>
                    <input
                      type="text"
                      value={accion.nota || ''}
                      onChange={(e) => handleAccionChange(index, 'nota', e.target.value)}
                      placeholder="5.0"
                      className="executive-input py-3.5 text-center font-black text-[14px] placeholder:text-slate-700"
                      disabled={accion.realizoAccion === 'No' || accion.aprobo !== 'Sí'}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveAccion(index)}
                    className="p-3.5 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl self-end shrink-0 transition-all border border-transparent hover:border-rose-500/20 active:scale-90"
                    title="Eliminar registro"
                  >
                    <Trash2 size={22} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-10 border-t border-white/5">
          <div className="flex flex-col bg-white/5 p-8 md:p-10 rounded-[2.5rem] border border-white/5 transition-all hover:bg-white/10 hover:shadow-2xl group">
            <div className="flex flex-col items-center justify-center mb-6 text-center gap-4">
              <div className="bg-blue-600/10 p-6 rounded-[2rem] text-blue-500 shadow-sm border border-blue-500/20 transition-transform group-hover:scale-110 duration-500">
                <PencilLine size={40} strokeWidth={2.5} />
              </div>
              <label className="block text-xl font-black text-white uppercase tracking-tight leading-tight max-w-[90%] font-headings">
                INTERVENCIONES PEDAGÓGICAS<br/>IMPLEMENTADAS
              </label>
              <div className="bg-blue-600 text-white px-8 py-2.5 rounded-full shadow-xl shadow-blue-900/20 uppercase text-[10px] font-black tracking-[0.3em] mt-2 flex items-center justify-center min-w-[200px]">
                {countLines(formData.estrategias)} ESTRATEGIAS
              </div>
            </div>
            
            <div className="flex justify-center mb-6">
              <div className="bg-blue-600/10 text-blue-400 px-8 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-wider border border-blue-500/20 shadow-sm text-center max-w-[92%] leading-relaxed">
                Describa las estrategias pedagógicas implementadas para el fortalecimiento de los aprendizajes.
              </div>
            </div>

            <textarea
              name="estrategias"
              value={formData.estrategias}
              onChange={handleInputChange}
              rows={6}
              className="w-full bg-black/40 border-2 border-white/5 px-6 py-6 text-white focus:outline-none focus:ring-8 focus:ring-blue-600/5 focus:border-blue-500 focus:bg-black/60 transition-all resize-y custom-scrollbar rounded-3xl text-sm font-bold placeholder:text-slate-700 shadow-inner uppercase tracking-wide"
              placeholder="DESCRIBA AQUÍ LAS INTERVENCIONES..."
            />
          </div>

          <div className="flex flex-col bg-white/5 p-8 md:p-10 rounded-[2.5rem] border border-white/5 transition-all hover:bg-white/10 hover:shadow-2xl group">
            <div className="flex flex-col items-center justify-center mb-6 text-center gap-4">
              <div className="bg-indigo-600/10 p-6 rounded-[2rem] text-indigo-500 shadow-sm border border-indigo-500/20 transition-transform group-hover:scale-110 duration-500">
                <BrainCircuit size={40} strokeWidth={2.5} />
              </div>
              <label className="block text-xl font-black text-white uppercase tracking-tight leading-tight max-w-[90%] font-headings">
                CARACTERIZACIÓN DE BARRERAS<br/>PARA EL APRENDIZAJE
              </label>
              <div className="bg-blue-600 text-white px-8 py-2.5 rounded-full shadow-xl shadow-blue-900/20 uppercase text-[10px] font-black tracking-[0.3em] mt-2 flex items-center justify-center min-w-[200px]">
                {formData.barreras.length} BARRERAS
              </div>
            </div>

            <div className="flex justify-center mb-6">
              <div className="bg-blue-600/10 text-blue-400 px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider border-2 border-blue-500/20 shadow-sm text-center max-w-[90%] font-headings leading-relaxed">
                Identifique los factores que limitan el acceso o progreso en el aprendizaje según el diagnóstico de aula.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
              {BARRERAS.map((barrera) => {
                const isSelected = (formData.barreras || []).includes(barrera);
                return (
                  <label 
                    key={barrera} 
                    className={`flex items-start gap-4 p-5 rounded-2xl border transition-all duration-500 cursor-pointer group shadow-lg ${
                      isSelected 
                        ? 'bg-blue-600 border-blue-400 shadow-blue-900/40 translate-y-[-2px]' 
                        : 'bg-black/40 border-white/5 hover:border-blue-500/40 hover:bg-black/60'
                    }`}
                  >
                    <div className="relative flex items-center justify-center pt-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleCheckboxChange(barrera)}
                        className="sr-only"
                      />
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-500 ${
                        isSelected 
                          ? 'bg-white border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)]' 
                          : 'bg-transparent border-white/20 group-hover:border-blue-400'
                      }`}>
                        {isSelected && <CheckCircle2 size={14} className="text-blue-600" strokeWidth={4} />}
                      </div>
                    </div>
                    <span className={`text-[11px] leading-tight font-black transition-colors duration-500 uppercase tracking-tight ${
                      isSelected ? 'text-white' : 'text-slate-400 group-hover:text-white'
                    }`}>
                      {barrera}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-8 mt-4 border-t border-white/5 flex flex-col sm:flex-row justify-end gap-4">
          <button
            type="button"
            onClick={generarActaCortePreventivo}
            disabled={!formData.docente || !formData.grado || !formData.area || cleanList(formData.estudiantesPreventivo).length === 0}
            className="flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-[#D4AF37] font-black py-4 px-10 rounded-2xl transition-all border border-[#D4AF37]/20 disabled:opacity-20 uppercase text-[10px] tracking-[0.2em]"
          >
            <FileOutput size={20} />
            GENERAR ACTA CORTE PREVENTIVO
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-12 rounded-2xl transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 active:scale-95 uppercase text-[11px] tracking-[0.2em] border border-blue-400/20"
          >
            {loading ? (
              <RefreshCw className="animate-spin" size={20} />
            ) : (
              <CloudUpload size={22} />
            )}
            {existingReportId ? 'SINCRONIZAR Y ACTUALIZAR REPORTE' : 'SINCRONIZAR Y FORMALIZAR REPORTE'}
          </button>
        </div>
      </form>
      </div>

      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        }}
      />

      {isPromptModalOpen && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[9999] p-4 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="bg-[#1A1A1A] rounded-[3rem] shadow-[0_40px_100px_-15px_rgba(0,0,0,0.8)] max-w-xl w-full overflow-hidden border border-white/10 animate-in zoom-in-95 duration-500">
            <div className="bg-[#0A1128] px-10 py-12 text-white relative">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
               <p className="text-[#D4AF37] text-[9px] font-black tracking-[0.4em] uppercase mb-3 opacity-100 drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]">Protocolo de Configuración</p>
               <h3 className="text-2xl font-black tracking-tighter uppercase leading-tight font-headings">INSTITUCIÓN EDUCATIVA FERMÍN TILANO</h3>
            </div>
            <form onSubmit={handlePromptSubmit} className="p-10">
              <div className="mb-10">
                <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-[0.1em]">
                  {promptMessage}
                </label>
                <input
                  type="text"
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  className="executive-input w-full px-6 py-5 text-sm font-bold uppercase tracking-tight"
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsPromptModalOpen(false);
                    setPromptValue('');
                  }}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-black text-[10px] tracking-[0.3em] rounded-2xl transition-all uppercase border border-white/10"
                >
                  ABORTAR
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] tracking-[0.3em] rounded-2xl transition-all uppercase shadow-lg shadow-blue-900/20"
                >
                  CONFIRMAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MessageModal
        isOpen={isMessageModalOpen}
        type={modalType}
        message={modalMessage}
        onClose={() => setIsMessageModalOpen(false)}
      />

      <ConfirmModal
        isOpen={isConfirmOpen}
        message={confirmMessage}
        onConfirm={() => {
          setIsConfirmOpen(false);
          if (onConfirm) onConfirm();
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
