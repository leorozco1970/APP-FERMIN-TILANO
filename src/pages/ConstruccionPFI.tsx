import React, { useState, useEffect } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { PlanFormacionIntegralData, PFINecesidadRegistro, PFIActividadCronograma } from '../lib/types';
import { Save, FileOutput, Trash2, PlusCircle, Calendar, ClipboardList, BookOpen, Target, Sparkles, Layout, Building2, Eye, Download, FileSpreadsheet, AlertCircle, X, CheckCircle2, Upload, ExternalLink, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PageHeader } from '../components/PageHeader';
import { InstitutionalLoading } from '../components/InstitutionalLoading';
import { ConfirmModal } from '../components/ConfirmModal';
import { useNotification } from '../context/NotificationContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, getPerfectTableStyles, PDF_MARGIN } from '../lib/pdfUtils';

export function ConstruccionPFI() {
  const { notify } = useNotification();
  const [plans, setPlans] = useState<PlanFormacionIntegralData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For the GLOBAL PFI document:
  const [globalFileUrl, setGlobalFileUrl] = useState<string | null>(null);
  const [globalFileName, setGlobalFileName] = useState<string | null>(null);
  const [uploadingGlobal, setUploadingGlobal] = useState(false);
  const [globalUploadProgress, setGlobalUploadProgress] = useState(0);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);
  const [isSubFormOpen, setIsSubFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<PlanFormacionIntegralData>>({
    institucion: '',
    codigoDane: '',
    lecturaContexto: 'No',
    fortalezas: '',
    oportunidadesMejora: '',
    objetivoGeneral: '',
    objetivosEspecificos: '',
    registrosNecesidades: []
  });

  const [currentNecesidad, setCurrentNecesidad] = useState<Partial<PFINecesidadRegistro>>({
    necesidadPriorizada: '',
    metas: '',
    accionesDesarrollo: '',
    armonizacionCurricular: '',
    productosEvidencias: '',
    recursos: '',
    responsables: '',
    cronograma: [],
    accionesSeguimiento: '',
    observaciones: ''
  });

  const [currentCronograma, setCurrentCronograma] = useState<PFIActividadCronograma>({
    actividad: '',
    fecha: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'construccion_pfi'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: PlanFormacionIntegralData[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as PlanFormacionIntegralData);
      });
      setPlans(data);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'construccion_pfi');
    });

    // Fetch the global PFI document state
    const fetchGlobalDoc = async () => {
      try {
        const globalDocRef = doc(db, 'pfi_settings', 'main_document');
        const docSnap = await getDoc(globalDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.fileUrl) setGlobalFileUrl(data.fileUrl);
          if (data.fileName) setGlobalFileName(data.fileName);
        }
      } catch (e) {
        console.error("Error fetching global document", e);
      }
    };
    fetchGlobalDoc();

    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGlobalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingGlobal(true);
      
      const storageRef = ref(storage, `pfi_global/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setGlobalUploadProgress(progress);
        },
        (error) => {
          console.error("Error uploading global file:", error);
          notify.error('Error al subir el archivo general.');
          setUploadingGlobal(false);
          setGlobalUploadProgress(0);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          try {
             const globalDocRef = doc(db, 'pfi_settings', 'main_document');
             await setDoc(globalDocRef, {
                 fileUrl: downloadURL,
                 fileName: file.name,
                 updatedAt: serverTimestamp()
             }, { merge: true });
             
             setGlobalFileUrl(downloadURL);
             setGlobalFileName(file.name);
             setUploadingGlobal(false);
             setGlobalUploadProgress(0);
             notify.success('Archivo del PFI actualizado exitosamente.');
          } catch(e: any) {
             console.error("Error saving global file to DB", e);
             try {
                handleFirestoreError(e, OperationType.WRITE, 'pfi_settings/main_document');
             } catch (jsonErr: any) {
                notify.error('Error de permisos al guardar el archivo institucional.');
             }
             setUploadingGlobal(false);
          }
        }
      );
    }
  };

  const handleGlobalFileRemove = async () => {
      try {
          const globalDocRef = doc(db, 'pfi_settings', 'main_document');
          await setDoc(globalDocRef, {
              fileUrl: null,
              fileName: null,
              updatedAt: serverTimestamp()
          }, { merge: true });
          
          setGlobalFileUrl(null);
          setGlobalFileName(null);
          notify.success('Archivo eliminado correctamente');
      } catch(e: any) {
          console.error("Error removing global record from DB", e);
          try {
            handleFirestoreError(e, OperationType.DELETE, 'pfi_settings/main_document');
          } catch (jsonErr: any) {
            notify.error('Error al eliminar: No tiene permisos administrativos.');
          }
      }
  };

  const handleSubInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentNecesidad(prev => ({ ...prev, [name]: value }));
  };

  const addCronogramaActivity = () => {
    if (!currentCronograma.actividad || !currentCronograma.fecha) {
      notify.error('Complete los datos de la actividad en el cronograma.');
      return;
    }
    setCurrentNecesidad(prev => ({
      ...prev,
      cronograma: [...(prev.cronograma || []), currentCronograma]
    }));
    setCurrentCronograma({ actividad: '', fecha: '' });
  };

  const removeCronogramaActivity = (index: number) => {
    setCurrentNecesidad(prev => ({
      ...prev,
      cronograma: prev.cronograma?.filter((_, i) => i !== index)
    }));
  };

  const saveNecesidad = () => {
    if (!currentNecesidad.necesidadPriorizada) {
      notify.error('Seleccione una necesidad priorizada.');
      return;
    }
    
    const newNecesidad = {
      ...currentNecesidad,
      id: Math.random().toString(36).substr(2, 9)
    } as PFINecesidadRegistro;

    setFormData(prev => ({
      ...prev,
      registrosNecesidades: [...(prev.registrosNecesidades || []), newNecesidad]
    }));

    // Reset sub-form
    setCurrentNecesidad({
      necesidadPriorizada: '',
      metas: '',
      accionesDesarrollo: '',
      armonizacionCurricular: '',
      productosEvidencias: '',
      recursos: '',
      responsables: '',
      cronograma: [],
      accionesSeguimiento: '',
      observaciones: ''
    });
    setIsSubFormOpen(false);
    notify.success('Registro añadido al plan.');
  };

  const removeNecesidad = (id: string) => {
    setFormData(prev => ({
      ...prev,
      registrosNecesidades: prev.registrosNecesidades?.filter(n => n.id !== id)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.institucion || !formData.codigoDane) {
      notify.error('Complete los datos básicos de la institución.');
      return;
    }

    setIsSubmitting(true);
    try {
      const dataToSave = {
        ...formData,
        updatedAt: serverTimestamp(),
        authorUid: auth.currentUser?.uid || 'anonymous',
        authorEmail: auth.currentUser?.email || 'anonymous'
      };

      if (editingPlanId) {
        await updateDoc(doc(db, 'construccion_pfi', editingPlanId), dataToSave);
        notify.success('Plan de Formación Integral actualizado.');
      } else {
        await addDoc(collection(db, 'construccion_pfi'), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
        notify.success('Plan de Formación Integral registrado exitosamente.');
      }

      setFormData({
        institucion: '',
        codigoDane: '',
        lecturaContexto: 'No',
        fortalezas: '',
        oportunidadesMejora: '',
        objetivoGeneral: '',
        objetivosEspecificos: '',
        registrosNecesidades: []
      });
      setEditingPlanId(null);
    } catch (error: any) {
      handleFirestoreError(error, editingPlanId ? OperationType.UPDATE : OperationType.CREATE, 'construccion_pfi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (plan: PlanFormacionIntegralData) => {
    setFormData(plan);
    setEditingPlanId(plan.id || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: string) => {
    setConfirmMessage('¿ESTÁ SEGURO DE ELIMINAR ESTE REGISTRO DE P.F.I?');
    setOnConfirm(() => async () => {
      try {
        await deleteDoc(doc(db, 'construccion_pfi', id));
        notify.success('Registro de P.F.I eliminado.');
      } catch (error: any) {
        handleFirestoreError(error, OperationType.DELETE, `construccion_pfi/${id}`);
      }
    });
    setIsConfirmOpen(true);
  };

  const exportPDF = (plan: PlanFormacionIntegralData) => {
    const doc = new jsPDF();
    const docTitle = "PLAN DE FORMACIÓN INTEGRAL (P.F.I) - INSTITUCIONAL";
    const introText = "Documento maestro para la estructuración del Plan de Formación Integral. Basado en la lectura de contexto, priorización de necesidades y trazabilidad de acciones pedagógicas.";
    
    const startY = drawExecutiveHeader(doc, docTitle, introText);
    let currentY = startY;

    // Header Table
    autoTable(doc, {
      startY: currentY,
      body: [
        ['INSTITUCIÓN EDUCATIVA:', plan.institucion.toUpperCase()],
        ['CÓDIGO DANE:', plan.codigoDane],
        ['LECTURA DE CONTEXTO:', plan.lecturaContexto],
        ['FORTALEZAS:', plan.fortalezas?.toUpperCase() || 'N/A'],
        ['OPORTUNIDADES DE MEJORA:', plan.oportunidadesMejora?.toUpperCase() || 'N/A'],
        ['OBJETIVO GENERAL:', plan.objetivoGeneral.toUpperCase()],
        ['OBJETIVOS ESPECÍFICOS:', plan.objetivosEspecificos.toUpperCase()]
      ],
      ...getPerfectTableStyles(),
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold', fillColor: [240, 240, 240] }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Table of Needs
    plan.registrosNecesidades.forEach((reg, idx) => {
      if (currentY > 240) {
        doc.addPage();
        currentY = 30;
      }

      autoTable(doc, {
        startY: currentY,
        head: [[{ content: `REGISTRO DE NECESIDAD #${idx + 1}: ${reg.necesidadPriorizada.toUpperCase()}`, colSpan: 2, styles: { fillColor: PDF_COLORS.PRIMARY_NAVY } }]],
        body: [
          ['METAS:', reg.metas.toUpperCase()],
          ['ACCIONES DE DESARROLLO:', reg.accionesDesarrollo.toUpperCase()],
          ['ARMONIZACIÓN CURRICULAR:', reg.armonizacionCurricular.toUpperCase()],
          ['PRODUCTOS / EVIDENCIAS:', reg.productosEvidencias.toUpperCase()],
          ['RECURSOS:', reg.recursos.toUpperCase()],
          ['RESPONSABLES:', reg.responsables.toUpperCase()],
          ['CRONOGRAMA:', reg.cronograma.map(c => `${c.actividad} (${c.fecha})`).join('\n')],
          ['SEGUIMIENTO / EVALUACIÓN:', reg.accionesSeguimiento.toUpperCase()],
          ['OBSERVACIONES:', reg.observaciones.toUpperCase()]
        ],
        ...getPerfectTableStyles(),
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold', fillColor: [248, 248, 248] }
        }
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      drawExecutiveFooter(doc, i, pageCount);
      drawWatermark(doc);
    }

    doc.save(`PFI_${plan.institucion.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportExcel = (plan: PlanFormacionIntegralData) => {
    const mainData = [
      ["PLAN DE FORMACION INTEGRAL"],
      [],
      ["Institución", plan.institucion],
      ["Código DANE", plan.codigoDane],
      ["Lectura de Contexto", plan.lecturaContexto],
      ["Fortalezas", plan.fortalezas || ""],
      ["Oportunidades de Mejora", plan.oportunidadesMejora || ""],
      ["Objetivo General", plan.objetivoGeneral],
      ["Objetivos Específicos", plan.objetivosEspecificos],
      [],
      ["MATRIZ DE NECESIDADES Y ACCIONES"],
      ["Necesidad Priorizada", "Metas", "Acciones de Desarrollo", "Armonización Curricular", "Documentos/Evidencias", "Recursos", "Responsables", "Seguimiento", "Observaciones"]
    ];

    plan.registrosNecesidades.forEach(reg => {
      mainData.push([
        reg.necesidadPriorizada,
        reg.metas,
        reg.accionesDesarrollo,
        reg.armonizacionCurricular,
        reg.productosEvidencias,
        reg.recursos,
        reg.responsables,
        reg.accionesSeguimiento,
        reg.observaciones
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(mainData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PFI");
    XLSX.writeFile(wb, `Plan_Formacion_Integral_${plan.institucion.replace(/\s+/g, '_')}.xlsx`);
  };

  // Derive opportunities list for select
  const getOpportunitiesList = () => {
    if (!formData.oportunidadesMejora) return [];
    return formData.oportunidadesMejora.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  };

  const exportAllConsolidatedExcel = () => {
    if (plans.length === 0) {
      notify.error('No hay planes registrados para exportar.');
      return;
    }

    const consolidatedData = [
      ["CONSOLIDADO PLAN DE FORMACIÓN INTEGRAL (P.F.I.) 2025"],
      [],
      ["Institución", "Código DANE", "Lectura Contexto", "Objetivo General", "Necesidad Priorizada", "Metas", "Acciones", "Responsables"]
    ];

    plans.forEach(plan => {
      if (plan.registrosNecesidades && plan.registrosNecesidades.length > 0) {
        plan.registrosNecesidades.forEach(reg => {
          consolidatedData.push([
            plan.institucion,
            plan.codigoDane,
            plan.lecturaContexto,
            plan.objetivoGeneral,
            reg.necesidadPriorizada,
            reg.metas,
            reg.accionesDesarrollo,
            reg.responsables
          ]);
        });
      } else {
        consolidatedData.push([
          plan.institucion,
          plan.codigoDane,
          plan.lecturaContexto,
          plan.objetivoGeneral,
          "N/A",
          "N/A",
          "N/A",
          "N/A"
        ]);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(consolidatedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado PFI");
    XLSX.writeFile(wb, `Consolidado_PFI_Institucional_2025.xlsx`);
    notify.success('Consolidado Excel generado exitosamente.');
  };

  return (
    <div className="flex flex-col gap-10 max-w-7xl mx-auto w-full pb-32 px-4 select-none animate-in fade-in duration-1000">
      <PageHeader 
        title="CONSTRUCCIÓN DEL PLAN DE FORMACIÓN INTEGRAL"
        description="Diseño y estructuración técnica del Plan de Formación Integral institucional basado en lectura de contexto y priorización estratégica."
        imageUrl="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=800"
      />

      <div className="executive-card p-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none transition-colors group-hover:bg-blue-600/10 duration-1000" />
        
        <div className="flex items-center gap-6 mb-10 relative z-10">
           <div className="bg-blue-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 border border-blue-400/20">
              <Upload size={28} />
           </div>
           <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">URL DEL PFI 2025</h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Vínculo institucional con el documento maestro del PFI 2025</p>
           </div>
        </div>
        
        <div className="relative z-10 max-w-3xl">
          {!globalFileName && !uploadingGlobal && (
            <div className="space-y-6">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Pegue la URL del documento maestro PFI 2025:</label>
              
              <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                <div className="relative flex-1 group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors">
                    <ExternalLink size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder="URL DE GOOGLE DRIVE O DIRECTORIO..."
                    className="executive-input w-full pl-14 h-14 text-xs font-bold uppercase tracking-tight"
                    id="globalUrlInput"
                  />
                </div>
                <button 
                  type="button"
                  onClick={async () => {
                     const input = document.getElementById('globalUrlInput') as HTMLInputElement;
                     if (input && input.value.trim().startsWith('http')) {
                        setUploadingGlobal(true);
                        try {
                           const globalDocRef = doc(db, 'pfi_settings', 'main_document');
                           await setDoc(globalDocRef, {
                                fileUrl: input.value.trim(),
                                fileName: 'DOCUMENTO PFI 2025',
                                updatedAt: serverTimestamp()
                           }, { merge: true });
                           setGlobalFileUrl(input.value.trim());
                           setGlobalFileName('DOCUMENTO PFI 2025');
                           notify.success('URL del PFI 2025 guardada exitosamente.');
                        } catch (e: any) {
                           handleFirestoreError(e, OperationType.UPDATE, 'pfi_settings/main_document');
                        }
                        setUploadingGlobal(false);
                     } else {
                        notify.error('SISTEMA: Ingrese una URL válida');
                     }
                  }}
                  className="px-10 h-14 bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-blue-900/20 uppercase active:scale-95"
                >
                  CONFIGURAR PFI
                </button>
              </div>
            </div>
          )}

          {uploadingGlobal && (
            <div className="bg-blue-600/5 border border-dashed border-blue-500/20 rounded-3xl p-10 text-center animate-pulse">
               <RefreshCw className="animate-spin mx-auto text-blue-500 mb-4" size={32} />
               <p className="text-blue-400 font-black text-[10px] tracking-[0.3em] uppercase">Estableciendo vínculo táctico...</p>
            </div>
          )}

          {globalFileName && !uploadingGlobal && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 flex flex-col items-center justify-between gap-8 animate-in zoom-in-95 duration-500 relative">
              <div className="flex items-center gap-6 w-full">
                 <div className="bg-emerald-500/20 p-4 rounded-2xl text-emerald-500 shadow-inner">
                    <CheckCircle2 size={32} />
                 </div>
                 <div className="flex-1">
                    <span className="text-sm font-black text-white uppercase tracking-tighter italic">{globalFileName}</span>
                    <p className="text-[9px] font-black text-emerald-500/70 uppercase tracking-widest mt-1 line-clamp-1">{globalFileUrl}</p>
                 </div>
              </div>
              
              <div className="grid grid-cols-2 sm:flex gap-3 w-full">
                 {globalFileUrl && (
                   <a href={globalFileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-initial h-12 px-6 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] tracking-[0.2em] rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2 uppercase">
                     <Eye size={16} /> VER
                   </a>
                 )}
                 <button 
                  onClick={() => {
                    const url = globalFileUrl || '';
                    setGlobalFileName(null);
                    setGlobalFileUrl(null);
                    setTimeout(() => {
                      const input = document.getElementById('globalUrlInput') as HTMLInputElement;
                      if (input) input.value = url;
                    }, 0);
                  }} 
                  className="flex-1 sm:flex-initial h-12 px-6 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white rounded-xl transition-all border border-amber-500/20 flex items-center justify-center gap-2 font-black text-[10px] tracking-widest uppercase"
                 >
                   <Sparkles size={16} /> EDITAR
                 </button>
                 
                 <button 
                  onClick={exportAllConsolidatedExcel}
                  className="flex-1 sm:flex-initial h-12 px-6 bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white rounded-xl transition-all border border-emerald-500/20 flex items-center justify-center gap-2 font-black text-[10px] tracking-widest uppercase"
                 >
                   <FileSpreadsheet size={16} /> EXPORTAR EXCEL
                 </button>

                 <button onClick={handleGlobalFileRemove} className="h-12 w-12 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/20 flex items-center justify-center shrink-0">
                   <Trash2 size={20} />
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="executive-card p-10 bg-slate-900/40 border-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] -mr-40 -mt-40 pointer-events-none transition-all duration-[3000ms] group-hover:bg-blue-600/10" />
        
        <form onSubmit={handleSubmit} className="space-y-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
             <div className="flex flex-col gap-3">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 flex items-center gap-2">
                   <Building2 size={14} className="text-blue-500" /> Institución Educativa *
                </label>
                <input 
                  type="text" 
                  name="institucion"
                  value={formData.institucion}
                  onChange={handleInputChange}
                  className="executive-input w-full px-6 h-14"
                  required
                  placeholder="NOMBRE DE LA SEDE / I.E."
                />
             </div>
             <div className="flex flex-col gap-3">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 flex items-center gap-2">
                   <Target size={14} className="text-blue-500" /> Código DANE *
                </label>
                <input 
                  type="text" 
                  name="codigoDane"
                  value={formData.codigoDane}
                  onChange={handleInputChange}
                  className="executive-input w-full px-6 h-14"
                  required
                  placeholder="DIGITE CÓDIGO DANE..."
                />
             </div>
          </div>

          <div className="p-8 bg-slate-900/60 rounded-[2.5rem] border border-white/5 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-white/5 pb-6">
               <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-3 rounded-xl text-blue-500 shadow-xl shadow-blue-900/20">
                    <BookOpen size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Lectura de Contexto</h3>
               </div>
               <div className="flex items-center gap-4 bg-slate-950 p-2 rounded-2xl border border-white/5">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-4">¿Se realizó?</span>
                  <select 
                    name="lecturaContexto"
                    value={formData.lecturaContexto}
                    onChange={handleInputChange}
                    className="bg-blue-600 text-white font-black px-6 py-2.5 rounded-xl uppercase tracking-widest text-xs cursor-pointer focus:ring-4 focus:ring-blue-600/20"
                  >
                    <option value="No">No</option>
                    <option value="Sí">Sí</option>
                  </select>
               </div>
            </div>

            {formData.lecturaContexto === 'Sí' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-in slide-in-from-top-4 duration-700">
                 <div className="flex flex-col gap-3">
                    <label className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em] px-1 italic">Fortalezas Institucionales</label>
                    <textarea 
                      name="fortalezas"
                      value={formData.fortalezas}
                      onChange={handleInputChange}
                      className="executive-input w-full p-6 min-h-[160px] resize-none"
                      placeholder="DESCRIBA LAS CAPACIDADES ESTRUCTURALES..."
                    />
                 </div>
                 <div className="flex flex-col gap-3">
                    <label className="text-[11px] font-black text-amber-500 uppercase tracking-[0.3em] px-1 italic">Oportunidades de Mejora</label>
                    <textarea 
                      name="oportunidadesMejora"
                      value={formData.oportunidadesMejora}
                      onChange={handleInputChange}
                      className="executive-input w-full p-6 min-h-[160px] resize-none border-amber-500/10 focus:border-amber-500/40"
                      placeholder="IDENTIFIQUE ÁREAS DE INTERVENCIÓN PRIORITARIA (PUEDE USAR LISTA)..."
                    />
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest italic ml-1">* Estas se usarán como necesidades priorizadas luego.</p>
                 </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
             <div className="flex flex-col gap-3">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Objetivo General del P.F.I. *</label>
                <textarea 
                  name="objetivoGeneral"
                  value={formData.objetivoGeneral}
                  onChange={handleInputChange}
                  className="executive-input w-full p-6 min-h-[140px] resize-none"
                  required
                  placeholder="PROPÓSITO MACRO DEL PLAN..."
                />
             </div>
             <div className="flex flex-col gap-3">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Objetivos Específicos *</label>
                <textarea 
                  name="objetivosEspecificos"
                  value={formData.objetivosEspecificos}
                  onChange={handleInputChange}
                  className="executive-input w-full p-6 min-h-[140px] resize-none"
                  required
                  placeholder="METAS TÁCTICAS OPERATIVAS..."
                />
             </div>
          </div>

          <div className="pt-10 border-t border-white/5">
             <div className="flex items-center justify-between mb-8 gap-4">
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic flex items-center gap-4">
                   <Layout size={28} className="text-blue-500" /> Matriz de Acción Priorizada
                </h3>
                <button 
                  type="button"
                  onClick={() => setIsSubFormOpen(true)}
                  className="flex items-center gap-4 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black text-[11px] tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/20 active:scale-95 uppercase"
                >
                   <PlusCircle size={18} strokeWidth={3} /> Añadir Necesidad
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(formData.registrosNecesidades || []).map((reg) => (
                  <div key={reg.id} className="p-8 bg-slate-900/80 rounded-[2.5rem] border border-white/5 relative group/item hover:border-emerald-500/30 transition-all shadow-xl">
                    <button 
                      type="button"
                      onClick={() => removeNecesidad(reg.id)}
                      className="absolute top-6 right-6 p-2.5 text-rose-500/40 hover:text-rose-500 transition-colors bg-rose-500/5 rounded-xl opacity-0 group-hover/item:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                       <CheckCircle2 size={16} className="text-emerald-500" />
                       <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Prioridad Registrada</span>
                    </div>
                    <h4 className="text-lg font-black text-white uppercase tracking-tighter mb-4 pr-10 leading-tight italic">
                      {reg.necesidadPriorizada}
                    </h4>
                    <div className="space-y-4">
                       <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">Responsable:</span>
                          <span className="text-[11px] font-black text-slate-300 uppercase italic truncate">{reg.responsables}</span>
                       </div>
                       <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-white/5">
                          <Calendar size={14} className="text-slate-500" />
                          <span className="text-[10px] font-black text-slate-400">{reg.cronograma.length} Actividades Programadas</span>
                       </div>
                    </div>
                  </div>
                ))}

                {(formData.registrosNecesidades || []).length === 0 && (
                  <div className="col-span-full py-20 bg-slate-900/20 rounded-[3rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-center px-10">
                     <AlertCircle size={48} className="text-slate-800 mb-6" />
                     <p className="text-slate-600 font-bold uppercase tracking-[0.3em] text-sm max-w-sm">No hay acciones registradas en la matriz institucional todavía.</p>
                  </div>
                )}
             </div>
          </div>

          <div className="pt-12 border-t border-white/5 flex flex-col sm:flex-row gap-6">
             <button 
               type="submit" 
               disabled={isSubmitting}
               className="flex-1 flex items-center justify-center gap-4 bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[2rem] font-black text-sm tracking-[0.3em] transition-all shadow-2xl shadow-blue-900/40 disabled:opacity-50 active:scale-[0.98] uppercase"
             >
                {isSubmitting ? 'SINCRONIZANDO ESTRUCTURA...' : editingPlanId ? 'ACTUALIZAR PLAN INTEGRAL' : 'FINALIZAR Y REGISTRAR PLAN'}
                <Save size={22} className="text-[#D4AF37]" />
             </button>
             {editingPlanId && (
               <button 
                 type="button"
                 onClick={() => {
                    setEditingPlanId(null);
                    setFormData({
                      institucion: '',
                      codigoDane: '',
                      lecturaContexto: 'No',
                      fortalezas: '',
                      oportunidadesMejora: '',
                      objetivoGeneral: '',
                      objetivosEspecificos: '',
                      registrosNecesidades: []
                    });
                 }}
                 className="px-10 py-5 bg-slate-900 border border-white/10 rounded-[2rem] text-[10px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-widest"
               >
                 Cancelar Edición
               </button>
             )}
          </div>
        </form>
      </div>

      <div className="space-y-8">
         <div className="flex items-center gap-6 px-1">
            <div className="w-2 h-10 bg-blue-600 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.4)]" />
            <h3 className="text-4xl font-black text-white uppercase tracking-tighter italic">Historial de Planes (P.F.I)</h3>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {plans.map((p) => (
              <div key={p.id} className="executive-card p-10 group/plan border-white/5 hover:border-blue-500/30 transition-all duration-700 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 transform rotate-12 opacity-[0.03] group-hover/plan:opacity-[0.08] transition-all duration-1000 pointer-events-none">
                    <Building2 size={160} className="text-blue-500" />
                 </div>
                 
                 <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                       <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic">Registro Institucional</span>
                          <h4 className="text-2xl font-black text-white uppercase tracking-tighter leading-tight italic truncate max-w-[200px]">{p.institucion}</h4>
                       </div>
                       <div className="flex gap-2">
                          <button 
                            onClick={() => handleEdit(p)}
                            className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-lg"
                          >
                             <Sparkles size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(p.id!)}
                            className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-lg"
                          >
                             <Trash2 size={18} />
                          </button>
                       </div>
                    </div>

                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-10 leading-relaxed line-clamp-3 italic">
                       {p.objetivoGeneral}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-10">
                       <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                          <span className="text-[9px] font-black text-slate-600 uppercase">Necesidades</span>
                          <span className="text-xl font-black text-white">{p.registrosNecesidades.length}</span>
                       </div>
                       <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                          <span className="text-[9px] font-black text-slate-600 uppercase">DANE</span>
                          <span className="text-sm font-black text-slate-300 truncate">{p.codigoDane}</span>
                       </div>
                    </div>

                    <div className="mt-auto flex gap-4">
                       <button 
                        onClick={() => exportPDF(p)}
                        className="flex-1 flex items-center justify-center gap-3 bg-white/5 hover:bg-white text-white hover:text-slate-900 py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all border border-white/10 uppercase"
                       >
                          <Download size={16} /> PDF
                       </button>
                       <button 
                        onClick={() => exportExcel(p)}
                        className="flex-1 flex items-center justify-center gap-3 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all border border-emerald-500/20 uppercase"
                       >
                          <FileSpreadsheet size={16} /> Excel
                       </button>
                    </div>
                 </div>
              </div>
            ))}
         </div>
      </div>

      {/* Sub-form Modal for Necesidades */}
      {isSubFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 select-none">
           <div className="absolute inset-0 bg-[#020617]/95 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setIsSubFormOpen(false)}></div>
           <div className="relative z-10 w-full max-w-5xl bg-slate-900 border-2 border-white/10 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-500 max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-slate-900/80 backdrop-blur-md">
                 <div className="flex items-center gap-6">
                    <div className="bg-emerald-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-900/20">
                       <PlusCircle size={28} strokeWidth={3} />
                    </div>
                    <div>
                       <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">Estructurar Necesidad</h3>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Configuración técnica de acción e impacto institucional</p>
                    </div>
                 </div>
                 <button onClick={() => setIsSubFormOpen(false)} className="w-12 h-12 rounded-2xl bg-white/5 text-slate-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-inner">
                    <X size={24} />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Necesidad Priorizada *</label>
                       {getOpportunitiesList().length > 0 ? (
                         <select 
                           name="necesidadPriorizada"
                           value={currentNecesidad.necesidadPriorizada}
                           onChange={handleSubInputChange}
                           className="executive-input w-full px-6 h-14"
                         >
                            <option value="">SELECCIONE UNA OPCIÓN...</option>
                            {getOpportunitiesList().map((opt, i) => (
                              <option key={i} value={opt}>{opt}</option>
                            ))}
                         </select>
                       ) : (
                         <input 
                           type="text"
                           name="necesidadPriorizada"
                           value={currentNecesidad.necesidadPriorizada}
                           onChange={handleSubInputChange}
                           className="executive-input w-full px-6 h-14"
                           placeholder="ESCRIBA LA NECESIDAD..."
                         />
                       )}
                    </div>
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Meta Institucional *</label>
                       <input 
                         type="text"
                         name="metas"
                         value={currentNecesidad.metas}
                         onChange={handleSubInputChange}
                         className="executive-input w-full px-6 h-14"
                         placeholder="DEFINA EL LOGRO TÉCNICO..."
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Acciones de Desarrollo</label>
                       <textarea 
                         name="accionesDesarrollo"
                         value={currentNecesidad.accionesDesarrollo}
                         onChange={handleSubInputChange}
                         className="executive-input w-full p-6 min-h-[120px] resize-none"
                         placeholder="PASOS OPERATIVOS..."
                       />
                    </div>
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Armonización Curricular (Área)</label>
                       <textarea 
                         name="armonizacionCurricular"
                         value={currentNecesidad.armonizacionCurricular}
                         onChange={handleSubInputChange}
                         className="executive-input w-full p-6 min-h-[120px] resize-none"
                         placeholder="ARTICULACION CON DISCIPLINAS..."
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-white/5 pt-10">
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Productos o Evidencias</label>
                       <textarea 
                         name="productosEvidencias"
                         value={currentNecesidad.productosEvidencias}
                         onChange={handleSubInputChange}
                         className="executive-input w-full p-6 min-h-[100px] resize-none"
                         placeholder="ENTREGABLES VERIFICABLES..."
                       />
                    </div>
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Recursos</label>
                       <textarea 
                         name="recursos"
                         value={currentNecesidad.recursos}
                         onChange={handleSubInputChange}
                         className="executive-input w-full p-6 min-h-[100px] resize-none"
                         placeholder="MEDIOS Y MATERIALES..."
                       />
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Responsables</label>
                    <input 
                      type="text"
                      name="responsables"
                      value={currentNecesidad.responsables}
                      onChange={handleSubInputChange}
                      className="executive-input w-full px-6 h-14"
                      placeholder="LÍDERES DE EJECUCIÓN..."
                    />
                 </div>

                 <div className="p-8 bg-slate-950 rounded-[2.5rem] border border-white/5">
                    <div className="flex items-center gap-4 mb-8">
                       <Calendar size={20} className="text-blue-500" />
                       <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Cronograma de Actividades</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 items-end">
                       <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Nueva Actividad</label>
                          <input 
                            type="text"
                            value={currentCronograma.actividad}
                            onChange={e => setCurrentCronograma({...currentCronograma, actividad: e.target.value})}
                            className="executive-input w-full h-12 text-xs"
                            placeholder="DESCRIPCIÓN BREVE..."
                          />
                       </div>
                       <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Fecha Programada</label>
                          <input 
                            type="date"
                            value={currentCronograma.fecha}
                            onChange={e => setCurrentCronograma({...currentCronograma, fecha: e.target.value})}
                            className="executive-input w-full h-12 text-xs uppercase"
                          />
                       </div>
                       <button 
                        type="button"
                        onClick={addCronogramaActivity}
                        className="h-12 bg-blue-600 text-white font-black rounded-xl text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 uppercase"
                       >
                          Añadir al Listado
                       </button>
                    </div>

                    <div className="space-y-3">
                       {currentNecesidad.cronograma?.map((c, i) => (
                         <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group/cron">
                            <div className="flex items-center gap-4">
                               <div className="w-2 h-2 rounded-full bg-blue-500" />
                               <span className="text-xs font-bold text-white uppercase italic tracking-wider">{c.actividad}</span>
                               <span className="text-[10px] font-black text-slate-500 uppercase font-mono">[{c.fecha}]</span>
                            </div>
                            <button onClick={() => removeCronogramaActivity(i)} className="text-rose-500/40 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover/cron:opacity-100">
                               <Trash2 size={14} />
                            </button>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Seguimiento y Evaluación</label>
                       <textarea 
                         name="accionesSeguimiento"
                         value={currentNecesidad.accionesSeguimiento}
                         onChange={handleSubInputChange}
                         className="executive-input w-full p-6 min-h-[100px] resize-none"
                         placeholder="CÓMO SE MEDIRÁ EL ÉXITO..."
                       />
                    </div>
                    <div className="flex flex-col gap-3">
                       <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 italic">Observaciones Generales</label>
                       <textarea 
                         name="observaciones"
                         value={currentNecesidad.observaciones}
                         onChange={handleSubInputChange}
                         className="executive-input w-full p-6 min-h-[100px] resize-none"
                         placeholder="NOTAS ADICIONALES..."
                       />
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t border-white/5 shrink-0 bg-slate-900/80 backdrop-blur-md flex gap-4">
                 <button 
                  onClick={saveNecesidad}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-[2rem] text-sm tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/30 uppercase active:scale-[0.98]"
                 >
                    Consolidar en la Matriz
                 </button>
              </div>
           </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          if (onConfirm) onConfirm();
        }}
        message={confirmMessage}
        isDangerous
      />
    </div>
  );
}
