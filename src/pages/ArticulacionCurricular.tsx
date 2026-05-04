import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ArticulacionCurricularData, ProyectoPedagogico } from '../lib/types';
import { useCustomLists } from '../hooks/useCustomLists';
import { Save, Trash2, Download, Edit, FileText, Link2, Eye, Sparkles, Layers, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PasswordModal } from '../components/PasswordModal';
import { drawExecutiveHeader, drawExecutiveFooter, PDF_COLORS, PDF_MARGIN } from '../lib/pdfUtils';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useNotification } from '../context/NotificationContext';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { isValidUrl } from '../lib/urlUtils';

const ESTADOS = ['En Diseño', 'En Implementación', 'En Evaluación Formativa'];
const ARMONIZACIONES = [
  'Proyectos Educativos Institucionales (PEI)',
  'Proyectos Educativos Comunitarios (PEC)',
  'Proyectos Educativos Comunitarios Interculturales (PECI)',
  'Proyectos Institucionales de Educación Campesina y Rural (PIECR)'
];
const ENFOQUES_CRESE = ['Ciudadana', 'Para la Reconciliación', 'Antirracista', 'Socioemocional', 'Acción Climática'];

const INITIAL_CONVERGENCIA = [
  { elemento: 'Misión', meta: 'Somos una Institución Educativa Rural comprometida con la formación integral e inclusiva de niños, niñas, adolescentes y jóvenes del campo colombiano, fomentando el pensamiento crítico, la autonomía y el respeto por el medio ambiente, para contribuir al desarrollo sostenible del territorio.', accion: '' },
  { elemento: 'Visión', meta: 'Para el año 2029, seremos reconocidos como una Institución Educativa líder en innovación pedagógica rural, ejemplo de convivencia armónica y excelencia académica, formando ciudadanos completen que lideren procesos de transformación social y productiva en sus comunidades.', accion: '' },
  { elemento: 'MODELO DE ESTRATEGIA PEDAGÓGICA', meta: 'El modelo pretende la formación de personas como sujetos activos de su propio aprendizaje, bajo un enfoque constructivista y crítico-social, donde la experiencia y el contexto rural son el eje transversal de la construcción del conocimiento.', accion: '' },
  { elemento: 'Valores Institucionales', meta: 'Nuestra gestión se fundamenta en un tejido de valores que incluyen la Honestidad, la Responsabilidad, el Respeto por la Diferencia, la Solidaridad y la Perseverancia, entendidos como los pilares de nuestra convivencia ciudadana.', accion: '' },
  { elemento: 'Proyecto Institucional Ey, convive bien', meta: 'Constituye como el eje estratégico de armonización escolar, integrando las dimensiones de convivencia, paz y ciudadanía, mediante protocolos de mediación y diálogo que garantizan un entorno seguro y protector para toda la comunidad.', accion: '' }
];

const getInitialFormData = () => ({
  proyectoId: '',
  nombreEstrategia: '',
  docente: '',
  area: '',
  modelo: '',
  modalidad: '',
  objetivo: '',
  fechaRegistro: new Date().toISOString().split('T')[0],
  estado: '',
  armonizacion: '',
  enfoqueCrese: [],
  areasArticuladas: [],
  matrizConvergencia: INITIAL_CONVERGENCIA.map(item => ({ ...item })),
  sostenibilidad: '',
  riesgos: '',
  avalInstitucional: false,
  enlaceSoporte: ''
});

export function ArticulacionCurricular() {
  const { notify } = useNotification();
  const { areas: customAreas } = useCustomLists();
  
  const [proyectos, setProyectos] = useState<ProyectoPedagogico[]>([]);
  const [articulaciones, setArticulaciones] = useState<ArticulacionCurricularData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<ArticulacionCurricularData>>(getInitialFormData());

    // localStorage sync removed to prevent stale data

  const isDirectivo = localStorage.getItem('userRole') === 'directivo';
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [passwordModalConfig, setPasswordModalConfig] = useState<{
    type: 'admin' | 'docente';
    teacherName?: string;
  }>({ type: 'admin' });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

  // Draft Persistence
  useEffect(() => {
    const saved = localStorage.getItem('articulacion_draft');
    if (saved) setFormData(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('articulacion_draft', JSON.stringify(formData));
  }, [formData]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Proyectos
      const qProy = query(collection(db, 'proyectos_pedagogicos'), orderBy('createdAt', 'desc'));
      const snapProy = await getDocs(qProy);
      setProyectos(snapProy.docs.map(d => ({ id: d.id, ...d.data() } as ProyectoPedagogico)));

      // Fetch Articulaciones
      const qArt = query(collection(db, 'articulacion_curricular'));
      const snapArt = await getDocs(qArt);
      const data = snapArt.docs.map(d => ({ id: d.id, ...d.data() } as ArticulacionCurricularData));
      
      const sorted = data.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setArticulaciones(sorted);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'articulacion_curricular');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectProyecto = (id: string) => {
    if (!id) {
      setFormData(getInitialFormData());
      return;
    }
    const p = proyectos.find(x => x.id === id);
    if (p) {
      setFormData(prev => ({
        ...prev,
        proyectoId: id,
        nombreEstrategia: p.nombreEstrategia,
        docente: p.docente,
        area: p.area,
        modelo: p.tipoEstrategia || '',
        modalidad: p.modalidad || '-',
        objetivo: p.objetivo || '',
      }));
    }
  };

  const handleEdit = (art: ArticulacionCurricularData) => {
    const teacherName = localStorage.getItem('teacherName')?.toUpperCase();
    setPendingAction(() => () => {
      setEditingId(art.id!);
      setFormData(art);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    setPasswordModalConfig({ type: isDirectivo ? 'admin' : 'docente', teacherName: teacherName });
    setIsPasswordModalOpen(true);
  };

  const handleDelete = (art: ArticulacionCurricularData) => {
    const teacherName = localStorage.getItem('teacherName')?.toUpperCase();
    const isOwner = art.docente?.toUpperCase() === teacherName;
    if (!isDirectivo && !isOwner) {
      notify.error("No tiene permisos para eliminar esta articulación.");
      return;
    }
    setConfirmMessage(`¿ELIMINAR ARTICULACIÓN DE "${art.nombreEstrategia.toUpperCase()}"?`);
    setOnConfirm(() => async () => {
      try {
        await deleteDoc(doc(db, 'articulacion_curricular', art.id!));
        await fetchData();
        notify.success('Articulación eliminada.');
      } catch (error: any) {
        handleFirestoreError(error, OperationType.DELETE, `articulacion_curricular/${art.id}`);
      }
    });
    setPendingAction(() => () => setIsConfirmOpen(true));
    setPasswordModalConfig({ type: isDirectivo ? 'admin' : 'docente', teacherName: teacherName });
    setIsPasswordModalOpen(true);
  };

  const toggleArrayItem = (field: 'enfoqueCrese', item: string) => {
    setFormData(prev => {
      const cur = (prev[field] as string[]) || [];
      const updated = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item];
      return { ...prev, [field]: updated };
    });
  };

  const toggleAreaArticulada = (area: string) => {
    setFormData(prev => {
      const current = prev.areasArticuladas || [];
      const exists = current.find(a => a.area === area);
      if (exists) {
        return { ...prev, areasArticuladas: current.filter(a => a.area !== area) };
      } else {
        return { ...prev, areasArticuladas: [...current, { area, descripcion: '' }] };
      }
    });
  };

  const updateAreaDescripcion = (area: string, descripcion: string) => {
    setFormData(prev => ({
      ...prev,
      areasArticuladas: (prev.areasArticuladas || []).map(a => 
        a.area === area ? { ...a, descripcion: descripcion.toUpperCase() } : a
      )
    }));
  };

  const updateMatriz = (index: number, value: string) => {
    setFormData(prev => {
      const newMatriz = [...(prev.matrizConvergencia || [])];
      newMatriz[index] = { ...newMatriz[index], accion: value };
      return { ...prev, matrizConvergencia: newMatriz };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || isSaving) return;
    setIsSaving(true);
    
    try {
      // Clean data for Firestore: ensure no undefined values
      const cleanData: any = {
        proyectoId: formData.proyectoId || '',
        nombreEstrategia: formData.nombreEstrategia || '',
        docente: formData.docente || '',
        area: formData.area || '',
        modelo: formData.modelo || '',
        modalidad: formData.modalidad || '',
        objetivo: formData.objetivo || '',
        fechaRegistro: formData.fechaRegistro || new Date().toISOString().split('T')[0],
        estado: formData.estado || '',
        armonizacion: formData.armonizacion || '',
        enfoqueCrese: formData.enfoqueCrese || [],
        areasArticuladas: formData.areasArticuladas || [],
        matrizConvergencia: formData.matrizConvergencia || INITIAL_CONVERGENCIA,
        sostenibilidad: formData.sostenibilidad || '',
        riesgos: formData.riesgos || '',
        avalInstitucional: formData.avalInstitucional || false,
        enlaceSoporte: formData.enlaceSoporte || '',
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'articulacion_curricular', editingId), cleanData);
        await fetchData();
        notify.success('¡ACTUALIZACIÓN EXITOSA! Los cambios se han sincronizado.');
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'articulacion_curricular'), {
          ...cleanData,
          authorUid: auth.currentUser.uid,
          authorEmail: auth.currentUser.email || '',
          createdAt: serverTimestamp()
        });
        await fetchData();
        notify.success('¡GUARDADO EXITOSO! La articulación ya está en el consolidado institucional.');
      }
      
      setFormData(getInitialFormData());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      console.error("Error saving articulation:", e);
      handleFirestoreError(e, editingId ? OperationType.UPDATE : OperationType.CREATE, 'articulacion_curricular');
    } finally {
      setIsSaving(false);
    }
  };

  const exportPDF = (a: ArticulacionCurricularData) => {
    const doc = new jsPDF();
    const introText = "El presente informe detalla la articulación y armonización curricular de la estrategia pedagógica implementada en la Institución Educativa Fermín Tilano. En estricta alineación con los lineamientos del Programa de Tutorías para el Aprendizaje y la Formación Integral (PTAFI 3.0), este documento evidencia cómo dicha iniciativa trasciende la actividad aislada para consolidarse como un verdadero tejido pedagógico.\n\nA través del análisis técnico de su matriz de convergencia con el Horizonte Institucional (PEI), la transversalidad de los componentes de la Educación CRESE (Ciudadana, para la Reconciliación, Antirracista, Socioemocional y Acción Climática) y su articulación interdisciplinar, este reporte ofrece una visión clara sobre el impacto de la estrategia en las trayectorias de los estudiantes. El objetivo es garantizar que esta práctica pedagógica mantenga su pertinencia, sostenibilidad y coherencia con la misión de brindar una educación integral y de calidad.";
    
    const metaInfo = `CENTRO DE INTERÉS: ${a.nombreEstrategia.toUpperCase()} | DOCENTE: ${a.docente.toUpperCase()}`;
    const nextY = drawExecutiveHeader(doc, "ARTICULACIÓN Y ARMONIZACIÓN CURRICULAR", introText, metaInfo);
    
    autoTable(doc, {
      startY: nextY + 5,
      head: [['IDENTIFICACIÓN Y NATURALEZA DE LA ESTRATEGIA', '']],
      body: [
        ['ESTRATEGIA', a.nombreEstrategia],
        ['MODELO DE ESTRATEGIA PEDAGÓGICA', a.modelo],
        ['MODALIDAD DE LA ESTRATEGIA PEDAGÓGICA', a.modalidad],
        ['COORDINADOR', a.docente],
        ['ÁREA', a.area],
        ['ESTADO', a.estado],
        ['ARMONIZACIÓN', a.armonizacion],
        ['ENFOQUE CRESE', a.enfoqueCrese.join(', ')],
        ['ÁREAS ARTICULADAS', a.areasArticuladas.map(aa => `${aa.area}: ${aa.descripcion}`).join(' | ')]
      ],
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY },
      styles: { fontSize: 8 }
    });

    if (a.matrizConvergencia?.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['MATRIZ DE CONVERGENCIA INSTITUCIONAL', '', '']],
        body: a.matrizConvergencia.map(m => [m.elemento, m.meta, m.accion]),
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY },
        styles: { fontSize: 8 }
      });
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['OTRAS DIMENSIONES ESTRATÉGICAS', '']],
      body: [
        ['ESTRATEGIA DE SOSTENIBILIDAD', a.sostenibilidad],
        ['RIESGOS O BARRERAS IDENTIFICADAS', a.riesgos],
        ['AVAL INSTITUCIONAL', a.avalInstitucional ? 'APROBADO POR CONSEJO DIRECTIVO Y ACADÉMICO' : 'PENDIENTE']
      ],
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY },
      styles: { fontSize: 8 }
    });

    // Signatures Section
    const sigW = 60;
    const sigH = 18;
    const pageWidth = doc.internal.pageSize.width;
    
    // Determine where to start signatures
    let sigStartY = (doc as any).lastAutoTable.finalY + 30;
    
    // Check if signatures fit on the current page
    if (sigStartY + 60 > 280) {
      doc.addPage();
      sigStartY = 40;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

    // Row 1: Docente Coordinador (Centered)
    const xDocente = (pageWidth / 2) - (sigW / 2);
    const yRow1Line = sigStartY + sigH;
    const yRow1Box = sigStartY - 5;
    
    doc.setDrawColor(220);
    doc.rect(xDocente, yRow1Box, sigW, sigH);
    doc.setFontSize(5);
    doc.setTextColor(150);
    doc.text("ESPACIO PARA FIRMA", xDocente + sigW/2, yRow1Line - 2, { align: 'center' });
    doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.line(xDocente, yRow1Line, xDocente + sigW, yRow1Line);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text(a.docente.toUpperCase(), xDocente + sigW/2, yRow1Line + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("DOCENTE COORDINADOR", xDocente + sigW/2, yRow1Line + 9, { align: 'center' });

    // Row 2: Tutor and Directivo
    const yRow2Base = yRow1Line + 30;
    const yRow2Line = yRow2Base + sigH;
    const yRow2Box = yRow2Base - 5;

    // Leonardo Orozco (Left)
    const xTutor = PDF_MARGIN + 10;
    doc.setDrawColor(220);
    doc.rect(xTutor, yRow2Box, sigW, sigH);
    doc.setFontSize(5);
    doc.setTextColor(150);
    doc.text("ESPACIO PARA FIRMA", xTutor + sigW/2, yRow2Line - 2, { align: 'center' });
    doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.line(xTutor, yRow2Line, xTutor + sigW, yRow2Line);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("LEONARDO OROZCO", xTutor + sigW/2, yRow2Line + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("TUTOR PTAFI 3.0", xTutor + sigW/2, yRow2Line + 9, { align: 'center' });

    // Manuel Maldonado (Right)
    const xDirectivo = pageWidth - PDF_MARGIN - sigW - 10;
    doc.setDrawColor(220);
    doc.rect(xDirectivo, yRow2Box, sigW, sigH);
    doc.setFontSize(5);
    doc.setTextColor(150);
    doc.text("ESPACIO PARA FIRMA", xDirectivo + sigW/2, yRow2Line - 2, { align: 'center' });
    doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.line(xDirectivo, yRow2Line, xDirectivo + sigW, yRow2Line);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("MANUEL MALDONADO", xDirectivo + sigW/2, yRow2Line + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("DIRECTIVO DOCENTE", xDirectivo + sigW/2, yRow2Line + 9, { align: 'center' });

    drawExecutiveFooter(doc, 1, 1);
    doc.save(`Articulacion_${a.nombreEstrategia}.pdf`);
  };

  const exportAllPDF = () => {
    const doc = new jsPDF();
    const introText = "El presente informe consolidado expone el estado global de la articulación y armonización curricular de los Centros de Interés y Estrategias Pedagógicas activas en la Institución Educativa Fermín Tilano. Entendiendo la escuela como un escenario vivo de aprendizaje y en el marco del Plan Nacional de Formación Integral (PTAFI 3.0), este documento gerencial mapea el despliegue del currículo en acción a nivel institucional.\n\nA lo largo de este reporte se evidencia cómo la sumatoria de las distintas modalidades de los Centros de Interés (propios, sectoriales, intersectoriales y locales) dialoga de manera estratégica con el Proyecto Educativo Institucional (PEI). Al documentar la movilización de las diferentes áreas del saber y la apropiación de los ejes de la Educación CRESE, este informe se constituye como un instrumento de decisiones curriculares.\n\nSu propósito es verificar que la institución garantice la resignificación del tiempo escolar, la sostenibilidad de sus proyectos y la consolidación de un horizonte formativo coherente, inclusivo y transformador para toda la comunidad educativa.";
    
    let nextY = drawExecutiveHeader(doc, "ARTICULACIÓN Y ARMONIZACIÓN CURRICULAR", introText);
    let startY = nextY;

    articulaciones.forEach((a, index) => {
      // Check for page overflow before adding new strategy content
      if (startY > 240) {
        doc.addPage();
        startY = drawExecutiveHeader(doc, "ARTICULACIÓN Y ARMONIZACIÓN CURRICULAR");
      }

      if (index > 0) {
        startY += 10;
        // If content after margin is too big, new page
        if (startY > 240) {
          doc.addPage();
          startY = drawExecutiveHeader(doc, "ARTICULACIÓN Y ARMONIZACIÓN CURRICULAR");
        }
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Estrategia: ${a.nombreEstrategia.toUpperCase()} - Coordinador: ${a.docente.toUpperCase()}`, PDF_MARGIN, startY);
      startY += 10;

      autoTable(doc, {
        startY: startY,
        head: [['IDENTIFICACIÓN Y NATURALEZA DE LA ESTRATEGIA', '']],
        body: [
          ['ESTRATEGIA', a.nombreEstrategia],
          ['MODELO', a.modelo],
          ['MODALIDAD', a.modalidad],
          ['COORDINADOR', a.docente],
          ['ÁREA', a.area],
          ['ESTADO', a.estado],
          ['ARMONIZACIÓN', a.armonizacion],
          ['ENFOQUE CRESE', a.enfoqueCrese.join(', ')],
          ['ÁREAS ARTICULADAS', a.areasArticuladas.map(aa => `${aa.area}: ${aa.descripcion}`).join(' | ')]
        ],
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY },
        styles: { fontSize: 8 }
      });

      if (a.matrizConvergencia?.length) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 10,
          head: [['MATRIZ DE CONVERGENCIA INSTITUCIONAL', '', '']],
          body: a.matrizConvergencia.map(m => [m.elemento, m.meta, m.accion]),
          theme: 'grid',
          headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY },
          styles: { fontSize: 8 }
        });
      }

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['SOSTENIBILIDAD Y RIESGOS', '']],
        body: [
          ['SOSTENIBILIDAD', a.sostenibilidad],
          ['RIESGOS', a.riesgos],
          ['AVAL INSTITUCIONAL', a.avalInstitucional ? 'APROBADO' : 'PENDIENTE']
        ],
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY },
        styles: { fontSize: 8 }
      });

      startY = (doc as any).lastAutoTable.finalY + 20;
    });

    // Consolidado Signatures Section
    let sigStartY = (doc as any).lastAutoTable.finalY + 30;
    const sigW = 52;
    const sigH = 18;
    const pageWidth = doc.internal.pageSize.width;
    const uniqueTeachers = Array.from(new Set(articulaciones.map(a => a.docente.toUpperCase()))).sort();
    
    // 1. Signature Header for Teachers
    if (sigStartY + 40 > 280) { doc.addPage(); sigStartY = 40; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("DOCENTES CORRESPONSABLES DEL REGISTRO", PDF_MARGIN, sigStartY);
    sigStartY += 12;

    let currentX = PDF_MARGIN;
    let currentY = sigStartY;

    uniqueTeachers.forEach((teacher, idx) => {
      // Check for row overflow (3 per row)
      if (currentX + sigW > pageWidth - PDF_MARGIN) {
        currentX = PDF_MARGIN;
        currentY += sigH + 18;
      }
      
      // Page break check
      if (currentY + sigH + 10 > 280) {
        doc.addPage();
        currentY = 40;
        currentX = PDF_MARGIN;
      }

      doc.setDrawColor(220);
      doc.rect(currentX, currentY, sigW, sigH);
      doc.setFontSize(4);
      doc.setTextColor(180);
      doc.text("ESPACIO PARA FIRMA", currentX + sigW/2, currentY + sigH - 2, { align: 'center' });
      doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
      doc.line(currentX, currentY + sigH, currentX + sigW, currentY + sigH);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
      doc.text(teacher, currentX + sigW/2, currentY + sigH + 4, { align: 'center' });
      
      currentX += sigW + 12;
    });

    // 2. Instituional Final Signatures (Tutor and Directivo)
    let instY = currentY + sigH + 30;
    if (instY + 45 > 280) { doc.addPage(); instY = 40; }
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("AVAL Y SEGUIMIENTO INSTITUCIONAL", PDF_MARGIN, instY);
    instY += 12;

    const signatureWidth = 65;
    const xTutor = PDF_MARGIN;
    const xDirectivo = pageWidth - PDF_MARGIN - signatureWidth;
    
    // Tutor
    doc.setDrawColor(220);
    doc.rect(xTutor, instY, signatureWidth, 20);
    doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.line(xTutor, instY + 20, xTutor + signatureWidth, instY + 20);
    doc.setFontSize(8);
    doc.text("LEONARDO OROZCO", xTutor + signatureWidth/2, instY + 25, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("TUTOR PTAFI 3.0", xTutor + signatureWidth/2, instY + 29, { align: 'center' });

    // Directivo
    doc.rect(xDirectivo, instY, signatureWidth, 20);
    doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.line(xDirectivo, instY + 20, xDirectivo + signatureWidth, instY + 20);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("MANUEL MALDONADO", xDirectivo + signatureWidth/2, instY + 25, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("DIRECTIVO DOCENTE", xDirectivo + signatureWidth/2, instY + 29, { align: 'center' });

    drawExecutiveFooter(doc, 1, 1);
    doc.save(`Consolidado_Institucional_FERMIN_TILANO.pdf`);
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      <PageHeader 
        title="ARTICULACIÓN Y ARMONIZACIÓN CURRICULAR"
        description="Conecte sus estrategias con el tejido curricular institucional y el enfoque CRESE."
        imageUrl="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=2070&auto=format&fit=crop"
      />

      <div className="executive-card overflow-hidden bg-slate-900/40 border-white/5 backdrop-blur-xl">
        <div className="p-10 bg-gradient-to-br from-blue-900/20 to-transparent border-b border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-widest italic">1. Identificación y Naturaleza de la Estrategia</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 italic">Sincronización con el territorio y diversidad Institucional</p>
          </div>
          {editingId && (
            <button 
              onClick={() => { setEditingId(null); setFormData(getInitialFormData()); }}
              className="text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Cancelar Edición
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-12">
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic leading-tight">SELECCIONAR ESTRATEGIA PEDAGÓGICA</label>
                 </div>
                 <select 
                   value={formData.proyectoId} 
                   onChange={(e) => handleSelectProyecto(e.target.value)}
                   className="executive-input w-full"
                   required
                 >
                    <option value="">ELIJA ESTRATEGIA (SELECCIONE)...</option>
                    {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombreEstrategia}</option>)}
                 </select>
              </div>
              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic leading-tight">DOCENTE COORDINADOR</label>
                 </div>
                 <input value={formData.docente || ''} readOnly placeholder="AUTODETECTADO..." className="executive-input w-full bg-white/5 text-slate-400 font-bold italic" />
              </div>
              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic leading-tight">ÁREA</label>
                 </div>
                 <input value={formData.area || ''} readOnly placeholder="AUTODETECTADO..." className="executive-input w-full bg-white/5 text-slate-400 font-bold italic" />
              </div>
              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic leading-tight">FECHA DE REGISTRO</label>
                 </div>
                 <input value={formData.fechaRegistro} readOnly className="executive-input w-full bg-white/5 text-slate-400 font-bold italic" />
              </div>

              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic tracking-wider leading-tight">MODELO DE ESTRATEGIA PEDAGÓGICA</label>
                 </div>
                 <input value={formData.modelo} readOnly className="executive-input w-full bg-white/5 text-blue-400 font-black italic" />
              </div>
              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic tracking-wider leading-tight">MODALIDAD DE LA ESTRATEGIA PEDAGÓGICA</label>
                 </div>
                 <input value={formData.modalidad} readOnly className="executive-input w-full bg-white/5 text-blue-400 font-black italic" />
              </div>
              <div className="space-y-3">
                 <div className="h-10 flex items-end">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic tracking-wider leading-tight">GRADOS IMPACTADOS</label>
                 </div>
                 <input value={formData.grados?.join(', ') || '-'} readOnly className="executive-input w-full bg-white/5 text-blue-400 font-black italic" />
              </div>
              <div className="space-y-3">
                <div className="h-10 flex items-end">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic tracking-wider leading-tight">ESTADO DE LA ESTRATEGIA</label>
                </div>
                <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} className="executive-input w-full border-blue-500/30" required>
                   <option value="">SELECCIONE...</option>
                   {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
           </div>

           <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Objetivo de la Estrategia</label>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/5 text-slate-400 italic text-sm leading-relaxed">
                 {formData.objetivo || 'Sin objetivo definido'}
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block italic">Armonización Institucional</label>
                 <select 
                   value={formData.armonizacion} 
                   onChange={e => setFormData({...formData, armonizacion: e.target.value})} 
                   className="executive-input w-full" 
                   required
                 >
                    <option value="">SELECCIONE...</option>
                    {ARMONIZACIONES.map(arm => <option key={arm} value={arm}>{arm}</option>)}
                 </select>
              </div>
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 italic">
                   <Link2 size={16} className="text-blue-400" /> Enlace al Documento/Carpeta Soporte (Drive/Evidencias)
                 </label>
                 <div className="flex gap-4">
                   <input 
                     value={formData.enlaceSoporte} 
                     onChange={e => setFormData({...formData, enlaceSoporte: e.target.value})} 
                     className="executive-input flex-1 py-6 text-blue-400 font-mono text-sm" 
                     placeholder="HTTPS://DRIVE.GOOGLE.COM/..." 
                   />
                   {formData.enlaceSoporte && (
                     <div className="flex gap-2">
                       <a 
                         href={formData.enlaceSoporte} 
                         target="_blank" 
                         rel="noreferrer" 
                         className="p-6 bg-white/5 text-slate-400 hover:text-blue-400 rounded-2xl border border-white/10 transition-all flex items-center justify-center"
                         title="VER DOCUMENTO"
                       >
                         <Eye size={24} />
                       </a>
                       <button 
                         type="button"
                         onClick={() => {
                           const newUrl = prompt("Editar URL del documento:", formData.enlaceSoporte);
                           if (newUrl !== null) setFormData({...formData, enlaceSoporte: newUrl});
                         }}
                         className="p-6 bg-white/5 text-slate-400 hover:text-emerald-400 rounded-2xl border border-white/10 transition-all flex items-center justify-center"
                         title="EDITAR LINK"
                       >
                         <Edit size={24} />
                       </button>
                       <button 
                         type="button"
                         onClick={() => setFormData({...formData, enlaceSoporte: ''})}
                         className="p-6 bg-white/5 text-slate-400 hover:text-rose-500 rounded-2xl border border-white/10 transition-all flex items-center justify-center"
                         title="BORRAR LINK"
                       >
                         <Trash2 size={24} />
                       </button>
                     </div>
                   )}
                 </div>
              </div>
           </div>

           <div className="p-8 bg-black/20 rounded-[2.5rem] border border-white/5 space-y-8">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                 <Sparkles className="text-blue-400" size={20} /> Enfoque Educación CRESE
              </h3>
              <div className="flex flex-wrap gap-4">
                 {ENFOQUES_CRESE.map(enf => (
                   <label key={enf} className="flex items-center gap-3 bg-white/5 px-6 py-4 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all group">
                      <input 
                        type="checkbox" 
                        checked={formData.enfoqueCrese?.includes(enf)}
                        onChange={() => toggleArrayItem('enfoqueCrese', enf)}
                        className="w-6 h-6 rounded-lg border-white/20 bg-transparent text-blue-600 focus:ring-blue-600 cursor-pointer transition-all"
                      />
                      <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest group-hover:text-blue-400 transition-colors">{enf}</span>
                   </label>
                 ))}
              </div>
           </div>

           <div className="space-y-6">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Articulación Interdisciplinar</label>
              <div className="flex flex-wrap gap-3">
                 {customAreas.map(area => {
                   const selected = formData.areasArticuladas?.find(a => a.area === area);
                   return (
                     <button 
                       key={area} type="button" 
                       onClick={() => toggleAreaArticulada(area)}
                       className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all border ${selected ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/20' : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10'}`}
                     >
                       {area}
                     </button>
                   );
                 })}
              </div>

              {formData.areasArticuladas && formData.areasArticuladas.length > 0 && (
                <div className="mt-8 grid grid-cols-1 gap-4">
                  {formData.areasArticuladas.map((art, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row gap-4 items-start md:items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="min-w-[150px] text-[10px] font-black text-emerald-400 uppercase tracking-widest">{art.area}</div>
                      <input 
                        type="text"
                        value={art.descripcion}
                        onChange={e => updateAreaDescripcion(art.area, e.target.value)}
                        className="executive-input flex-1 py-2 text-sm italic"
                        placeholder={`DESCRIBA LA ARTICULACIÓN CON ${art.area}...`}
                      />
                    </div>
                  ))}
                </div>
              )}
           </div>

           <div className="space-y-10">
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-black text-white uppercase tracking-widest italic">Matriz de Convergencia Institucional</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-l-4 border-blue-600 pl-4">Alineación estratégica con el Horizonte Institucional</p>
              </div>
              <div className="space-y-6">
                 {formData.matrizConvergencia?.map((row, idx) => (
                   <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white/5 p-8 rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-colors">
                      <div className="space-y-4">
                         <div className="flex items-center gap-3">
                            <div className="w-2 h-8 bg-blue-600 rounded-full" />
                            <span className="text-[11px] font-black text-blue-400 uppercase tracking-widest">{row.elemento}</span>
                         </div>
                         <p className="text-[13px] text-slate-400 leading-relaxed italic pr-4">{row.meta}</p>
                      </div>
                      <textarea 
                        className="executive-input w-full min-h-[120px] p-6 text-lg" 
                        placeholder="Despliegue de Acción Directa..." 
                        value={row.accion}
                        onChange={e => updateMatriz(idx, e.target.value.toUpperCase())}
                      />
                   </div>
                 ))}
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrategia de Sostenibilidad</label>
                 <textarea value={formData.sostenibilidad} onChange={e => setFormData({...formData, sostenibilidad: e.target.value})} className="executive-input w-full min-h-[150px] p-6 italic" placeholder="¿Cómo se mantendrá en el tiempo?" />
              </div>
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Riesgos o Barreras Identificadas</label>
                 <textarea value={formData.riesgos} onChange={e => setFormData({...formData, riesgos: e.target.value})} className="executive-input w-full min-h-[150px] p-6 italic" placeholder="Ej. Falta de conectividad, cruce de horarios..." />
              </div>
           </div>

            <div className={`p-10 rounded-[3rem] border-2 transition-all duration-1000 relative overflow-hidden group shadow-2xl ${formData.avalInstitucional ? 'bg-emerald-600/5 border-emerald-500/40 shadow-emerald-900/40' : 'bg-slate-900/60 border-white/5 shadow-black/60'}`}>
               <div className="absolute top-0 right-0 p-12 opacity-[0.03] transition-transform duration-[2000ms] group-hover:scale-125 group-hover:rotate-12 pointer-events-none">
                  <CheckCircle2 size={240} className={formData.avalInstitucional ? 'text-emerald-500' : 'text-white'} />
               </div>

               <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-10">
                  <div className="flex flex-col gap-4 min-w-[280px]">
                    <label className={`text-[11px] font-black uppercase tracking-[0.3em] transition-colors duration-500 ${formData.avalInstitucional ? 'text-emerald-400' : 'text-slate-500'}`}>
                      Estado del Aval Institucional
                    </label>
                    <div className="relative group/select w-full lg:w-48">
                      <select 
                        value={formData.avalInstitucional ? 'true' : 'false'}
                        onChange={e => setFormData({...formData, avalInstitucional: e.target.value === 'true'})}
                        className={`w-full py-5 px-8 rounded-3xl text-xl font-black uppercase tracking-widest cursor-pointer transition-all duration-500 border-2 appearance-none outline-none ${formData.avalInstitucional ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-xl shadow-emerald-600/30' : 'bg-slate-950 text-white border-white/10 hover:border-white/20'}`}
                      >
                         <option value="false">NO</option>
                         <option value="true">SÍ</option>
                      </select>
                      <div className={`absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-500 ${formData.avalInstitucional ? 'text-slate-950' : 'text-slate-500'}`}>
                        <Sparkles size={20} className={formData.avalInstitucional ? 'animate-pulse' : ''} />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      <h4 className={`text-4xl font-black uppercase tracking-tight transition-all duration-1000 italic ${formData.avalInstitucional ? 'text-emerald-400 translate-x-0' : 'text-slate-600 -translate-x-2'}`}>
                        Aval Institucional
                      </h4>
                      {formData.avalInstitucional && (
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full animate-in zoom-in duration-700">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Validado</span>
                        </div>
                      )}
                    </div>

                    <div className="h-20 overflow-hidden relative">
                       {formData.avalInstitucional ? (
                         <div className="flex flex-col gap-3 animate-in slide-in-from-top-4 duration-700">
                            <span className="text-[14px] font-bold text-emerald-500/60 uppercase tracking-widest italic leading-tight">
                              Estrategia oficializada por los siguientes estamentos:
                            </span>
                            <div className="flex flex-wrap gap-2">
                               {['CONSEJO ACADÉMICO', 'EQUIPO DINAMIZADOR', 'CONSEJO DIRECTIVO'].map((body, i) => (
                                 <span key={i} className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black rounded-xl shadow-lg shadow-emerald-950/40 border border-white/10 uppercase tracking-wider backdrop-blur-md">
                                   {body}
                                 </span>
                               ))}
                            </div>
                         </div>
                       ) : (
                         <div className="space-y-3 animate-in fade-in duration-1000">
                            <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-xl italic">
                              Este registro requiere la aprobación obligatoria de los estamentos directivos para su plena validez en la vigencia académica actual.
                            </p>
                            <div className="flex items-center gap-2 text-rose-500/50">
                               <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                               <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">Estado: PENDIENTE DE APROBACIÓN</span>
                            </div>
                         </div>
                       )}
                    </div>
                  </div>
               </div>
            </div>

           <button 
             type="submit" 
             disabled={isSaving}
             className={`w-full py-8 rounded-[3.5rem] font-black text-2xl uppercase tracking-[0.4em] transition-all flex items-center justify-center gap-6 shadow-4xl group active:scale-[0.98] border-b-[12px] disabled:opacity-50 ${isSaving ? 'bg-slate-700 border-slate-900' : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-800 shadow-emerald-900/40 text-white'}`}
           >
              {isSaving ? <Loader2 size={36} className="animate-spin" /> : <Save size={36} />}
              {isSaving ? (editingId ? 'ACTUALIZAR CAMBIOS' : 'GUARDAR ARTICULACIÓN FINAL') : (editingId ? 'ACTUALIZAR ARTICULACIÓN' : 'GUARDAR ARTICULACIÓN')}
           </button>
        </form>
      </div>

      <div className="mt-16 space-y-10">
         <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 px-2">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-black text-white uppercase tracking-widest italic flex items-center gap-4">
                 <Layers className="text-blue-400" size={32} /> ARTICULACIÓN Y ARMONIZACIÓN CURRICULAR
              </h2>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest border-l-4 border-emerald-600 pl-4">Consolidado histórico de armonización institucional</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={fetchData}
                disabled={loading}
                className="flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-2xl transition-all font-black text-[11px] tracking-[0.3em] uppercase border border-white/10 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                Actualizar
              </button>
              <button 
                onClick={exportAllPDF}
                className="flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-3xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-950/40 border-b-4 border-emerald-800"
              >
                <Download size={20} /> Exportar Consolidado (TODAS)
              </button>
            </div>
         </div>
         
         <div className="space-y-4 overflow-hidden rounded-[2.5rem]">
            <div className="hidden lg:grid grid-cols-12 gap-4 px-8 py-4 bg-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest italic border-b border-white/5">
               <div className="col-span-3">Estrategia / Registro</div>
               <div className="col-span-2">Docente / Área</div>
               <div className="col-span-3">Armonización / Enfoque</div>
               <div className="col-span-4 text-right">Acciones de Gestión</div>
            </div>

            <div className="space-y-4">
               {articulaciones.map(art => (
                 <div key={art.id} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center p-8 bg-slate-900/60 border border-white/5 hover:border-emerald-500/40 transition-all group rounded-[2rem] hover:bg-slate-900/80 hover:shadow-2xl hover:shadow-emerald-900/10">
                    <div className="col-span-1 lg:col-span-3 min-w-0">
                       <h4 className="text-base font-black text-white uppercase tracking-wider mb-1 truncate group-hover:text-emerald-400 transition-colors italic">{art.nombreEstrategia}</h4>
                       <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {art.fechaRegistro}
                       </div>
                    </div>
                    
                    <div className="col-span-1 lg:col-span-2 min-w-0 border-l border-white/5 lg:pl-6">
                       <div className="text-[11px] font-black text-slate-300 uppercase truncate mb-1 italic">{art.docente}</div>
                       <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{art.area}</div>
                    </div>

                    <div className="col-span-1 lg:col-span-3 border-l border-white/5 lg:pl-4">
                       <div className="text-[10px] font-medium text-slate-400 italic mb-1 line-clamp-1">{art.armonizacion}</div>
                       <div className="flex flex-wrap gap-1">
                          {art.enfoqueCrese?.map(e => (
                             <span key={e} className="px-2 py-0.5 bg-blue-500/10 text-[8px] font-black text-blue-400 rounded-full border border-blue-500/20">{e}</span>
                          ))}
                       </div>
                    </div>

                    <div className="col-span-1 lg:col-span-4 flex items-center justify-end gap-2 border-t lg:border-t-0 lg:border-l border-white/5 pt-4 lg:pt-0 lg:pl-4">
                       <button 
                         onClick={() => exportPDF(art)} 
                         className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/10 text-emerald-400 hover:text-white hover:bg-emerald-600 rounded-xl border border-emerald-500/20 transition-all text-[9px] font-black uppercase tracking-widest"
                       >
                          <FileText size={16} /> PDF
                       </button>
                       <button onClick={() => handleEdit(art)} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-slate-400 hover:text-blue-400 rounded-xl border border-white/5 hover:bg-white/10 transition-all text-[9px] font-black uppercase tracking-widest">
                          <Edit size={16} /> Editar
                       </button>
                       <button onClick={() => handleDelete(art)} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-slate-400 hover:text-rose-400 rounded-xl border border-white/5 hover:bg-white/10 transition-all text-[9px] font-black uppercase tracking-widest">
                          <Trash2 size={16} /> Borrar
                       </button>
                    </div>
                 </div>
               ))}
            </div>
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
