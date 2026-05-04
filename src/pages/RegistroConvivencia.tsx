import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, addDoc, updateDoc, doc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { PERIODOS, GRADOS, DOCENTES } from '../lib/constants';
import { Download, Plus, Save, Trash2, Search, CheckCircle2, AlertCircle, RefreshCw, FileOutput, Users, Edit2, Eye } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGO_BASE64 } from '../lib/logo';
import { useCustomLists } from '../hooks/useCustomLists';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS, getPerfectTableStyles } from '../lib/pdfUtils';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useNotification } from '../context/NotificationContext';

interface EstudianteActa {
  nombre: string;
  tipo1: number;
  tipo2: number;
  tipo3: number;
  grado: string;
  fecha?: string;
  driveUrl?: string;
}

interface ActaConvivencia {
  id?: string;
  periodo: string;
  fecha: string;
  docente: string;
  grado: string;
  area: string;
  estudiantes: EstudianteActa[];
  driveUrl?: string;
  authorUid?: string;
}

import { PasswordModal } from '../components/PasswordModal';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';

export function RegistroConvivencia() {
  const { notify } = useNotification();
  const { docentes: customDocentes, areas: customAreas, addDocente, removeDocente, addArea, removeArea } = useCustomLists();

  const [actas, setActas] = useState<ActaConvivencia[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    periodo: 'I',
    fecha: new Date().toISOString().split('T')[0],
    docente: '',
    grado: '',
    area: ''
  });
  
  const [estudiantes, setEstudiantes] = useState<EstudianteActa[]>([]);
  const [nuevoEstudiante, setNuevoEstudiante] = useState('');
  const [nuevoEstudianteGrado, setNuevoEstudianteGrado] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempActas, setTempActas] = useState({ tipo1: 0, tipo2: 0, tipo3: 0, driveUrl: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [filtroGrado, setFiltroGrado] = useState('');

  const handleAddEstudiante = () => {
    if (!nuevoEstudiante.trim()) {
      setMessage({ type: 'error', text: 'El nombre del estudiante es obligatorio' });
      return;
    }
    
    // Add student immediately so they appear in the list
    const studentData = { 
      nombre: nuevoEstudiante.trim().toUpperCase(), 
      tipo1: 0, 
      tipo2: 0, 
      tipo3: 0,
      grado: formData.grado || 'S/G',
      driveUrl: ''
    };
    
    const newEstudiantes = [...estudiantes, studentData];
    setEstudiantes(newEstudiantes);
    
    // Set up editing for the newly added student
    const newIndex = newEstudiantes.length - 1;
    setEditingIndex(newIndex);
    setTempActas({ tipo1: 0, tipo2: 0, tipo3: 0, driveUrl: '' });
    setIsAdding(true);
    
    setNuevoEstudiante('');
    setMessage({ type: 'success', text: 'Estudiante añadido. Ahora tipifique las faltas en el panel de reporte.' });
  };

  const saveEstudiante = () => {
    if (editingIndex !== null) {
      const updated = [...estudiantes];
      updated[editingIndex] = {
        ...updated[editingIndex],
        ...tempActas
      };
      setEstudiantes(updated);
    }
    
    setIsAdding(false);
    setEditingIndex(null);
    setMessage({ type: 'success', text: 'Registro actualizado correctamente' });
  };

  const cancelEstudiante = () => {
    // If we were adding a new one (it's the last one and has 0,0,0) maybe? 
    // Actually, if we just added it in handleAddEstudiante, and user cancels, 
    // maybe we stay as is but close the panel.
    setIsAdding(false);
    setEditingIndex(null);
  };

  const handleEdit = (index: number) => {
    const est = estudiantes[index];
    setTempActas({ tipo1: est.tipo1, tipo2: est.tipo2, tipo3: est.tipo3, driveUrl: est.driveUrl || '' });
    setEditingIndex(index);
    setIsAdding(true);
  };

  const deleteEstudiante = (index: number) => {
    setEstudiantes(estudiantes.filter((_, i) => i !== index));
  };
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'warning'>('success');
  const [modalMessage, setModalMessage] = useState('');

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

  const previewData = useMemo(() => {
    let filtered = actas;
    if (filtroPeriodo) filtered = filtered.filter(a => a.periodo === filtroPeriodo);
    if (filtroGrado) filtered = filtered.filter(a => a.grado === filtroGrado);

    const studentsMap = new Map<string, {
      nombre: string;
      tipo1: number;
      tipo2: number;
      tipo3: number;
      driveUrl: string;
    }>();

    filtered.forEach(acta => {
      acta.estudiantes.forEach(est => {
        if (est.tipo1 > 0 || est.tipo2 > 0 || est.tipo3 > 0) {
          if (!studentsMap.has(est.nombre)) {
            studentsMap.set(est.nombre, { nombre: est.nombre, tipo1: 0, tipo2: 0, tipo3: 0, driveUrl: est.driveUrl || '' });
          }
          const current = studentsMap.get(est.nombre)!;
          current.tipo1 += est.tipo1;
          current.tipo2 += est.tipo2;
          current.tipo3 += est.tipo3;
          if (est.driveUrl) current.driveUrl = est.driveUrl;
        }
      });
    });

    return Array.from(studentsMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [actas, filtroPeriodo, filtroGrado]);

  const fetchData = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'actas_convivencia'));
      const snapshot = await getDocs(q);
      const data: ActaConvivencia[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      } as ActaConvivencia));
      setActas(data);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'actas_convivencia');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddDocente = () => {
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
    if (formData.docente && customDocentes.includes(formData.docente)) {
      setPendingAction(() => () => {
        removeDocente(formData.docente);
        setFormData(prev => ({ ...prev, docente: '' }));
      });
      setIsPasswordModalOpen(true);
    }
  };

  const handleAddArea = () => {
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
    if (formData.area && customAreas.includes(formData.area)) {
      setPendingAction(() => () => {
        removeArea(formData.area);
        setFormData(prev => ({ ...prev, area: '' }));
      });
      setIsPasswordModalOpen(true);
    }
  };

  const agregarEstudiante = () => {
    if (nuevoEstudiante.trim()) {
      const estudianteData = { 
        nombre: nuevoEstudiante.trim().toUpperCase(), 
        tipo1: 0, 
        tipo2: 0, 
        tipo3: 0,
        grado: nuevoEstudianteGrado || formData.grado,
        driveUrl: ''
      };

      if (editingIndex !== null) {
        setEstudiantes(prev => {
          const updated = [...prev];
          updated[editingIndex] = { ...updated[editingIndex], ...estudianteData };
          return updated;
        });
        setEditingIndex(null);
      } else {
        setEstudiantes(prev => [...prev, estudianteData]);
      }
      
      setNuevoEstudiante('');
      setNuevoEstudianteGrado('');
    }
  };

  const handleEditEstudiante = (index: number) => {
    const est = estudiantes[index];
    setNuevoEstudiante(est.nombre);
    setNuevoEstudianteGrado((est as any).grado || '');
    setEditingIndex(index);
    // Scroll to input
    document.getElementById('student-input-container')?.scrollIntoView({ behavior: 'smooth' });
  };

  const actualizarActa = (index: number, tipo: 'tipo1' | 'tipo2' | 'tipo3', valor: number) => {
    setEstudiantes(prev => {
      const newEstudiantes = [...prev];
      newEstudiantes[index] = { ...newEstudiantes[index], [tipo]: Math.max(0, valor) };
      return newEstudiantes;
    });
  };

  const eliminarEstudiante = (index: number) => {
    setEstudiantes(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || estudiantes.length === 0) {
      setMessage({ type: 'error', text: 'Debe agregar al menos un estudiante.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const actaData = {
        periodo: formData.periodo,
        fecha: formData.fecha,
        docente: formData.docente,
        grado: formData.grado,
        area: formData.area,
        estudiantes: estudiantes,
        authorUid: auth.currentUser.uid,
        authorEmail: auth.currentUser.email || '',
        updatedAt: serverTimestamp()
      };

      // Check if exists for same period, date, docente, grado, area
      const existing = actas.find(a => 
        a.periodo === formData.periodo && 
        a.fecha === formData.fecha &&
        a.docente === formData.docente && 
        a.grado === formData.grado && 
        a.area === formData.area
      );

      if (existing && existing.id) {
        await updateDoc(doc(db, 'actas_convivencia', existing.id), actaData);
        await fetchData();
        setModalType('success');
        setModalMessage('REGISTRO DE ACTAS ACTUALIZADO CORRECTAMENTE.');
        setIsMessageModalOpen(true);
      } else {
        await addDoc(collection(db, 'actas_convivencia'), {
          ...actaData,
          createdAt: serverTimestamp()
        });
        await fetchData();
        setModalType('success');
        setModalMessage('REGISTRO DE ACTAS CREADO CORRECTAMENTE.');
        setIsMessageModalOpen(true);
      }
      
      setEstudiantes([]);
      setFormData(prev => ({ ...prev, docente: '', grado: '', area: '' }));
    } catch (error: any) {
      console.error("Error saving actas:", error);
      const existing = actas.find(a => 
        a.periodo === formData.periodo && 
        a.fecha === formData.fecha &&
        a.docente === formData.docente && 
        a.grado === formData.grado && 
        a.area === formData.area
      );
      const operation = (existing && existing.id) ? OperationType.UPDATE : OperationType.CREATE;
      const path = (existing && existing.id) ? `actas_convivencia/${existing.id}` : 'actas_convivencia';
      
      try {
        handleFirestoreError(error, operation, path);
      } catch (jsonErr: any) {
        setModalType('error');
        setModalMessage('ERROR DE SEGURIDAD: NO TIENE PERMISOS PARA REGISTRAR ACTAS DE CONVIVENCIA.');
        setIsMessageModalOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setConfirmMessage("¿ESTÁ SEGURO DE ELIMINAR TODOS LOS REGISTROS DE CONVIVENCIA? ESTA ACCIÓN ES IRREVERSIBLE.");
    setOnConfirm(() => async () => {
      try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, 'actas_convivencia'));
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        await fetchData();
        setLoading(false);
        setModalType('success');
        setModalMessage('TODOS LOS REGISTROS HAN SIDO ELIMINADOS.');
        setIsMessageModalOpen(true);
      } catch (err: any) {
        console.error("Error deleting all documents:", err);
        try {
          handleFirestoreError(err, OperationType.DELETE, 'actas_convivencia');
        } catch (jsonErr: any) {
          setModalType('error');
          setModalMessage('ERROR DE PERMISOS: SOLO EL ADMINISTRADOR PUEDE REALIZAR ELIMINACIONES MASIVAS.');
          setIsMessageModalOpen(true);
        }
        setLoading(false);
      }
    });

    setPendingAction(() => () => {
      setIsConfirmOpen(true);
    });
    setIsPasswordModalOpen(true);
  };

  const exportToPDF = () => {
    let filtered = actas;
    if (filtroPeriodo) filtered = filtered.filter(a => a.periodo === filtroPeriodo);
    if (filtroGrado) filtered = filtered.filter(a => a.grado === filtroGrado);

    if (filtered.length === 0) {
      setModalType('warning');
      setModalMessage('NO SE PUEDE DESCARGAR EL DOCUMENTO PORQUE NO HAY DATOS QUE MOSTRAR.');
      setIsMessageModalOpen(true);
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    const docTitle = "REGISTRO DE ACTAS DE CONVIVENCIA";
    const metaInfo = `PERIODO: ${filtroPeriodo || 'TODOS'}   |   GRADO: ${filtroGrado || 'TODOS'}`;
    const startY = drawExecutiveHeader(doc, docTitle, INTRO_TEXTS.REGISTRO_CONVIVENCIA, metaInfo);

    let currentY = startY;

    const studentsGrouped = new Map<string, {
      nombre: string;
      grado: string;
      periodo: string;
      reports: { docente: string; t1: number; t2: number; t3: number }[];
      totalT1: number;
      totalT2: number;
      totalT3: number;
      driveUrl: string;
    }>();

    const reportingTeachers = new Set<string>();

    filtered.forEach(acta => {
      reportingTeachers.add(acta.docente.toUpperCase().trim());
      acta.estudiantes.forEach(est => {
        const studentKey = `${est.nombre.toUpperCase().trim()}-${acta.grado}-${acta.periodo}`;
        if (!studentsGrouped.has(studentKey)) {
          studentsGrouped.set(studentKey, {
            nombre: est.nombre.toUpperCase().trim(),
            grado: acta.grado,
            periodo: acta.periodo,
            reports: [],
            totalT1: 0,
            totalT2: 0,
            totalT3: 0,
            driveUrl: est.driveUrl || ''
          });
        }
        const group = studentsGrouped.get(studentKey)!;
        if (est.driveUrl) group.driveUrl = est.driveUrl;
        
        let teacherReport = group.reports.find(r => r.docente === acta.docente.toUpperCase().trim());
        if (!teacherReport) {
          teacherReport = { docente: acta.docente.toUpperCase().trim(), t1: 0, t2: 0, t3: 0 };
          group.reports.push(teacherReport);
        }
        teacherReport.t1 += est.tipo1;
        teacherReport.t2 += est.tipo2;
        teacherReport.t3 += est.tipo3;
        
        group.totalT1 += est.tipo1;
        group.totalT2 += est.tipo2;
        group.totalT3 += est.tipo3;
      });
    });

    const sortedStudents = Array.from(studentsGrouped.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    const tableData: any[] = [];
    sortedStudents.forEach(student => {
      const studentGrandTotal = student.totalT1 + student.totalT2 + student.totalT3;
      
      student.reports.sort((a, b) => a.docente.localeCompare(b.docente)).forEach((rep, index) => {
        tableData.push([
          index === 0 ? { content: student.nombre, styles: { fontStyle: 'bold' } } : '',
          index === 0 ? student.periodo : '',
          index === 0 ? student.grado : '',
          rep.docente,
          rep.t1 || '-',
          rep.t2 || '-',
          rep.t3 || '-',
          index === 0 ? { content: studentGrandTotal.toString(), styles: { fontStyle: 'bold' } } : '',
          index === 0 ? (student.driveUrl || 'N/A') : ''
        ]);
      });
    });

    autoTable(doc, {
      startY: currentY,
      head: [['ESTUDIANTE', 'PERIODO', 'GRADO', 'DOCENTE REPORTE', 'TIPO I', 'TIPO II', 'TIPO III', 'TOTAL', 'DRIVE URL']],
      body: tableData,
      ...getPerfectTableStyles(),
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: 12, halign: 'center' },
        7: { cellWidth: 12, halign: 'center' },
        8: { cellWidth: 30, fontSize: 6 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // --- SIGNATURES START ---
    let signatureY = currentY + 15;
    const pageWidthS = doc.internal.pageSize.width;

    if (signatureY > pageHeight - 80) {
      doc.addPage();
      signatureY = 40;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

    const directorX = pageWidthS / 2;
    
    // Rector
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.line(directorX - 40, signatureY + 15, directorX + 40, signatureY + 15);
    doc.text("MANUEL MALDONADO", directorX, signatureY + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("RECTOR INSTITUCIONAL", directorX, signatureY + 25, { align: "center" });

    // Dynamic Team
    signatureY += 35;
    if (signatureY > pageHeight - 50) {
      doc.addPage();
      signatureY = 40;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("EQUIPO DINAMIZADOR (DOCENTES):", PDF_MARGIN, signatureY);
    signatureY += 15;

    const allTeachersListActa = Array.from(reportingTeachers).sort();
    const sigColsC = 2;
    const sigLineWC = 60;
    const sigSpacingXC = (pageWidthS - 2 * PDF_MARGIN - sigColsC * sigLineWC) / (sigColsC - 1);
    const sigRowHeightC = 30;
    let sigCurrentYC = signatureY;

    for (let i = 0; i < allTeachersListActa.length; i++) {
        const col = i % sigColsC;
        if (col === 0 && sigCurrentYC > pageHeight - 35) {
            doc.addPage();
            sigCurrentYC = 40;
        }
        const x = PDF_MARGIN + col * (sigLineWC + sigSpacingXC);
        const y = sigCurrentYC;
        doc.line(x, y, x + sigLineWC, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(allTeachersListActa[i].toUpperCase(), x + sigLineWC / 2, y + 4, { align: 'center' });
        if (col === sigColsC - 1 || i === allTeachersListActa.length - 1) {
            sigCurrentYC += sigRowHeightC;
        }
    }
    // --- SIGNATURES END ---

    const pc = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pc; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pc);
    }

    doc.save(`Actas_Convivencia_${filtroPeriodo || 'Todos'}_${filtroGrado || 'Todos'}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-6xl mx-auto">
      <PageHeader 
        title="REGISTROS DE ACTAS DE CONVIVENCIA"
        description="Seguimiento sistemático de compromisos y mediaciones pedagógicas. Garantía del debido proceso y la armonía en la convivencia institucional."
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

      <div className="bg-[#1e1e1e] rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden group relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none group-hover:bg-blue-600/10 transition-colors duration-1000" />
        <div className="p-8 md:p-10 border-b border-white/5 bg-black/20 flex justify-between items-center relative z-10">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight uppercase italic">REGISTROS DE ACTAS DE CONVIVENCIA</h2>
            <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest mt-2">Seguimiento sistemático de compromisos y mediaciones pedagógicas. Garantía del debido proceso y la armonía en la convivencia institucional.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-10 space-y-10 relative z-10">
          {message && (
            <div className={`p-6 rounded-2xl flex items-start gap-4 border shadow-2xl animate-in slide-in-from-top-4 ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="shrink-0" size={24} /> : <AlertCircle className="shrink-0" size={24} />}
              <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed">{message.text}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Periodo Académico *</label>
              <select
                name="periodo"
                value={formData.periodo}
                onChange={handleInputChange}
                required
                className="executive-input w-full"
              >
                {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">PERIODO {p}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Fecha del Registro *</label>
              <input
                type="date"
                name="fecha"
                value={formData.fecha}
                onChange={handleInputChange}
                required
                className="executive-input w-full cursor-pointer"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Docente Registrante *</label>
              <div className="flex gap-3">
                <select
                  name="docente"
                  value={formData.docente}
                  onChange={handleInputChange}
                  required
                  className="executive-input w-full"
                >
                  <option value="" className="bg-[#1A1A1A]">SELECCIONE</option>
                  {[...customDocentes].sort().map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d}</option>)}
                </select>
                <button
                  type="button"
                  onClick={handleAddDocente}
                  className="bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white p-4 rounded-2xl border border-blue-600/20 transition-all shadow-xl active:scale-90"
                  title="Añadir nuevo docente"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Grado / Nivel *</label>
              <select
                name="grado"
                value={formData.grado}
                onChange={handleInputChange}
                required
                className="executive-input w-full"
              >
                <option value="" className="bg-[#1A1A1A]">SELECCIONE</option>
                {GRADOS.map(g => <option key={g} value={g} className="bg-[#1A1A1A]">{g}</option>)}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Área / Asignatura Académica *</label>
              <div className="flex gap-3">
                <select
                  name="area"
                  value={formData.area}
                  onChange={handleInputChange}
                  required
                  className="executive-input w-full"
                >
                  <option value="" className="bg-[#1A1A1A]">SELECCIONE</option>
                  {customAreas.map(a => <option key={a} value={a} className="bg-[#1A1A1A]">{a}</option>)}
                </select>
                <button
                  type="button"
                  onClick={handleAddArea}
                  className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white p-4 rounded-2xl border border-emerald-600/20 transition-all shadow-xl active:scale-90"
                  title="Añadir nueva área"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-12">
            <div className="flex flex-col lg:flex-row gap-8 mb-10">
              <div className="flex-1 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-[#D4AF37] rounded-full"></div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Añadir Estudiante</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 bg-black/40 p-10 rounded-[3rem] border border-white/10 relative group shadow-2xl">
                  <div className="absolute inset-0 bg-blue-500/[0.03] opacity-0 group-focus-within:opacity-100 transition-opacity rounded-[3rem] pointer-events-none"></div>
                  
                  <div className="md:col-span-12 relative z-10">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 px-2 italic">Nombre Completo del Estudiante:</label>
                    <input
                      type="text"
                      value={nuevoEstudiante}
                      onChange={(e) => setNuevoEstudiante(e.target.value)}
                      placeholder="ESCRIBA EL NOMBRE COMPLETO AQUÍ..."
                      className="executive-input w-full md:text-base py-5 px-8"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddEstudiante}
                  className="w-full py-5 bg-[#D4AF37] hover:bg-[#B8860B] text-black font-black text-[12px] tracking-[0.3em] rounded-2xl transition-all uppercase shadow-[0_15px_40px_-10px_rgba(212,175,55,0.3)] active:scale-[0.98] flex items-center justify-center gap-4"
                >
                  <Plus size={20} strokeWidth={3} /> AÑADIR ESTUDIANTE
                </button>
              </div>

              {isAdding && (
                <div className="w-full lg:w-[480px] p-8 bg-blue-600/5 rounded-[2.5rem] border border-blue-500/20 space-y-6 animate-in slide-in-from-right-8 duration-500 shadow-[0_30px_60px_-20px_rgba(37,99,235,0.2)] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-colors"></div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center border border-blue-500/30 text-blue-400">
                        <Users size={20} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-[0.3em]">{editingIndex !== null ? 'MODIFICACIÓN' : 'NUEVO INGRESO'}</span>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider max-w-[240px] truncate">{nuevoEstudiante || 'SIN NOMBRE'}</h4>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-col items-center p-4 bg-white/5 rounded-2xl border border-white/5 group/input">
                        <label className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-2">TIPO I</label>
                        <input
                          type="number"
                          min="0"
                          value={tempActas.tipo1}
                          onChange={(e) => setTempActas({...tempActas, tipo1: parseInt(e.target.value) || 0})}
                          className="bg-transparent border-none text-xl font-black text-white text-center w-full focus:ring-0 outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                       <div className="flex flex-col items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                        <label className="block text-[8px] font-black text-amber-500 uppercase tracking-widest mb-2">TIPO II</label>
                        <input
                          type="number"
                          min="0"
                          value={tempActas.tipo2}
                          onChange={(e) => setTempActas({...tempActas, tipo2: parseInt(e.target.value) || 0})}
                          className="bg-transparent border-none text-xl font-black text-white text-center w-full focus:ring-0 outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                       <div className="flex flex-col items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                        <label className="block text-[8px] font-black text-rose-500 uppercase tracking-widest mb-2">TIPO III</label>
                        <input
                          type="number"
                          min="0"
                          value={tempActas.tipo3}
                          onChange={(e) => setTempActas({...tempActas, tipo3: parseInt(e.target.value) || 0})}
                          className="bg-transparent border-none text-xl font-black text-white text-center w-full focus:ring-0 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-2 ml-2">URL Drive Acta Individual (Opcional)</label>
                    <div className="flex flex-col gap-3">
                      <input
                        type="url"
                        value={tempActas.driveUrl}
                        onChange={(e) => setTempActas({...tempActas, driveUrl: e.target.value})}
                        placeholder="https://drive.google.com/..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-blue-500 transition-colors"
                      />
                      {tempActas.driveUrl && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => window.open(tempActas.driveUrl, '_blank')}
                            className="flex-1 py-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-blue-500/20"
                          >
                            <Eye size={12} /> Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(tempActas.driveUrl, '_blank')}
                            className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-emerald-500/20"
                          >
                            <Download size={12} /> Descargar
                          </button>
                          <button
                            type="button"
                            onClick={() => setTempActas({...tempActas, driveUrl: ''})}
                            className="flex-1 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-rose-500/20"
                          >
                            <Trash2 size={12} /> Borrar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <button
                      type="button"
                      onClick={saveEstudiante}
                      className="py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] tracking-widest rounded-xl transition-all uppercase flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={16} /> Confirmar Reporte
                    </button>
                    <button
                      type="button"
                      onClick={cancelEstudiante}
                      className="py-4 bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white font-black text-[11px] tracking-widest rounded-xl transition-all uppercase"
                    >
                      Cerrar Panel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {estudiantes.length > 0 ? (
              <div className="overflow-x-auto rounded-[2.5rem] border border-white/5 shadow-2xl bg-black/40 overflow-hidden backdrop-blur-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th className="py-6 px-10 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">RESUMEN DE REGISTRO ACTUAL</th>
                      <th className="py-6 px-4 text-[10px] font-black text-blue-500/80 uppercase tracking-widest text-center">Tipo I</th>
                      <th className="py-6 px-4 text-[10px] font-black text-amber-500/80 uppercase tracking-widest text-center">Tipo II</th>
                      <th className="py-6 px-4 text-[10px] font-black text-rose-500/80 uppercase tracking-widest text-center">Tipo III</th>
                      <th className="py-6 px-10 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Comandos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {estudiantes.map((est, index) => (
                      <tr key={index} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-5 px-10">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white uppercase tracking-tight group-hover:text-blue-400 transition-colors">{est.nombre}</span>
                            <span className="text-[9px] font-black text-slate-500 mt-1 uppercase tracking-widest">Grado: {est.grado}</span>
                          </div>
                        </td>
                        <td className="py-5 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-black text-blue-400">
                             {est.tipo1}
                          </span>
                        </td>
                        <td className="py-5 px-4 text-center">
                           <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-black text-amber-500">
                             {est.tipo2}
                          </span>
                        </td>
                        <td className="py-5 px-4 text-center text-rose-500">
                           <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-black text-rose-500">
                             {est.tipo3}
                          </span>
                        </td>
                        <td className="py-5 px-10 text-right">
                          <div className="flex items-center justify-end gap-3 transition-all">
                            {est.driveUrl && (
                               <div className="flex gap-2 mr-2">
                                 <button 
                                   type="button"
                                   onClick={() => window.open(est.driveUrl, '_blank')}
                                   className="text-blue-400 hover:text-white p-2.5 bg-blue-500/10 rounded-xl hover:bg-blue-600 transition-all border border-blue-500/20 shadow-lg flex items-center justify-center"
                                   title="Ver documento"
                                 >
                                   <Eye size={12} strokeWidth={3} />
                                 </button>
                                 <button 
                                   type="button"
                                   onClick={() => window.open(est.driveUrl, '_blank')}
                                   className="text-emerald-400 hover:text-white p-2.5 bg-emerald-500/10 rounded-xl hover:bg-emerald-600 transition-all border border-emerald-500/20 shadow-lg flex items-center justify-center"
                                   title="Descargar documento"
                                 >
                                   <Download size={12} strokeWidth={3} />
                                 </button>
                                 <button 
                                   type="button"
                                   onClick={() => {
                                     const updated = [...estudiantes];
                                     updated[index] = { ...updated[index], driveUrl: '' };
                                     setEstudiantes(updated);
                                   }}
                                   className="text-rose-400 hover:text-white p-2.5 bg-rose-500/10 rounded-xl hover:bg-rose-600 transition-all border border-rose-500/20 shadow-lg flex items-center justify-center"
                                   title="Borrar URL"
                                 >
                                   <Trash2 size={12} strokeWidth={3} />
                                 </button>
                               </div>
                            )}
                            <button 
                              type="button" 
                              onClick={() => handleEdit(index)} 
                              className="text-white bg-blue-600 hover:bg-blue-700 p-2.5 rounded-xl transition-all border border-blue-500/20 shadow-lg flex items-center gap-1.5 px-3"
                              title="Modificar registro"
                            >
                              <Edit2 size={14} strokeWidth={3} />
                              <span className="text-[9px] font-black uppercase">Editar</span>
                            </button>
                            <button 
                              type="button" 
                              onClick={() => deleteEstudiante(index)} 
                              className="text-white bg-rose-600 hover:bg-rose-700 p-2.5 rounded-xl transition-all border border-rose-500/20 shadow-lg flex items-center gap-1.5 px-3"
                              title="Remover de la lista"
                            >
                              <Trash2 size={14} strokeWidth={3} />
                              <span className="text-[9px] font-black uppercase">Borrar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
               <div className="py-24 text-center bg-black/40 rounded-[3rem] border border-dashed border-white/5 shadow-inner">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="text-slate-700" size={32} />
                  </div>
                  <h4 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.4em] mb-2 leading-none">Esperando Registros</h4>
                  <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest italic">Añada estudiantes arriba para comenzar la captura de datos</p>
               </div>
            )}
          </div>

          <div className="flex justify-end pt-12">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-12 rounded-2xl flex items-center gap-4 transition-all shadow-2xl shadow-blue-900/40 uppercase text-[12px] tracking-[0.2em] transform hover:-translate-y-1 active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={24} /> : <Save size={24} />}
              {loading ? 'SINCRONIZANDO...' : 'GUARDAR INFORMACIÓN'}
            </button>
          </div>
        </form>
      </div>

      {/* Export Section */}
      <div className="bg-[#1e1e1e] p-10 rounded-[2.5rem] shadow-2xl border border-white/5 group relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-600/5 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none group-hover:bg-emerald-600/10 transition-colors duration-1000" />
        <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic mb-10 flex items-center gap-4 relative z-10">
          <FileOutput className="text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" size={32}/> 
          Generación de Reportes Periódicos
        </h3>
        <div className="flex flex-col lg:flex-row gap-8 items-end mb-12 bg-black/30 p-8 rounded-[2rem] border border-white/5 relative z-10">
           <div className="flex-1 w-full relative">
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Filtrar por Periodo</label>
              <select
                value={filtroPeriodo}
                onChange={(e) => setFiltroPeriodo(e.target.value)}
                className="executive-input w-full"
              >
                <option value="" className="bg-[#1A1A1A]">TODOS LOS PERIODOS</option>
                {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">PERIODO {p}</option>)}
              </select>
            </div>
            <div className="flex-1 w-full relative">
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-2 italic">Segmentar por Grado</label>
              <select
                value={filtroGrado}
                onChange={(e) => setFiltroGrado(e.target.value)}
                className="executive-input w-full"
              >
                <option value="" className="bg-[#1A1A1A]">TODOS LOS GRADOS</option>
                {GRADOS.map(g => <option key={g} value={g} className="bg-[#1A1A1A]">{g}</option>)}
              </select>
            </div>
            <button
              onClick={exportToPDF}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-12 py-5 rounded-2xl transition-all shadow-xl shadow-emerald-900/40 uppercase text-[11px] tracking-widest flex items-center gap-3 active:scale-95 w-full lg:w-auto"
            >
              <Download size={20} />
              EXPORTAR REPORTE
            </button>
          </div>

          {/* Preview Table */}
          {actas.length > 0 ? (
            <div className="border-t border-white/5 pt-12 relative z-10">
              <div className="flex justify-between items-center mb-10">
                <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Bitácora de Reportes DOCENTES</h4>
                <span className="text-[10px] font-black bg-blue-600/20 text-blue-400 px-4 py-2 rounded-full border border-blue-600/20 tracking-[0.2em]">{actas.length} REGISTROS</span>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border border-white/5 shadow-2xl bg-black/20 mb-16">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Periodo</th>
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest">Docente</th>
                      <th className="py-5 px-8 text-[11px] font-black text-blue-400 uppercase tracking-widest text-center">Actas I</th>
                      <th className="py-5 px-8 text-[11px] font-black text-amber-500 uppercase tracking-widest text-center">Actas II</th>
                      <th className="py-5 px-8 text-[11px] font-black text-rose-500 uppercase tracking-widest text-center">Actas III</th>
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...actas].sort((a,b) => b.fecha.localeCompare(a.fecha)).map((acta, idx) => {
                      const totalI = acta.estudiantes.reduce((sum, e) => sum + e.tipo1, 0);
                      const totalII = acta.estudiantes.reduce((sum, e) => sum + e.tipo2, 0);
                      const totalIII = acta.estudiantes.reduce((sum, e) => sum + e.tipo3, 0);
                      
                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="py-4 px-8 text-center">
                            <span className="text-[10px] font-black text-white bg-blue-600/10 px-2.5 py-1 rounded-lg border border-blue-500/20">{acta.periodo}</span>
                          </td>
                          <td className="py-4 px-8">
                            <span className="text-xs font-black text-slate-300 font-mono italic">{acta.fecha}</span>
                          </td>
                          <td className="py-4 px-8">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-200 uppercase tracking-tight italic">{acta.docente}</span>
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">{acta.area}</span>
                            </div>
                          </td>
                          <td className="py-4 px-8 text-center">
                            {totalI > 0 ? <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-black font-mono">{totalI}</span> : <span className="text-slate-800">-</span>}
                          </td>
                          <td className="py-4 px-8 text-center">
                            {totalII > 0 ? <span className="bg-amber-600/20 text-amber-400 px-3 py-1 rounded-full text-[10px] font-black font-mono">{totalII}</span> : <span className="text-slate-800">-</span>}
                          </td>
                          <td className="py-4 px-8 text-center">
                            {totalIII > 0 ? <span className="bg-rose-600/20 text-rose-400 px-3 py-1 rounded-full text-[10px] font-black font-mono">{totalIII}</span> : <span className="text-slate-800">-</span>}
                          </td>
                          <td className="py-4 px-8 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => {
                                  setFormData({
                                    periodo: acta.periodo,
                                    fecha: acta.fecha,
                                    docente: acta.docente,
                                    grado: acta.grado,
                                    area: acta.area
                                  });
                                  setEstudiantes(acta.estudiantes);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                  setMessage({ type: 'success', text: 'REGISTRO CARGADO PARA VISUALIZACIÓN.' });
                                }}
                                className="text-blue-500 hover:text-blue-400 transition-colors p-2"
                                title="Ver reporte"
                              >
                                <Eye size={16} />
                              </button>
                              {acta.driveUrl && (
                                <button 
                                  onClick={() => window.open(acta.driveUrl, '_blank')}
                                  className="text-indigo-500 hover:text-indigo-400 transition-colors p-2"
                                  title="Ver Acta en Drive"
                                >
                                  <Download size={16} />
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  setFormData({
                                    periodo: acta.periodo,
                                    fecha: acta.fecha,
                                    docente: acta.docente,
                                    grado: acta.grado,
                                    area: acta.area
                                  });
                                  setEstudiantes(acta.estudiantes);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                  setMessage({ type: 'success', text: 'REGISTRO CARGADO PARA EDICIÓN.' });
                                }}
                                className="text-emerald-500 hover:text-emerald-400 transition-colors p-2"
                                title="Editar reporte"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  setConfirmMessage('¿ELIMINAR ESTE REGISTRO DE ACTA?');
                                  setOnConfirm(() => async () => {
                                    try {
                                      await deleteDoc(doc(db, 'actas_convivencia', acta.id!));
                                      setActas(prev => prev.filter(a => a.id !== acta.id));
                                      setModalType('success');
                                      setModalMessage('REGISTRO ELIMINADO CORRECTAMENTE.');
                                      setIsMessageModalOpen(true);
                                    } catch (err: any) {
                                      setModalType('error');
                                      setModalMessage('ERROR AL ELIMINAR: ' + err.message);
                                      setIsMessageModalOpen(true);
                                    }
                                  });
                                  setIsConfirmOpen(true);
                                }}
                                className="text-rose-500 hover:text-rose-400 transition-colors p-2"
                                title="Eliminar registro"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Students Bitácora Preview */}
              <div className="flex justify-between items-center mb-10">
                <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Bitácora de Reportes ESTUDIANTES</h4>
                <span className="text-[10px] font-black bg-emerald-600/20 text-emerald-400 px-4 py-2 rounded-full border border-emerald-600/20 tracking-[0.2em]">{previewData.length} ESTUDIANTES</span>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border border-white/5 shadow-2xl bg-black/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Filtro</th>
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest">Estudiante</th>
                      <th className="py-5 px-8 text-[11px] font-black text-blue-400 uppercase tracking-widest text-center">T1</th>
                      <th className="py-5 px-8 text-[11px] font-black text-amber-500 uppercase tracking-widest text-center">T2</th>
                      <th className="py-5 px-8 text-[11px] font-black text-rose-500 uppercase tracking-widest text-center">T3</th>
                      <th className="py-5 px-8 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {previewData.map((est, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 px-8 text-center">
                          <span className="text-[10px] font-black text-white bg-emerald-600/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">{filtroPeriodo || 'TOTAL'}</span>
                        </td>
                        <td className="py-4 px-8">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-200 uppercase tracking-tight italic">{est.nombre}</span>
                            {est.driveUrl && <span className="text-[8px] font-black text-blue-400 tracking-widest mt-0.5">CON ACTA CARGADA</span>}
                          </div>
                        </td>
                        <td className="py-4 px-8 text-center text-blue-400 font-black font-mono text-xs">{est.tipo1 || '-'}</td>
                        <td className="py-4 px-8 text-center text-amber-500 font-black font-mono text-xs">{est.tipo2 || '-'}</td>
                        <td className="py-4 px-8 text-center text-rose-500 font-black font-mono text-xs">{est.tipo3 || '-'}</td>
                        <td className="py-4 px-8 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {est.driveUrl && (
                                <button 
                                  onClick={() => window.open(est.driveUrl, '_blank')}
                                  className="text-blue-400 hover:text-blue-300 transition-colors p-2"
                                  title="Ver Acta"
                                >
                                  <Eye size={16} />
                                </button>
                            )}
                            <button 
                              onClick={() => {
                                setPromptMessage(`Gestionar URL de Acta para ${est.nombre}:`);
                                setPromptValue(est.driveUrl || '');
                                setPromptAction(() => async (newUrl: string) => {
                                  // Find the latest acta for this student in current filter
                                  const relatedActa = [...actas].reverse().find(a => 
                                    a.estudiantes.some(s => s.nombre === est.nombre) &&
                                    (!filtroPeriodo || a.periodo === filtroPeriodo) &&
                                    (!filtroGrado || a.grado === filtroGrado)
                                  );
                                  
                                  if (relatedActa && relatedActa.id) {
                                    const updatedEstudiantes = relatedActa.estudiantes.map(s => 
                                      s.nombre === est.nombre ? { ...s, driveUrl: newUrl } : s
                                    );
                                    try {
                                      await updateDoc(doc(db, 'actas_convivencia', relatedActa.id), { estudiantes: updatedEstudiantes });
                                      setActas(prev => prev.map(a => a.id === relatedActa.id ? { ...a, estudiantes: updatedEstudiantes } : a));
                                      setModalType('success');
                                      setModalMessage('URL DE ACTA ACTUALIZADA.');
                                      setIsMessageModalOpen(true);
                                    } catch (e) {
                                      notify.error("ERROR AL ACTUALIZAR URL");
                                    }
                                  } else {
                                    setModalType('warning');
                                    setModalMessage('NO SE ENCONTRÓ UN ACTA RECIENTE PARA ESTE ESTUDIANTE BAJO LOS FILTROS ACTUALES.');
                                    setIsMessageModalOpen(true);
                                  }
                                });
                                setIsPromptModalOpen(true);
                              }}
                              className="text-emerald-500 hover:text-emerald-400 transition-colors p-2"
                              title={est.driveUrl ? "Editar URL" : "Añadir URL"}
                            >
                              <Edit2 size={16} />
                            </button>
                            {est.driveUrl && (
                              <button 
                                onClick={() => {
                                  setConfirmMessage(`¿ELIMINAR LA URL DE ACTA PARA ${est.nombre}?`);
                                  setOnConfirm(() => async () => {
                                    const relatedActa = actas.find(a => 
                                      a.estudiantes.some(s => s.nombre === est.nombre) &&
                                      (!filtroPeriodo || a.periodo === filtroPeriodo)
                                    );
                                    if (relatedActa && relatedActa.id) {
                                      const updatedEstudiantes = relatedActa.estudiantes.map(s => 
                                        s.nombre === est.nombre ? { ...s, driveUrl: '' } : s
                                      );
                                      await updateDoc(doc(db, 'actas_convivencia', relatedActa.id), { estudiantes: updatedEstudiantes });
                                      setActas(prev => prev.map(a => a.id === relatedActa.id ? { ...a, estudiantes: updatedEstudiantes } : a));
                                      setModalType('success');
                                      setModalMessage('URL DE ACTA ELIMINADA.');
                                      setIsMessageModalOpen(true);
                                    }
                                  });
                                  setIsConfirmOpen(true);
                                }}
                                className="text-rose-500 hover:text-rose-400 transition-colors p-2"
                                title="Borrar URL"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center bg-black/40 rounded-[3rem] border-2 border-dashed border-white/5 relative z-10">
              <AlertCircle className="text-slate-800 mx-auto mb-4" size={48} />
              <p className="text-slate-600 font-black uppercase text-[11px] tracking-[0.4em]">Sin información histórica para estos parámetros</p>
            </div>
          )}
        </div>

      {(auth.currentUser?.email === 'leorozco1970@gmail.com' || true) && (
        <div className="flex justify-end mt-4">
          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <Trash2 size={18} />
            Borrar todos los registros
          </button>
        </div>
      )}

      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
          if (pendingAction) pendingAction();
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

      <ConfirmModal
        isOpen={isConfirmOpen}
        message={confirmMessage}
        onConfirm={() => {
          setIsConfirmOpen(false);
          if (onConfirm) onConfirm();
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />

      <MessageModal
        isOpen={isMessageModalOpen}
        type={modalType}
        message={modalMessage}
        onClose={() => setIsMessageModalOpen(false)}
      />
    </div>
  );
}
