import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, addDoc, query, orderBy, deleteDoc, doc, updateDoc, setDoc, getDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Target, Upload, Save, FileOutput, Trash2, Calendar, User, CheckCircle2, AlertTriangle, Lightbulb, ExternalLink, Download, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageHeader } from '../components/PageHeader';
import { InstitutionalLoading } from '../components/InstitutionalLoading';
import { LOGO_BASE64 } from '../lib/logo';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS, getPerfectTableStyles } from '../lib/pdfUtils';
import { useCustomLists } from '../hooks/useCustomLists';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { isValidUrl } from '../lib/urlUtils';

interface PFIMeta {
  id?: string;
  fecha: string;
  directivo: string;
  tutor: string;
  meta: string;
  acciones: string;
  categoria: string;
  avance: string;
  dificultad: string;
  accionesMejora: string;
  responsable: string;
  estadoAvance?: string;
  evidencia?: string;
  evidenciaNombre?: string;
  impactoArmonizacion?: string;
  dimensiones?: string[];
  createdAt?: string;
}

const CATEGORIAS = [
  "Avance en la implementación del plan de formación integral, desarrollo de los CI y Ed. CRESE",
  "Avances en la armonización y articulación curricular",
  "Gestión y adquisición de recursos para la implementación del plan de formación y desarrollo de los CI"
];

const DIMENSIONES = ['Cognitiva', 'Socio-emocional', 'Ciudadana', 'Estética/Creativa'];
const IMPACTOS = [
  'Bajo: Acción aislada sin conexión clara con el PEI.',
  'Medio: Acción alineada con los documentos institucionales.',
  'Alto: Acción totalmente articulada que genera transformación en la práctica de aula.'
];
const ESTADOS = [
  '⚪ Iniciada / Fase de Apertura',
  '🟡 En Proceso / En Ejecución',
  '🟠 En Riesgo / Requiere Ajuste',
  '🟢 Alcanzada / Meta Cumplida'
];

export function PlanFormacion() {
  const { docentes } = useCustomLists();
  const [metas, setMetas] = useState<PFIMeta[]>([]);
  const [availableMetas, setAvailableMetas] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    directivo: '',
    tutor: '',
    fecha: new Date().toISOString().split('T')[0],
    meta: '',
    acciones: '',
    categoria: '',
    avance: '',
    dificultad: '',
    accionesMejora: '',
    responsable: '',
    estadoAvance: '⚪ Iniciada / Fase de Apertura',
    evidencia: '',
    evidenciaNombre: '',
    impactoArmonizacion: '',
    dimensiones: [] as string[]
  });

  // Draft Persistence
  useEffect(() => {
    const saved = localStorage.getItem('formacion_pfi_draft');
    if (saved) {
      try {
        setFormData(JSON.parse(saved));
      } catch (e) {
        console.error("Error restoring PFI draft", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('formacion_pfi_draft', JSON.stringify(formData));
  }, [formData]);

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // For the individual meta form evidence file:
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [systemMessage, setSystemMessage] = useState<{text: string, type: 'success'|'error'} | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const showMessage = (text: string, type: 'success'|'error' = 'success') => {
    setSystemMessage({ text, type });
    setTimeout(() => setSystemMessage(null), 4000);
  };

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch individual metas
      const q = query(collection(db, 'pfi_metas'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data: PFIMeta[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as PFIMeta);
      });
      setMetas(data);

      // Fetch institutional metas from Construction PFI
      const qPFI = query(collection(db, 'construccion_pfi'), orderBy('createdAt', 'desc'));
      const snapshotPFI = await getDocs(qPFI);
      const allMetas: string[] = [];
      snapshotPFI.forEach((doc) => {
        const pfiData = doc.data();
        if (pfiData.registrosNecesidades && Array.isArray(pfiData.registrosNecesidades)) {
          pfiData.registrosNecesidades.forEach((reg: any) => {
            if (reg.metas) allMetas.push(reg.metas);
          });
        }
      });
      setAvailableMetas(Array.from(new Set(allMetas)).sort());
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'pfi_metas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    let newEstado = formData.estadoAvance;
    if (name === 'avance') {
      const val = parseInt(value);
      if (!isNaN(val)) {
        if (val <= 20) newEstado = '⚪ Iniciada / Fase de Apertura';
        else if (val <= 99) newEstado = '🟡 En Proceso / En Ejecución';
        else if (val === 100) newEstado = '🟢 Alcanzada / Meta Cumplida';
      }
    }

    setFormData(prev => ({ 
      ...prev, 
      [name]: value,
      ...(name === 'avance' ? { estadoAvance: newEstado } : {})
    }));
  };

  const handleCheckboxChange = (dim: string) => {
    setFormData(prev => ({
      ...prev,
      dimensiones: prev.dimensiones.includes(dim)
        ? prev.dimensiones.filter(d => d !== dim)
        : [...prev.dimensiones, dim]
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      setUploading(true);
      
      const storageRef = ref(storage, `pfi_evidencias/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Error uploading file:", error);
          showMessage('Error al subir el archivo.', 'error');
          setUploading(false);
          setUploadProgress(0);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData(prev => ({ 
            ...prev, 
            evidencia: downloadURL,
            evidenciaNombre: file.name
          }));
          setUploading(false);
          setUploadProgress(0);
          showMessage('Archivo subido correctamente.', 'success');
        }
      );
    }
  };

  const handleRemoveFile = () => {
    // If the user wants to remove the uploaded file before submitting or change it
    setFormData(prev => ({
      ...prev,
      evidencia: '',
      evidenciaNombre: ''
    }));
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'pfi_metas', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        showMessage('Meta actualizada exitosamente.', 'success');
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'pfi_metas'), {
          ...formData,
          authorUid: auth.currentUser?.uid || 'anonymous',
          createdAt: serverTimestamp()
        });
        showMessage(editingId ? 'Meta actualizada exitosamente.' : 'Meta registrada exitosamente.', 'success');
        setEditingId(null);
        await fetchData();
      }
      
      // Reset the ENTIRE form so it's clean for the next entry
      setFormData({
        directivo: '',
        tutor: '',
        fecha: new Date().toISOString().split('T')[0],
        meta: '',
        acciones: '',
        categoria: '',
        avance: '',
        dificultad: '',
        accionesMejora: '',
        responsable: '',
        estadoAvance: '⚪ Iniciada / Fase de Apertura',
        evidencia: '',
        evidenciaNombre: '',
        impactoArmonizacion: '',
        dimensiones: []
      });
      setFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error("Error al guardar la meta:", error);
      const operation = editingId ? OperationType.UPDATE : OperationType.CREATE;
      const path = editingId ? `pfi_metas/${editingId}` : 'pfi_metas';
      try {
        handleFirestoreError(error, operation, path);
      } catch (jsonErr: any) {
        showMessage('Error de seguridad: Revise su conexión o privilegios.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (meta: PFIMeta) => {
    if (meta.id) {
      setEditingId(meta.id);
      setFormData({
        directivo: meta.directivo || '',
        tutor: meta.tutor || '',
        fecha: meta.fecha || new Date().toISOString().split('T')[0],
        meta: meta.meta || '',
        acciones: meta.acciones || '',
        categoria: meta.categoria || '',
        avance: meta.avance || '',
        dificultad: meta.dificultad || '',
        accionesMejora: meta.accionesMejora || '',
        responsable: meta.responsable || '',
        estadoAvance: meta.estadoAvance || '⚪ Iniciada / Fase de Apertura',
        evidencia: meta.evidencia || '',
        evidenciaNombre: meta.evidenciaNombre || '',
        impactoArmonizacion: meta.impactoArmonizacion || '',
        dimensiones: meta.dimensiones || []
      });
      if (meta.evidenciaNombre) {
        setFileName(meta.evidenciaNombre);
      } else if (meta.evidencia) {
        setFileName('Enlace/Archivo adjunto');
      } else {
        setFileName(null);
      }
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDelete = async (id: string) => {
    // Avoid blocking confirm on the iframe
    try {
      await deleteDoc(doc(db, 'pfi_metas', id));
      await fetchData();
      showMessage('Meta eliminada correctamente.', 'success');
    } catch (error: any) {
      console.error("Error deleting doc:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `pfi_metas/${id}`);
      } catch (jsonErr: any) {
        showMessage('Error al eliminar la meta: Acceso denegado.', 'error');
      }
    }
  };

    const exportPDF = () => {
    try {
      if (metas.length === 0) {
        showMessage("No hay metas registradas para exportar.", 'error');
        return;
      }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const docTitle = "REPORTE DE GESTIÓN ESTRATÉGICA - P.F.I";
    const reportIntro = "Seguimiento sistemático a las metas de transferencia y apropiación curricular. Este reporte consolida el avance de los objetivos trazados en el Plan de Formación Integral (PFI), permitiendo una lectura técnica de los indicadores de aprendizaje y el fortalecimiento de las prácticas pedagógicas en el aula.";
    const startY = drawExecutiveHeader(doc, docTitle, reportIntro);

    let currentY = startY;

    const metasExport = [...metas].reverse();

      metasExport.forEach((meta, idx) => {
        const stripNonLatin = (str: any) => {
            if (!str) return 'N/A';
            let s = String(str);
            s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u2026/g, '...');
            s = s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{02000}-\u{02FFF}]/gu, '');
            return s.trim() || 'N/A';
        };
        
        const tituloMeta = `META #${idx + 1}: ${stripNonLatin(meta.meta)}`;

        autoTable(doc, {
          startY: currentY,
          head: [[{ content: tituloMeta.toUpperCase(), colSpan: 2, styles: { halign: 'left', fillColor: PDF_COLORS.PRIMARY_NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' } }]],
          body: [
            ['FECHA DE REGISTRO:', stripNonLatin(meta.fecha)],
            ['DIRECTIVO DE GESTIÓN:', stripNonLatin(meta.directivo).toUpperCase()],
            ['TUTOR PTA.FI / 3.0:', "LEONARDO OROZCO"],
            ['CATEGORÍA ESTRATÉGICA:', stripNonLatin(meta.categoria).toUpperCase()],
            ['ESTADO DE AVANCE:', `${meta.avance || 0}% (${stripNonLatin(meta.estadoAvance).toUpperCase()})`],
            ['ACCIONES EJECUTADAS:', stripNonLatin(meta.acciones).toUpperCase()],
            ['DIFICULTADES TÉCNICAS:', stripNonLatin(meta.dificultad).toUpperCase()],
            ['PLAN DE SOSTENIBILIDAD:', stripNonLatin(meta.accionesMejora).toUpperCase()],
            ['DOCENTE RESPONSABLE:', stripNonLatin(meta.responsable).toUpperCase()]
          ],
          ...getPerfectTableStyles(),
          styles: { ...getPerfectTableStyles().styles, fontSize: 7.5, cellPadding: 3 },
          rowPageBreak: 'avoid',
          columnStyles: {
            0: { cellWidth: 50, fillColor: PDF_COLORS.CLOUD_ZEBRA, fontStyle: 'bold' },
            1: { cellWidth: 'auto' }
          },
        });
        
        currentY = (doc as any).lastAutoTable.finalY + 12;
      });

    // Determine if we need a new page for signatures
    if (currentY > pageHeight - 90) {
      doc.addPage();
      currentY = 40;
    } else {
      currentY += 20;
    }

    // Directivo Signature
    doc.line(PDF_MARGIN + 5, currentY + 15, PDF_MARGIN + 75, currentY + 15);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("MANUEL MALDONADO", PDF_MARGIN + 40, currentY + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("RECTOR INSTITUCIONAL", PDF_MARGIN + 40, currentY + 24, { align: "center" });

    // Tutor Signature
    doc.line(pageWidth - PDF_MARGIN - 75, currentY + 15, pageWidth - PDF_MARGIN - 5, currentY + 15);
    doc.setFont("helvetica", "bold");
    doc.text("LEONARDO OROZCO", pageWidth - PDF_MARGIN - 40, currentY + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("TUTOR PTA.FI / 3.0", pageWidth - PDF_MARGIN - 40, currentY + 24, { align: "center" });

    // Equipo Dinamizador Section
    currentY += 45;
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 40;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EQUIPO DINAMIZADOR (DOCENTES):", PDF_MARGIN + 5, currentY);
    currentY += 12;

    const signaturesToUse = [...docentes].sort();
    const cols = 2;
    const lineW = 60;
    const spacingX = (pageWidth - 2 * PDF_MARGIN - cols * lineW) / (cols - 1);
    const rowHeight = 28;
    let sigY = currentY;

    for (let i = 0; i < signaturesToUse.length; i++) {
        const col = i % cols;
        
        if (col === 0 && sigY > pageHeight - 35) {
            doc.addPage();
            sigY = 40;
        }
        
        const x = PDF_MARGIN + col * (lineW + spacingX);
        const y = sigY;
        
        doc.line(x, y, x + lineW, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(signaturesToUse[i].toUpperCase(), x + lineW / 2, y + 4, { align: 'center' });
        
        if (col === cols - 1 || i === signaturesToUse.length - 1) {
            sigY += rowHeight;
        }
    }
    
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pageCount);
    }

    try {
      doc.save(`Seguimiento_PFI_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch(saveErr) {
      console.warn("doc.save() failed, attempting fallback...", saveErr);
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    
    showMessage("Documento PDF de seguimiento generado y descargado.", 'success');

    } catch (err: any) {
      console.error("PDF generation error: ", err);
      showMessage("Hubo un error al generar el PDF. Detalle del error localizado: " + err.message, 'error');
    }
  };

  const exportSingleMetaPDF = (meta: PFIMeta) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      const docTitle = "REPORTE DE META - PLAN DE FORMACIÓN INTEGRAL";
      const introText = "Seguimiento sistemático a las metas de transferencia y apropiación curricular. Este reporte consolida el avance de los objetivos trazados en el Plan de Formación Integral (PFI), permitiendo una lectura técnica de los indicadores de aprendizaje y el fortalecimiento de las prácticas pedagógicas en el aula.";
      
      const startY = drawExecutiveHeader(doc, docTitle, introText);

      let currentY = startY;

      const stripNonLatin = (str: any) => {
        if (!str) return 'N/A';
        let s = String(str);
        s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u2026/g, '...');
        s = s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{02000}-\u{02FFF}]/gu, '');
        return s.trim() || 'N/A';
      };

      autoTable(doc, {
        startY: currentY,
        head: [[{ content: `DETALLES ANALÍTICOS DE LA META: ${stripNonLatin(meta.meta)}`.toUpperCase(), colSpan: 2, styles: { halign: 'left', fillColor: PDF_COLORS.PRIMARY_NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' } }]],
        body: [
          ['FECHA DE SINCRONIZACIÓN:', stripNonLatin(meta.fecha)],
          ['DIRECTIVO DE GESTIÓN:', stripNonLatin(meta.directivo).toUpperCase()],
          ['TUTOR ACOMPAÑANTE PTA/FI:', "LEONARDO OROZCO"],
          ['CATEGORÍA ESTRATÉGICA:', stripNonLatin(meta.categoria).toUpperCase()],
          ['NIVEL DE AVANCE OPERATIVO:', `${meta.avance || 0}% (${stripNonLatin(meta.estadoAvance).toUpperCase()})`],
          ['DESPLIEGUE DE ACCIONES:', stripNonLatin(meta.acciones).toUpperCase()],
          ['NODOS CRÍTICOS / DIFICULTAD:', stripNonLatin(meta.dificultad).toUpperCase()],
          ['PROYECCIONES DE MEJORA:', stripNonLatin(meta.accionesMejora).toUpperCase()],
          ['DOCENTE RESPONSABLE:', stripNonLatin(meta.responsable).toUpperCase()]
        ],
        ...getPerfectTableStyles(),
        styles: { ...getPerfectTableStyles().styles, fontSize: 7.5, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 55, fillColor: PDF_COLORS.CLOUD_ZEBRA, fontStyle: 'bold' },
          1: { cellWidth: 'auto' }
        },
        margin: { left: PDF_MARGIN, right: PDF_MARGIN }
      });

      // Signatures Header Check
      currentY = (doc as any).lastAutoTable.finalY + 25;
      if (currentY > pageHeight - 110) {
        doc.addPage();
        currentY = 40;
      }

      // Main lines
      doc.line(PDF_MARGIN + 5, currentY + 15, PDF_MARGIN + 75, currentY + 15);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(stripNonLatin(meta.directivo || "DIRECTIVO DOCENTE").toUpperCase(), PDF_MARGIN + 40, currentY + 20, { align: 'center' });
      doc.setFont("helvetica", "normal");
      doc.text("EQUIPO DINAMIZADOR (LÍDER)", PDF_MARGIN + 40, currentY + 24, { align: 'center' });

      // Tutor line
      doc.line(pageWidth - PDF_MARGIN - 75, currentY + 15, pageWidth - PDF_MARGIN - 5, currentY + 15);
      doc.setFont("helvetica", "bold");
      doc.text("LEONARDO OROZCO", pageWidth - PDF_MARGIN - 40, currentY + 20, { align: 'center' });
      doc.setFont("helvetica", "normal");
      doc.text("TUTOR PTA.FI / 3.0", pageWidth - PDF_MARGIN - 40, currentY + 24, { align: 'center' });

      // Support team listing
      currentY += 45;
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = 40;
      }
      
      doc.setFont("helvetica", "bold");
      doc.text("EQUIPO DINAMIZADOR (TODOS LOS DOCENTES):", PDF_MARGIN + 5, currentY);
      currentY += 12;
      
      const sigs = [...docentes].sort();
      const sCols = 2;
      const sLineW = 60;
      const sSpacingX = (pageWidth - 2 * PDF_MARGIN - sCols * sLineW) / (sCols - 1);
      const sRowHeight = 28;
      let sigYMetas = currentY;

      for (let i = 0; i < sigs.length; i++) {
          const col = i % sCols;
          
          if (col === 0 && sigYMetas > pageHeight - 35) {
              doc.addPage();
              sigYMetas = 40;
          }

          const x = PDF_MARGIN + col * (sLineW + sSpacingX);
          const y = sigYMetas;

          doc.line(x, y, x + sLineW, y);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.text(sigs[i].toUpperCase(), x + sLineW / 2, y + 4, { align: 'center' });
          
          if (col === sCols - 1 || i === sigs.length - 1) {
              sigYMetas += sRowHeight;
          }
      }

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pageCount);
      }

      doc.save(`Meta_PFI_${meta.id?.slice(-6) || 'single'}.pdf`);
      showMessage("PDF de meta individual generado exitosamente.", 'success');
    } catch (err: any) {
      console.error(err);
      showMessage("Error fatal al generar el reporte individual.", 'error');
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full pb-20">
      {systemMessage && (
        <div className={`p-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all animate-in slide-in-from-top-4 duration-500 shadow-2xl border ${
          systemMessage.type === 'error' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
        }`}>
          {systemMessage.text}
        </div>
      )}

      <PageHeader 
        title="SEGUIMIENTO AL PLAN DE FORMACIÓN INTEGRAL"
        description="Gestione y realice seguimiento a las metas, acciones y categorización del Plan de Formación Integral de la institución."
        imageUrl="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?auto=format&fit=crop&q=80&w=800"
      />

      {loading && <InstitutionalLoading message="Auditando Plan de Formación..." />}

      <div className="executive-card p-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-8 pb-8 border-b border-white/5">
            <div className="flex items-center gap-6">
              <div className="bg-amber-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-900/20 border border-amber-400/20">
                  <Target size={28} />
              </div>
              <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Seguimiento del P.F.I</h2>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Registro y auditoría de metas estratégicas institucionales</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={fetchData}
                disabled={loading}
                className="flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-2xl transition-all font-black text-[11px] tracking-[0.3em] uppercase border border-white/10 active:scale-95 disabled:opacity-50"
                title="Actualizar Datos"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                Actualizar
              </button>

              <button 
                onClick={exportPDF}
                className="flex items-center justify-center gap-3 bg-[#0A1128] hover:bg-[#0E1B3D] text-white px-10 py-4 rounded-2xl transition-all shadow-xl font-black text-[11px] tracking-[0.3em] uppercase border border-blue-500/20 shadow-blue-900/10 hover:-translate-y-1"
              >
                <FileOutput size={20} />
                Generar Informe Ejecutivo
              </button>
            </div>
          </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-10 bg-black/20 rounded-[2.5rem] border border-white/5 relative group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />
            
            <div className="relative">
              <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-widest px-1">Líder Directivo *</label>
              <input
                type="text"
                name="directivo"
                required
                value={formData.directivo}
                onChange={handleInputChange}
                className="executive-input px-5 h-14"
                placeholder="PROPORCIONE IDENTIDAD..."
              />
            </div>
            <div className="relative">
              <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-widest px-1">Tutor PTA/F.I 3.0 *</label>
              <input
                type="text"
                name="tutor"
                required
                value={formData.tutor}
                onChange={handleInputChange}
                className="executive-input px-5 h-14"
                placeholder="PROPORCIONE IDENTIDAD..."
              />
            </div>
            <div className="relative">
              <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-widest px-1">Fecha de Registro *</label>
              <input
                type="date"
                name="fecha"
                required
                value={formData.fecha}
                onChange={handleInputChange}
                className="executive-input px-5 h-14 appearance-none"
                style={{ colorScheme: 'dark' }}
              />
            </div>
             <div className="lg:col-span-2 relative">
                <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-widest px-1">Meta Estratégica del Periodo *</label>
                <select
                  name="meta"
                  required
                  value={formData.meta}
                  onChange={handleInputChange}
                  className="executive-input px-5 h-14 uppercase font-black text-[10px] tracking-tight"
                >
                  <option value="" className="bg-[#1A1A1A]">SELECCIONAR META INSTITUCIONAL...</option>
                  {availableMetas.map((m, i) => (
                    <option key={i} value={m} className="bg-[#1A1A1A]">{m}</option>
                  ))}
                  {/* Fallback if no metas found or to allow custom if none selected */}
                  {availableMetas.length === 0 && (
                     <option value="" disabled className="bg-[#1A1A1A]">NO SE ENCONTRARON METAS EN CONSTRUCCIÓN PFI</option>
                  )}
                </select>
             </div>
            <div className="relative">
              <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-widest px-1">Estado de Avance (%) *</label>
              <div className="relative">
                <input
                  type="number"
                  name="avance"
                  min="0"
                  max="100"
                  required
                  value={formData.avance}
                  onChange={handleInputChange}
                  className="executive-input px-5 h-14 text-center pr-10"
                  placeholder="0 - 100"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-blue-500 text-sm">%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
               <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1">Categoría Operativa *</label>
               <select
                  name="categoria"
                  required
                  value={formData.categoria}
                  onChange={handleInputChange}
                  className="executive-input min-h-[70px] uppercase font-black text-[10px] tracking-tight leading-relaxed"
               >
                 <option value="" className="bg-[#1A1A1A]">SELECCIONAR CATEGORÍA...</option>
                 {CATEGORIAS.map((cat, i) => <option key={i} value={cat} className="bg-[#1A1A1A]">{cat}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1">Nivel de Madurez (Impacto) *</label>
               <select
                  name="impactoArmonizacion"
                  required
                  value={formData.impactoArmonizacion}
                  onChange={handleInputChange}
                  className="executive-input h-[70px] uppercase font-black text-[10px] tracking-tight"
               >
                 <option value="" className="bg-[#1A1A1A]">SELECCIONAR IMPACTO...</option>
                 {IMPACTOS.map((impacto, i) => <option key={i} value={impacto} className="bg-[#1A1A1A]">{impacto}</option>)}
               </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" />
                Acciones Ejecutadas (Auditables) *
              </label>
              <textarea
                name="acciones"
                required
                rows={5}
                value={formData.acciones}
                onChange={handleInputChange}
                className="executive-input px-6 py-5 text-xs font-bold leading-relaxed min-h-[160px]"
                placeholder="DETALLE LAS OPERACIONES REALIZADAS..."
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Barreras u Obstáculos Detectados *
              </label>
              <textarea
                name="dificultad"
                required
                rows={5}
                value={formData.dificultad}
                onChange={handleInputChange}
                className="executive-input px-6 py-5 text-xs font-bold leading-relaxed min-h-[160px]"
                placeholder="DESCRIBA LOS PUNTOS CRÍTICOS O BLOQUEOS..."
              />
            </div>
          </div>

          <div className="space-y-10">
            <div>
              <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1 flex items-center gap-2">
                <Lightbulb size={16} className="text-blue-500" />
                Plan de Mitigación / Acciones de Mejora *
              </label>
              <textarea
                name="accionesMejora"
                required
                rows={3}
                value={formData.accionesMejora}
                onChange={handleInputChange}
                className="executive-input px-6 py-5 text-xs font-bold min-h-[100px]"
                placeholder="ESTABLEZCA LAS ACCIONES CORRECTIVAS..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="relative">
                <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1">Líder de Acción (Responsable) *</label>
                <input
                  type="text"
                  name="responsable"
                  required
                  value={formData.responsable}
                  onChange={handleInputChange}
                  className="executive-input h-14"
                  placeholder="IDENTIDAD DEL RESPONSABLE..."
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest px-1">Protocolo de Evidencia (Link/Archivo) *</label>
                
                <div className="flex flex-col gap-3">
                  {!fileName && !uploading && (
                     <div className="flex flex-col sm:flex-row gap-3 relative">
                       <div className="flex-1 relative group">
                          <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500" size={18} />
                          <input
                            type="text"
                            name="evidencia"
                            value={formData.evidencia}
                            onChange={handleInputChange}
                            className="executive-input pl-12 h-14 text-xs"
                            placeholder="URL DE EVIDENCIA..."
                          />
                       </div>
                       <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 h-14 rounded-2xl font-black text-[10px] tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all shrink-0 active:scale-95">
                         <Upload size={18} />
                         Cargar Protocolo
                         <input 
                           type="file" 
                           className="hidden" 
                           onChange={handleFileUpload}
                           ref={fileInputRef}
                           accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                         />
                       </label>
                     </div>
                  )}

                  {uploading && (
                    <div className="bg-blue-600/5 border border-blue-500/20 rounded-2xl p-6">
                      <div className="flex justify-between text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3 px-1">
                        <span>Encriptando {fileName}...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden shadow-inner">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {fileName && !uploading && (
                    <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 group animate-in slide-in-from-right-2 duration-300">
                       <div className="flex items-center gap-4 overflow-hidden">
                         <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-500">
                            <CheckCircle2 size={24} />
                         </div>
                         <span className="text-xs font-black text-white uppercase truncate italic tracking-tight" title={fileName}>
                           {fileName}
                         </span>
                       </div>
                       <div className="flex items-center gap-3 shrink-0 ml-6">
                         {formData.evidencia && formData.evidencia.startsWith('http') && (
                            <a href={formData.evidencia} target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-blue-400 rounded-xl transition-all border border-white/10" title="Abrir Verificador">
                              <ExternalLink size={20} />
                            </a>
                         )}
                         <button type="button" onClick={handleRemoveFile} className="w-10 h-10 flex items-center justify-center bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/20" title="Eliminar Registro">
                           <Trash2 size={20} />
                         </button>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-5 pt-12 border-t border-white/5">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    directivo: '', tutor: '', fecha: new Date().toISOString().split('T')[0],
                    meta: '', acciones: '', categoria: '', avance: '', dificultad: '',
                    accionesMejora: '', responsable: '', estadoAvance: '⚪ Iniciada / Fase de Apertura',
                    evidencia: '', evidenciaNombre: '', impactoArmonizacion: '', dimensiones: []
                  });
                  setFileName(null);
                }}
                className="px-10 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-black text-[11px] tracking-[0.3em] rounded-2xl transition-all uppercase border border-white/10"
              >
                Cancelar Auditoría
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center justify-center gap-3 text-white px-12 py-4 rounded-2xl transition-all shadow-xl font-black text-[11px] tracking-[0.3em] uppercase ${
                editingId ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/20'
              } active:scale-95`}
            >
              <Save size={22} />
              {isSubmitting ? 'Encriptando...' : editingId ? 'Actualizar Meta Institucional' : 'Añadir Meta del PFI'}
            </button>
          </div>
        </form>
      </div>

      <div className="executive-card p-10">
        <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-10 italic flex items-center gap-4">
           <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
           Historial de Metas Estratégica
        </h2>
        {loading ? (
          <div className="py-24 text-center">
             <RefreshCw size={48} className="mx-auto text-blue-500 mb-6 animate-spin opacity-40" />
             <p className="text-slate-500 font-black text-[11px] tracking-[0.4em] uppercase">Accediendo a la bóveda de datos...</p>
          </div>
        ) : metas.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] bg-black/10">
            <Target size={64} className="mx-auto text-slate-800 mb-8 opacity-20" />
            <p className="text-slate-600 font-black text-[12px] tracking-[0.3em] uppercase italic px-4">No se detectan registros operativos para el Plan de Formación Integral ambiental.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {metas.map((meta) => (
              <div key={meta.id} className="bg-[#1e1e1e] border border-white/5 rounded-3xl p-8 hover:border-blue-500/30 transition-all duration-500 group relative overflow-hidden flex flex-col h-full shadow-lg">
                 <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="space-y-1">
                      <p className="text-[#D4AF37] text-[8px] font-black tracking-[0.3em] uppercase opacity-70 italic">Protocolo {meta.id?.slice(-6).toUpperCase()}</p>
                      <h3 className="text-sm font-black text-white uppercase leading-tight tracking-tight line-clamp-2 italic group-hover:text-blue-400 transition-colors">{meta.meta}</h3>
                    </div>
                    <div className={`shrink-0 px-3 py-1.5 rounded-xl text-[9px] font-black tracking-tight uppercase border ${
                      meta.avance === '100' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}>
                      {meta.avance}%
                    </div>
                 </div>

                 <div className="mt-auto space-y-6">
                   <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <Calendar size={12} className="text-blue-500/50" /> {meta.fecha}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <User size={12} className="text-blue-500/50" /> {meta.responsable?.split(' ')[0]}
                      </div>
                   </div>

                   <div className="grid grid-cols-4 gap-2">
                     <button
                       onClick={() => handleEdit(meta)}
                       className="col-span-1 h-10 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 flex items-center justify-center active:scale-95 group/edit"
                       title="Editar Meta"
                     >
                       <RefreshCw size={14} className="group-hover/edit:rotate-180 transition-transform duration-700" />
                     </button>
                     <button
                       onClick={() => meta.id && handleDelete(meta.id)}
                       className="col-span-1 h-10 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/20 flex items-center justify-center active:scale-95"
                       title="Borrar Meta"
                     >
                       <Trash2 size={14} />
                     </button>
                     <button
                        onClick={() => exportSingleMetaPDF(meta)}
                        className="col-span-1 h-10 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all border border-blue-500/20 flex items-center justify-center active:scale-95"
                        title="Generar PDF Unitario"
                      >
                        <FileOutput size={14} />
                      </button>
                      {meta.evidencia ? (
                        <a
                          href={meta.evidencia}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="col-span-1 h-10 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl transition-all border border-emerald-500/20 flex items-center justify-center active:scale-95"
                          title="Ver Evidencia"
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <div className="col-span-1 h-10 bg-white/5 text-slate-600 rounded-xl border border-white/5 flex items-center justify-center cursor-not-allowed opacity-30">
                          <ExternalLink size={14} />
                        </div>
                      )}
                   </div>
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
