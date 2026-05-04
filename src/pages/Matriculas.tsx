import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, setDoc, doc, addDoc, deleteDoc, serverTimestamp, getDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { GRADOS, DOCENTES } from '../lib/constants';
import { useCustomLists } from '../hooks/useCustomLists';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { 
  Save, 
  Users, 
  Trash2, 
  Search, 
  Edit2,
  Calendar,
  UserMinus,
  RefreshCw,
  BookOpen,
  Upload,
  Download,
  FileDown,
  FileText,
  CheckCircle2,
  Plus,
  X,
  Pencil,
  FileSpreadsheet
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatName } from '../lib/formatter';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';
import { PageHeader } from '../components/PageHeader';
import { useNotification } from '../context/NotificationContext';
import { InstitutionalLoading } from '../components/InstitutionalLoading';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN } from '../lib/pdfUtils';

interface Matricula {
  grado: string;
  totalEstudiantes: number;
}

export function Matriculas({ initialSubTab = 'directorio' }: { initialSubTab?: 'directorio' | 'retirados' }) {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<'directorio' | 'retirados'>(initialSubTab);

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  const [matriculas, setMatriculas] = useState<Record<string, number>>({});
  const [retirados, setRetirados] = useState<any[]>([]);
  const [estudiantesInclusion, setEstudiantesInclusion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Listado States
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [selectedGradoList, setSelectedGradoList] = useState<string>(GRADOS[0]);
  const [bulkInput, setBulkInput] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDocumento, setEditDocumento] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<any>(null);

  // Retired Students Form State
  const [retiredForm, setRetiredForm] = useState({
    nombre: '',
    grado: '',
    fechaRetiro: new Date().toISOString().split('T')[0],
    motivo: '',
    observaciones: ''
  });
  const [editingRetiredId, setEditingRetiredId] = useState<string | null>(null);

  const { docentes: listaDocentes } = useCustomLists();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');

  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [promptAction, setPromptAction] = useState<((val: string) => void) | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [snapMatriculas, snapRetirados, snapInclusion] = await Promise.all([
        getDocs(collection(db, 'matriculas')),
        getDocs(collection(db, 'retirados')),
        getDocs(collection(db, 'estudiantes_inclusion'))
      ]);

      const matriculasData: Record<string, number> = {};
      snapMatriculas.forEach((doc) => {
        matriculasData[doc.id] = doc.data().totalEstudiantes || 0;
      });
      setMatriculas(matriculasData);

      setRetirados(snapRetirados.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setEstudiantesInclusion(snapInclusion.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'matriculas_init_data');
    } finally {
      setLoading(false);
    }
  };

  const fetchEstudiantes = async () => {
    if (activeTab !== 'directorio') return;
    setLoadingList(true);
    try {
      const q = query(collection(db, 'estudiantes'), where('grado', '==', selectedGradoList));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEstudiantes(list.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.GET, 'estudiantes');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchEstudiantes();
  }, [selectedGradoList, activeTab]);

  const handleBulkUpload = async () => {
    if (!bulkInput.trim()) return;
    setLoadingList(true);
    try {
      const { writeBatch, increment } = await import('firebase/firestore');
      const namesAndDocs = bulkInput.split('\n')
        .map(line => {
          // Robust parser: accepts Pipe (|) or Tab (\t) for Excel compatibility
          const parts = line.split(/[|\t]/);
          const nombre = (parts[0] || '').trim().toUpperCase();
          const documento = (parts[1] || '').trim().toUpperCase();
          return { nombre, documento };
        })
        .filter(item => item.nombre.length > 0);

      const chunkSize = 400;
      const collRef = collection(db, 'estudiantes');
      
      for (let i = 0; i < namesAndDocs.length; i += chunkSize) {
        const chunk = namesAndDocs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        
        chunk.forEach(item => {
          const dRef = doc(collRef);
          batch.set(dRef, { 
            nombre: item.nombre,
            documento: item.documento,
            grado: selectedGradoList, 
            createdAt: serverTimestamp() 
          });
        });
        
        await batch.commit();
      }

      const matriculaRef = doc(db, 'matriculas', selectedGradoList);
      await setDoc(matriculaRef, {
        grado: selectedGradoList,
        totalEstudiantes: increment(namesAndDocs.length),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await fetchEstudiantes();
      await fetchData();
      setBulkInput('');
      notify.success(`${namesAndDocs.length} ESTUDIANTES CARGADOS CON ÉXITO.`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'estudiantes');
    } finally {
      setLoadingList(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateDoc(doc(db, 'estudiantes', id), {
        nombre: editName.toUpperCase().trim(),
        documento: editDocumento.trim()
      });
      await fetchEstudiantes();
      setEditingId(null);
      notify.success('ESTUDIANTE ACTUALIZADO.');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `estudiantes/${id}`);
    }
  };

  const executeDeleteEstudiante = async (s: any) => {
    try {
      const { increment } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'estudiantes', s.id));
      
      await addDoc(collection(db, 'retirados'), {
        nombre: s.nombre,
        documento: s.documento || '',
        grado: s.grado,
        fechaRetiro: new Date().toISOString().split('T')[0],
        motivo: 'ELIMINADO DESDE LISTADO',
        createdAt: serverTimestamp()
      });

      const mRef = doc(db, 'matriculas', s.grado);
      await updateDoc(mRef, {
        totalEstudiantes: increment(-1),
        updatedAt: serverTimestamp()
      });

      await fetchEstudiantes();
      await fetchData();
      notify.info(`${s.nombre} ELIMINADO Y TRASLADADO A RETIROS.`);
    } catch (e: any) {
      notify.error('Error al eliminar.');
    }
  };

  const exportStudentsPDF = () => {
    if (estudiantes.length === 0) return;
    
    const doc = new jsPDF();
    const title = `LISTADO DE ESTUDIANTES - GRADO ${selectedGradoList}`;
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Institución Educativa Fermín Tilano`, 14, 22);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 27);
    
    const tableData = estudiantes
      .filter(s => s.nombre.includes(searchTerm.toUpperCase()))
      .map((s, idx) => [idx + 1, s.documento || '---', s.nombre]);
    
    autoTable(doc, {
      startY: 35,
      head: [['#', 'DOCUMENTO', 'NOMBRE COMPLETO']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8, font: 'helvetica' }
    });
    
    doc.save(`LISTADO_ESTUDIANTES_${selectedGradoList}.pdf`);
  };

  const exportStudentsExcel = async () => {
    if (estudiantes.length === 0) return;
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`Listado ${selectedGradoList}`);
      
      worksheet.columns = [
        { header: 'ID', key: 'idx', width: 10 },
        { header: 'DOCUMENTO', key: 'documento', width: 25 },
        { header: 'NOMBRE COMPLETO', key: 'nombre', width: 60 },
        { header: 'GRADO', key: 'grado', width: 20 }
      ];

      estudiantes.forEach((s, i) => {
        worksheet.addRow({ 
          idx: i + 1, 
          documento: s.documento || '---',
          nombre: s.nombre, 
          grado: s.grado 
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `LISTADO_ESTUDIANTES_${selectedGradoList}.xlsx`);
    } catch (error) {
      console.error('Error exporting students:', error);
      notify.error('Error al exportar.');
    } finally {
      setIsExporting(false);
    }
  };

  const [isAddingRetired, setIsAddingRetired] = useState(false);

  const handleAddRetired = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      notify.error("Error: Debe iniciar sesión.");
      return;
    }
    if (!retiredForm.nombre || !retiredForm.grado) return;
    setIsAddingRetired(true);
    try {
      const payload = {
        nombre: retiredForm.nombre.toUpperCase().trim(),
        grado: retiredForm.grado,
        motivo: (retiredForm.motivo || '').toUpperCase().trim(),
        fechaRetiro: retiredForm.fechaRetiro,
        observaciones: (retiredForm.observaciones || '').toUpperCase().trim(),
        updatedAt: serverTimestamp(),
      };
      
      if (editingRetiredId) {
        await setDoc(doc(db, 'retirados', editingRetiredId), payload, { merge: true });
        notify.success("REGISTRO DE RETIRO ACTUALIZADO.");
      } else {
        await addDoc(collection(db, 'retirados'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        
        notify.success("¡ÉXITO TOTAL!", "ESTUDIANTE RETIRADO Y ARCHIVADO CORRECTAMENTE.");

        // Clean up in background or after notification
        try {
          const q = query(collection(db, 'estudiantes'), 
            where('nombre', '==', retiredForm.nombre.toUpperCase().trim()),
            where('grado', '==', retiredForm.grado)
          );
          const snap = await getDocs(q);
          const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
        } catch (err) {
          console.warn("Could not auto-remove from students list:", err);
        }

        await fetchData();
        if (activeTab === 'directorio') await fetchEstudiantes();
      }
      
      setRetiredForm({
        nombre: '',
        grado: '',
        fechaRetiro: new Date().toISOString().split('T')[0],
        motivo: '',
        observaciones: ''
      });
      setEditingRetiredId(null);
    } catch (e: any) {
      handleFirestoreError(e, editingRetiredId ? OperationType.UPDATE : OperationType.CREATE, 'retirados');
    } finally {
      setIsAddingRetired(false);
    }
  };

  const [confirmAction, setConfirmAction] = useState<{ id: string, type: 'retirados' } | null>(null);

  const handleDeleteRetired = (id: string) => {
    setConfirmMessage("¿ESTÁ SEGURO DE ELIMINAR ESTE REGISTRO DE RETIRO?");
    setConfirmAction({ id, type: 'retirados' });
    setIsConfirmOpen(true);
  };

  const handleEditRetired = (r: any) => {
    setRetiredForm({
      nombre: r.nombre,
      grado: r.grado,
      fechaRetiro: r.fechaRetiro,
      motivo: r.motivo,
      observaciones: r.observaciones || ''
    });
    setEditingRetiredId(r.id);
    setActiveTab('retirados');
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const executeDeleteRetired = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'retirados', id));
      await fetchData();
      notify.success("REGISTRO ELIMINADO CORRECTAMENTE.");
    } catch (e: any) {
      console.error("Error al eliminar retiro:", e);
      try {
        handleFirestoreError(e, OperationType.DELETE, `retirados/${id}`);
      } catch (jsonErr: any) {
        notify.error("ERROR AL ELIMINAR: ACCESO DENEGADO.");
      }
    }
  };

  const handleSaveMatricula = async (grado: string, valor: number) => {
    setSaving(grado);
    try {
      await setDoc(doc(db, 'matriculas', grado), {
        grado,
        totalEstudiantes: valor,
        updatedAt: serverTimestamp()
      });
      await fetchData();
      notify.success(`Matrícula de ${grado} actualizada correctamente.`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `matriculas/${grado}`);
    } finally {
      setSaving(null);
    }
  };

  const executeAutoSync = async () => {
    setLoading(true);
    try {
      notify.info("Iniciando Sincronización de Matrícula Global...");
      const gradesData: Record<string, number> = {};
      
      // Initialize counts
      GRADOS.forEach(g => gradesData[g] = 0);

      // Count all students
      const studentsSnap = await getDocs(collection(db, 'estudiantes'));
      studentsSnap.forEach(doc => {
        const data = doc.data();
        if (data.grado && gradesData.hasOwnProperty(data.grado)) {
          gradesData[data.grado]++;
        }
      });

      // Update matriculas collection
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      for (const [grado, total] of Object.entries(gradesData)) {
        batch.set(doc(db, 'matriculas', grado), {
          grado,
          totalEstudiantes: total,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      setMatriculas(gradesData);
      notify.success("¡Sincronización Exitosa! Censo institucional actualizado.");
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, 'matriculas_sync');
    } finally {
      setLoading(false);
    }
  };

  const totalMatriculados = Object.values(matriculas).reduce((a, b) => a + b, 0);
  const primaryGrades = ["Transición", "1°", "2°", "3°", "4°", "5°"];
  const secondaryGrades = ["6°", "7°", "8°", "9°", "10°", "11°"];
  const totalPrimary = primaryGrades.reduce((acc, grado) => acc + (matriculas[grado] || 0), 0);
  const totalSecondary = secondaryGrades.reduce((acc, grado) => acc + (matriculas[grado] || 0), 0);

  if (loading) {
    return <InstitutionalLoading message="Inicializando Sincronización de Matrículas..." />;
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      <PageHeader 
        title="MATRICULADOS ACTIVOS" 
        description="Gestión unificada de matrícula, censo poblacional y analítica en tiempo real de la Institución Educativa Fermín Tilano."
      />

      <div className="flex p-2 bg-[#1e1e1e] rounded-[2rem] max-w-lg border border-white/5 shadow-2xl">
        <button
          onClick={() => setActiveTab('directorio')}
          className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[1.5rem] text-[11px] font-black transition-all duration-500 tracking-[0.2em] uppercase ${activeTab === 'directorio' ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
        >
          <Users size={18} />
          Directorio Activo
        </button>
        <button
          onClick={() => setActiveTab('retirados')}
          className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[1.5rem] text-[11px] font-black transition-all duration-500 tracking-[0.2em] uppercase ${activeTab === 'retirados' ? 'bg-rose-600 text-white shadow-xl shadow-rose-900/40' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
        >
          <UserMinus size={18} />
          Historial de Retiros
        </button>
      </div>

      {activeTab === 'directorio' && (
        <div key="directorio-tab" className="space-y-8 animate-in fade-in duration-700">
          {/* Census Analytics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-xl">
               <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 leading-tight">Matrícula Actual</p>
               <h4 className="text-3xl font-black text-white italic tracking-tighter tabular-nums">{totalMatriculados}</h4>
            </div>
            <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-xl">
               <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1 leading-tight">Total Básica Primaria</p>
               <h4 className="text-3xl font-black text-white italic tracking-tighter tabular-nums">{totalPrimary} <span className="text-[10px] text-slate-600 not-italic uppercase tracking-tighter">EST.</span></h4>
            </div>
            <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-xl">
               <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1 leading-tight">Total Básica Secundaria</p>
               <h4 className="text-3xl font-black text-white italic tracking-tighter tabular-nums">{totalSecondary} <span className="text-[10px] text-slate-600 not-italic uppercase tracking-tighter">EST.</span></h4>
            </div>
            <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-xl">
               <p className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest mb-1 leading-tight">Total Apoyo Inclusión</p>
               <h4 className="text-3xl font-black text-white italic tracking-tighter tabular-nums">{estudiantesInclusion.length} <span className="text-[10px] text-slate-600 not-italic uppercase tracking-tighter">PIAR</span></h4>
            </div>
            <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-xl hidden lg:block">
               <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1 leading-tight">Estudiantes Retirados</p>
               <h4 className="text-3xl font-black text-white italic tracking-tighter tabular-nums">{retirados.length} <span className="text-[10px] text-slate-600 not-italic uppercase tracking-tighter">REG.</span></h4>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             {/* Dynamic Grade Matrix & SYNC Controls */}
             <div className="lg:col-span-1 space-y-6">
                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center">
                      <BookOpen size={18} />
                    </div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest italic">MATRÍCULAS POR GRADOS</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-8">
                    {GRADOS.map(g => (
                      <button
                        key={g}
                        onClick={() => setSelectedGradoList(g)}
                        className={`group p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 ${
                          selectedGradoList === g ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-900/40 transform scale-105' : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <span className={`text-[12px] font-black uppercase tracking-widest ${selectedGradoList === g ? 'text-white' : 'text-slate-400'}`}>
                          {g}
                        </span>
                        <div className={`px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums transition-all ${
                          selectedGradoList === g ? 'bg-white text-blue-600' : 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {matriculas[g] || 0} <span className="text-[7px]">ACTIVOS</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="p-6 bg-black/20 rounded-3xl border border-white/5">
                     <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                       <Upload size={14} className="text-blue-400" /> Carga SIMAT ({selectedGradoList})
                     </h4>
                     <textarea
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder="NOMBRE | DOCUMENTO..."
                      className="w-full h-32 bg-transparent border border-white/10 rounded-xl p-3 text-[10px] text-white font-mono mb-4 outline-none focus:border-blue-500 transition-all resize-none"
                     />
                     <button
                      onClick={handleBulkUpload}
                      disabled={loadingList || !bulkInput.trim()}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 active:scale-95"
                     >
                       Integrar al Listado {selectedGradoList}
                     </button>
                  </div>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-500 flex items-center justify-center">
                      <RefreshCw size={18} />
                    </div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest italic">Sincronización Manual</h3>
                  </div>
                  <div className="space-y-4">
                    <button 
                      onClick={executeAutoSync}
                      disabled={loading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-900/40"
                    >
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                      SINCRONIZACIÓN
                    </button>
                    
                    <div className="flex flex-col gap-3 pt-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Ajuste Manual ({selectedGradoList})</label>
                      <div className="flex flex-col gap-3">
                        <input 
                          type="number"
                          value={matriculas[selectedGradoList] || 0}
                          onChange={(e) => setMatriculas(p => ({ ...p, [selectedGradoList]: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white font-black text-center text-xl outline-none focus:border-blue-500 tabular-nums"
                        />
                        <button 
                          onClick={() => handleSaveMatricula(selectedGradoList, matriculas[selectedGradoList] || 0)}
                          disabled={saving === selectedGradoList}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white px-8 rounded-xl font-black text-[12px] uppercase tracking-[0.3em] transition-all disabled:opacity-50 shadow-xl shadow-blue-900/40 active:scale-95 border-b-4 border-blue-800 hover:border-blue-700 py-5"
                        >
                          {saving === selectedGradoList ? '...' : 'ACTUALIZACIÓN'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
             </div>

            {/* List Viewer */}
            <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl min-h-[500px] flex flex-col">
               <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
                 <div>
                    <h3 className="text-[14px] font-black text-white uppercase tracking-tighter italic">Matrícula de {selectedGradoList} - {estudiantes.length} Estudiantes Activos</h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase mt-1 tracking-widest">Estudiantes matriculados en el grado {selectedGradoList}</p>
                 </div>
                 <div className="flex items-center gap-3">
                   <button 
                    onClick={exportStudentsPDF}
                    disabled={estudiantes.length === 0}
                    className="w-10 h-10 flex items-center justify-center bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-900/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                   >
                     <FileText size={18} />
                   </button>
                   <button 
                    onClick={exportStudentsExcel}
                    disabled={estudiantes.length === 0 || isExporting}
                    className="w-10 h-10 flex items-center justify-center bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-900/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                   >
                     {isExporting ? <RefreshCw className="animate-spin" size={18} /> : <FileDown size={18} />}
                   </button>
                   <div className="relative">
                     <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                     <input 
                      type="text" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="BUSCAR..." 
                      className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] text-white uppercase tracking-widest w-40 md:w-56 outline-none focus:border-blue-500 transition-all font-black"
                     />
                   </div>
                 </div>
               </div>

                <div className="flex-1 space-y-3 overflow-auto custom-scrollbar pr-2 max-h-[800px] relative min-h-[200px]">
                   {loadingList ? (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10 rounded-2xl">
                        <InstitutionalLoading message="Actualizando Nómina..." />
                     </div>
                   ) : null}
                   {estudiantes.filter(s => s.nombre.includes(searchTerm.toUpperCase())).map((s, idx) => (
                     <div key={s.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-blue-500/30 transition-all">
                       {editingId === s.id ? (
                          <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex-1 space-y-2 w-full">
                              <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                              <input 
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value.toUpperCase())}
                                placeholder="NOMBRE COMPLETO..."
                                className="w-full bg-black/40 border border-blue-500/50 rounded-lg px-3 py-2 text-xs text-white font-black outline-none focus:border-blue-500"
                                autoFocus
                              />
                            </div>
                            <div className="w-full sm:w-40 space-y-2">
                              <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest ml-1">Documento</label>
                              <input 
                                type="text"
                                value={editDocumento}
                                onChange={(e) => setEditDocumento(e.target.value)}
                                placeholder="N° DOCUMENTO..."
                                className="w-full bg-black/40 border border-blue-500/50 rounded-lg px-3 py-2 text-xs text-white font-black outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="flex gap-2 self-end pb-1">
                              <button 
                                onClick={() => handleSaveEdit(s.id)} 
                                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                                title="Actualizar Datos"
                              >
                                <CheckCircle2 size={14} />
                                ACTUALIZAR
                              </button>
                              <button 
                                onClick={() => setEditingId(null)} 
                                className="px-4 py-3 bg-white/5 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5"
                                title="Cancelar"
                              >
                                CANCELAR
                              </button>
                            </div>
                          </div>
                       ) : (
                         <>
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-500 text-xs font-black border border-blue-600/10 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                  {String(idx + 1).padStart(2, '0')}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-white uppercase tracking-widest leading-relaxed group-hover:text-blue-400 transition-colors">
                                  {formatName(s.nombre)}
                                </span>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase italic tracking-tighter flex items-center gap-2 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                                    <BookOpen size={10} className="text-blue-500/50" />
                                    DOC: {s.documento || 'PENDIENTE'}
                                  </span>
                                  {estudiantesInclusion.some(i => i.nombre.toUpperCase() === s.nombre.toUpperCase()) && (
                                    <span className="px-2 py-0.5 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[8px] font-black uppercase tracking-widest animate-pulse">
                                      Apoyo Especial (PIAR)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                              <button 
                                onClick={() => { setEditingId(s.id); setEditName(s.nombre); setEditDocumento(s.documento || ''); }}
                                className="w-9 h-9 flex items-center justify-center text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/10 bg-blue-500/5 shadow-sm"
                              >
                                <Pencil size={14} />
                              </button>
                              <button 
                                onClick={() => { 
                                  setPendingDelete(s);
                                  setConfirmMessage(`¿TRASLADAR A ${s.nombre} AL HISTORIAL DE RETIROS?`);
                                  setIsConfirmOpen(true);
                                }}
                                className="w-9 h-9 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/10 bg-rose-500/5 shadow-sm"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                         </>
                       )}
                     </div>
                   ))}
                   {estudiantes.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20">
                          <Users size={64} className="mb-4" />
                          <p className="text-[10px] font-black uppercase tracking-[0.3em]">Sin registros cargados</p>
                      </div>
                   )}
                </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'retirados' && (
        <div key="retirados-tab" className="space-y-8 animate-in fade-in duration-700">
           <div className="executive-card border-white/5">
              <div className="p-8 border-b border-white/5 bg-[#1e1e1e]/50">
                 <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Historial de Retiros</h3>
              </div>
              <form onSubmit={handleAddRetired} className="p-8 grid grid-cols-1 md:grid-cols-6 gap-6 items-end">
                 <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Estudiante</label>
                    <input type="text" value={retiredForm.nombre} onChange={e => setRetiredForm({...retiredForm, nombre: e.target.value})} className="executive-input w-full" placeholder="NOMBRE COMPLETO..." required />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Grado</label>
                    <select value={retiredForm.grado} onChange={e => setRetiredForm({...retiredForm, grado: e.target.value})} className="executive-input w-full" required>
                       <option value="">GRADO...</option>
                       {GRADOS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Fecha Retiro</label>
                    <input type="date" value={retiredForm.fechaRetiro} onChange={e => setRetiredForm({...retiredForm, fechaRetiro: e.target.value})} className="executive-input w-full p-2.5" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Motivo</label>
                    <input type="text" value={retiredForm.motivo} onChange={e => setRetiredForm({...retiredForm, motivo: e.target.value})} className="executive-input w-full" placeholder="MOTIVO..." />
                 </div>
                 <div className="flex gap-3">
                    <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-widest shadow-lg shadow-amber-900/20 active:scale-95">
                      {editingRetiredId ? 'ACTUALIZAR' : 'REGISTRAR'}
                    </button>
                    {editingRetiredId && (
                      <button type="button" onClick={() => { setEditingRetiredId(null); setRetiredForm({ nombre: '', grado: '', motivo: '', fechaRetiro: new Date().toISOString().split('T')[0], observaciones: '' }); }} className="bg-rose-500/10 text-rose-500 p-4 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><X size={18} /></button>
                    )}
                 </div>
                 <div className="md:col-span-6">
                   <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Observaciones / Detalles del Retiro</label>
                   <textarea 
                     value={retiredForm.observaciones} 
                     onChange={e => setRetiredForm({...retiredForm, observaciones: e.target.value})} 
                     className="executive-input w-full h-20 resize-none py-3" 
                     placeholder="DETALLES ADICIONALES..."
                   />
                 </div>
              </form>
           </div>
           
           <div className="executive-card border-white/5 overflow-hidden">
              <table className="w-full text-left">
                 <thead className="bg-[#1e1e1e]">
                    <tr>
                       <th className="px-10 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estudiante</th>
                       <th className="px-10 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Curso</th>
                       <th className="px-10 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Motivos</th>
                       <th className="px-10 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Comandos</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                    {retirados.map(r => (
                       <tr key={r.id} className="hover:bg-amber-600/5 transition-all group">
                          <td className="px-10 py-6">
                            <div className="text-white font-black text-xs italic uppercase italic group-hover:text-amber-400 transition-colors">{r.nombre}</div>
                            <div className="flex items-center gap-3 mt-1">
                               <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Fecha: {r.fechaRetiro}</span>
                               {r.documento && (
                                 <span className="text-[9px] text-amber-500/50 font-black uppercase tracking-tighter bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                                   DOC: {r.documento}
                                 </span>
                               )}
                            </div>
                          </td>
                          <td className="px-10 py-6 text-center text-slate-400 font-black italic">{r.grado}</td>
                          <td className="px-10 py-6 text-center text-amber-500 font-black text-[10px] uppercase italic tracking-wider">{r.motivo || 'NO ESPECIFICADO'}</td>
                          <td className="px-10 py-6">
                            <div className="flex justify-end gap-2">
                               <button onClick={() => handleEditRetired(r)} className="text-blue-400 p-2.5 bg-blue-500/10 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/10"><Edit2 size={16} /></button>
                               <button onClick={() => handleDeleteRetired(r.id)} className="text-rose-500 p-2.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/10"><Trash2 size={16} /></button>
                            </div>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        message={confirmMessage}
        onConfirm={async () => {
          setIsConfirmOpen(false);
          if (confirmAction) {
            if (confirmAction.type === 'retirados') {
              await executeDeleteRetired(confirmAction.id);
            }
          } else if (pendingDelete) {
            await executeDeleteEstudiante(pendingDelete);
          }
          setConfirmAction(null);
          setPendingDelete(null);
        }}
        onCancel={() => {
          setIsConfirmOpen(false);
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
