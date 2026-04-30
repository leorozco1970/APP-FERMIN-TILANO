import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, deleteDoc, doc, orderBy, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Reporte } from '../lib/types';
import { PERIODOS, GRADOS, DOCENTES } from '../lib/constants';
import { LOGO_BASE64 } from '../lib/logo';
import { Search, Download, Trash2, ChevronDown, ChevronUp, AlertCircle, FileOutput, Edit2, AlertTriangle, TrendingDown, AlertOctagon, Presentation, BrainCircuit } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS, getPerfectTableStyles } from '../lib/pdfUtils';
import { EditReporteModal } from '../components/EditReporteModal';
import { useCustomLists } from '../hooks/useCustomLists';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';

import { useNotification } from '../context/NotificationContext';
import { PageHeader } from '../components/PageHeader';
import { PasswordModal } from '../components/PasswordModal';
import { NoDataModal } from '../components/NoDataModal';

export function Registros() {
  const { notify } = useNotification();
  const { docentes: customDocentes, areas: customAreas } = useCustomLists();

  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [matriculas, setMatriculas] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingReporte, setEditingReporte] = useState<Reporte | null>(null);

  // Filters
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroDocente, setFiltroDocente] = useState('');
  const [filtroGrado, setFiltroGrado] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroAcciones, setFiltroAcciones] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isNoDataModalOpen, setIsNoDataModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'warning'>('success');
  const [modalMessage, setModalMessage] = useState('');

  useEffect(() => {
    let unsubscribeReportes: () => void = () => {};
    let unsubscribeMatriculas: () => void = () => {};

    const setupListeners = () => {
      const q = query(collection(db, 'reportes'), orderBy('createdAt', 'desc'));
      
      unsubscribeReportes = onSnapshot(q, (snapshot) => {
        const data: Reporte[] = [];
        snapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() } as Reporte);
        });
        setReportes(data);
        setLoading(false);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'reportes');
        setLoading(false);
      });

      unsubscribeMatriculas = onSnapshot(collection(db, 'matriculas'), (snapshot) => {
        const data: Record<string, number> = {};
        snapshot.forEach(doc => {
          data[doc.id] = doc.data().totalEstudiantes || 0;
        });
        setMatriculas(data);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'matriculas');
      });
    };

    if (auth.currentUser) {
      setupListeners();
    } else {
      const authUnsub = auth.onAuthStateChanged((user) => {
        if (user) {
          setupListeners();
          authUnsub();
        } else {
          setLoading(false);
          authUnsub();
        }
      });
      return () => {
        authUnsub();
        unsubscribeReportes();
        unsubscribeMatriculas();
      };
    }

    return () => {
      unsubscribeReportes();
      unsubscribeMatriculas();
    };
  }, []);

  const [passwordModalConfig, setPasswordModalConfig] = useState<{
    type: 'admin' | 'docente';
    teacherName?: string;
  }>({ type: 'admin' });

  const isDirectivo = localStorage.getItem('userRole') === 'directivo';

  const handleDelete = async (id: string) => {
    const reporte = reportes.find(r => r.id === id);
    const currentUser = auth.currentUser;
    const teacherName = localStorage.getItem('teacherName')?.toUpperCase();
    const isOwner = reporte && (
      (reporte.authorUid && currentUser && reporte.authorUid === currentUser.uid) || 
      (reporte.docente && teacherName && reporte.docente.toUpperCase() === teacherName)
    );

    if (!isDirectivo && !isOwner) {
      setModalType('error');
      setModalMessage("NO TIENE PERMISOS PARA ELIMINAR ESTE REPORTE.");
      setIsMessageModalOpen(true);
      return;
    }

    setConfirmMessage("¿ESTÁ SEGURO DE ELIMINAR ESTE REPORTE? ESTA ACCIÓN ES IRREVERSIBLE.");
    setOnConfirm(() => async () => {
      try {
        setLoading(true);
        await deleteDoc(doc(db, 'reportes', id));
        setModalType('success');
        setModalMessage('REPORTE ELIMINADO CORRECTAMENTE.');
        setIsMessageModalOpen(true);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `reportes/${id}`);
      } finally {
        setLoading(false);
      }
    });

    setPendingAction(() => () => setIsConfirmOpen(true));
    setPasswordModalConfig({
       type: isDirectivo ? 'admin' : 'docente',
       teacherName: teacherName || undefined
    });
    setIsPasswordModalOpen(true);
  };

  const handleDeleteAll = async () => {
    if (!isDirectivo) return;
    setConfirmMessage("¿ESTÁ SEGURO DE ELIMINAR TODOS LOS REPORTES ACADÉMICOS? ESTA ACCIÓN ES IRREVERSIBLE.");
    setOnConfirm(() => async () => {
      try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, 'reportes'));
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        setModalType('success');
        setModalMessage('TODOS LOS REPORTES HAN SIDO ELIMINADOS.');
        setIsMessageModalOpen(true);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'reportes');
      } finally {
        setLoading(false);
      }
    });
    setPendingAction(() => () => setIsConfirmOpen(true));
    setPasswordModalConfig({
       type: 'admin'
    });
    setIsPasswordModalOpen(true);
  };

  const handleEdit = (reporte: Reporte) => {
    const teacherName = localStorage.getItem('teacherName')?.toUpperCase();
    const isDirectivo = localStorage.getItem('userRole') === 'directivo';
    
    setPendingAction(() => () => setEditingReporte(reporte));
    setPasswordModalConfig({
       type: isDirectivo ? 'admin' : 'docente',
       teacherName: teacherName || undefined
    });
    setIsPasswordModalOpen(true);
  };

  const filteredReportes = useMemo(() => {
    return reportes.filter(r => {
      const matchPeriodo = filtroPeriodo ? r.periodo === filtroPeriodo : true;
      const matchDocente = filtroDocente ? r.docente === filtroDocente : true;
      const matchGrado = filtroGrado ? r.grado === filtroGrado : true;
      const matchArea = filtroArea ? r.area === filtroArea : true;
      const matchAcciones = filtroAcciones === '' ? true 
        : filtroAcciones === 'con_acciones' ? r.accionesMejoramiento && r.accionesMejoramiento.some(a => a.realizoAccion === 'Sí') 
        : filtroAcciones === 'sin_acciones' ? !r.accionesMejoramiento || !r.accionesMejoramiento.some(a => a.realizoAccion === 'Sí') 
        : true;
      
      const searchLower = busqueda.toLowerCase();
      const matchBusqueda = busqueda ? (
        r.docente.toLowerCase().includes(searchLower) ||
        r.area.toLowerCase().includes(searchLower) ||
        (r.estudiantesPreventivo && r.estudiantesPreventivo.some(e => e.toLowerCase().includes(searchLower))) ||
        (r.estudiantesPierden && r.estudiantesPierden.some(e => e.toLowerCase().includes(searchLower)))
      ) : true;

      return matchPeriodo && matchDocente && matchGrado && matchArea && matchAcciones && matchBusqueda;
    });
  }, [reportes, filtroPeriodo, filtroDocente, filtroGrado, filtroArea, busqueda, filtroAcciones]);

      const exportIndividualPDF = (reporte: Reporte) => {
    try {
      const doc = new jsPDF();
      const reportTitle = `REPORTE ACADÉMICO - ${reporte.docente}`;
      const metaInfo = `PERIODO: ${reporte.periodo} | GRADO: ${reporte.grado} | ÁREA: ${reporte.area}`;
      
      const startY = drawExecutiveHeader(doc, reportTitle, "Seguimiento individual de gestión pedagógica.", metaInfo);
      
      autoTable(doc, {
        startY: startY,
        margin: { left: PDF_MARGIN, right: PDF_MARGIN },
        head: [['CATEGORÍA', 'DETALLES / ESTUDIANTES']],
        body: [
          ['DOCENTE', reporte.docente],
          ['ÁREA', reporte.area],
          ['GRADO', reporte.grado],
          ['PERIODO', reporte.periodo],
          ['ALERTA TEMPRANA', (reporte.estudiantesPreventivo || []).join(', ') || 'NINGUNO'],
          ['DESEMPEÑO BAJO', (reporte.estudiantesPierden || []).join(', ') || 'NINGUNO'],
          ['ESTRATEGIAS', (reporte.estrategias || []).join(', ') || 'NINGUNO'],
          ['BARRERAS', (reporte.barreras || []).join(', ') || 'NINGUNO'],
        ],
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, textColor: 255 },
        styles: { fontSize: 9, cellPadding: 4 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("FIRMA DEL DOCENTE:", PDF_MARGIN, finalY);
      doc.line(PDF_MARGIN, finalY + 15, PDF_MARGIN + 60, finalY + 15);
      doc.setFontSize(8);
      doc.text(reporte.docente.toUpperCase(), PDF_MARGIN, finalY + 20);

      drawExecutiveFooter(doc, 1, 1);
      doc.save(`Reporte_${reporte.grado}_${reporte.area}_${reporte.docente}.pdf`);
    } catch (e) {
      console.error(e);
      notify.error("Error al exportar reporte individual.");
    }
  };

  const exportToPDF = () => {
    if (filteredReportes.length === 0) {
      setIsNoDataModalOpen(true);
      return;
    }

    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      const arrayFiltros = [];
      if (filtroPeriodo) arrayFiltros.push(`PERIODO: ${filtroPeriodo}`);
      if (filtroGrado) arrayFiltros.push(`GRADO: ${filtroGrado}`);
      if (filtroDocente) arrayFiltros.push(`DOCENTE: ${filtroDocente.toUpperCase()}`);
      if (filtroArea) arrayFiltros.push(`ÁREA: ${filtroArea.toUpperCase()}`);
      
      const metaInfo = arrayFiltros.length > 0 ? arrayFiltros.join('   |   ') : '';

      // Header called initially
      const startY = drawExecutiveHeader(doc, "SEGUIMIENTO ACADÉMICO INSTITUCIONAL", INTRO_TEXTS.SEGUIMIENTO_ACADEMICO, metaInfo);

      let currentY = startY;

      const headers = [[
        '#',
        'DOCENTE',
        'PER.',
        'GRADO',
        'ÁREA / ASIGNATURA',
        'ALERTA TEMPRANA',
        'DESEMPEÑO BAJO',
        'ACC.',
        'APR.',
        'NOTA',
        '% REP.'
      ]];

      let totalPreventivo = 0;
      let totalReprueban = 0;
      const rows: any[] = [];
      let counter = 1;

      filteredReportes.forEach(r => {
        const preventivos = (r.estudiantesPreventivo || []).slice().sort();
        const reprueban = (r.estudiantesPierden || []).slice().sort();
        
        const finalPreventivos = preventivos.length > 0 ? preventivos : [''];
        const finalReprueban = reprueban.length > 0 ? reprueban : [''];
        
        const maxLines = Math.max(finalPreventivos.length, finalReprueban.length);
        const preventivoCount = r.estudiantesPreventivo?.length || 0;
        
        let repruebanDespuesDeAccionesCount = 0;
        if (r.estudiantesPierden) {
          r.estudiantesPierden.forEach(est => {
            const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
            if (!accion || accion.aprobo !== 'Sí') {
              repruebanDespuesDeAccionesCount++;
            }
          });
        }
        
        totalPreventivo += preventivoCount;
        totalReprueban += repruebanDespuesDeAccionesCount;

        const pct = r.totalEstudiantes > 0 ? ((repruebanDespuesDeAccionesCount) / r.totalEstudiantes * 100).toFixed(1) + '%' : '0.0%';

        for (let i = 0; i < maxLines; i++) {
          const prevName = finalPreventivos[i] || '';
          const repName = finalReprueban[i] || '';
          
          let acc = '';
          let app = '';
          let nota = '';

          if (repName && repName !== '') {
             const accion = r.accionesMejoramiento?.find(a => a.estudiante === repName);
             if (accion) {
                acc = accion.realizoAccion || 'No';
                app = accion.aprobo || '-';
                nota = accion.nota || '-';
             } else {
                acc = 'No';
                app = '-';
                nota = '-';
             }
          } else {
             acc = '-';
             app = '-';
             nota = '-';
          }

          if (i === 0) {
             rows.push([
                { content: String(counter++), rowSpan: maxLines, styles: { halign: 'center' } },
                { content: String(r.docente || '').toUpperCase(), rowSpan: maxLines },
                { content: String(r.periodo || ''), rowSpan: maxLines, styles: { halign: 'center' } },
                { content: String(r.grado || ''), rowSpan: maxLines, styles: { halign: 'center' } },
                { content: String(r.area || '').toUpperCase(), rowSpan: maxLines },
                prevName.toUpperCase(),
                repName.toUpperCase(),
                { content: acc, styles: { halign: 'center' } },
                { content: app, styles: { halign: 'center' } },
                { content: nota, styles: { halign: 'center' } },
                { content: pct, rowSpan: maxLines, styles: { fontStyle: 'bold', halign: 'center' } }
             ]);
          } else {
             rows.push([
                prevName.toUpperCase(),
                repName.toUpperCase(),
                { content: acc, styles: { halign: 'center' } },
                { content: app, styles: { halign: 'center' } },
                { content: nota, styles: { halign: 'center' } }
             ]);
          }
        }
      });

      // Add Total Row
      rows.push([
        { content: 'CONSOLIDADO TOTAL ACUMULADO INSTITUCIONAL', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: totalPreventivo.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] } },
        { content: totalReprueban.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] } },
        { content: '', colSpan: 4, styles: { fillColor: [240, 240, 240] } }
      ]);

      autoTable(doc, {
        startY: currentY,
        ...getPerfectTableStyles(),
        head: headers,
        body: rows,
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 40 },
          2: { cellWidth: 10 },
          3: { cellWidth: 15 },
          4: { cellWidth: 35 },
          5: { cellWidth: 45 },
          6: { cellWidth: 45 },
          7: { cellWidth: 12 },
          8: { cellWidth: 12 },
          9: { cellWidth: 12 },
          10: { cellWidth: 15 }
        },
        didDrawPage: (data) => {
          doc.setPage(data.pageNumber);
          drawExecutiveFooter(doc, data.pageNumber, (doc.internal as any).getNumberOfPages());
        }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 15;

      // consolidated summary metrics - Using real enrollment data
      const totalStudents = filtroGrado 
        ? (matriculas[filtroGrado] || 0)
        : Object.values(matriculas).reduce((a, b) => a + b, 0);
        
      const totalAlerts = totalPreventivo;
      const totalFinalFailing = totalReprueban;
      const avgFailureRate = totalStudents > 0 ? (totalFinalFailing / totalStudents * 100).toFixed(1) : '0.0';
      
      const allBarreras = filteredReportes.flatMap(r => r.barreras || []);
      const countBarreras: Record<string, number> = {};
      allBarreras.forEach(b => countBarreras[b] = (countBarreras[b] || 0) + 1);
      const sortedBarreras = Object.entries(countBarreras).sort((a, b) => b[1] - a[1]);
      const topBarrera = sortedBarreras.length > 0 ? sortedBarreras[0][0] : "N/A";

      // Draw Summary Box
      if (finalY > pageHeight - 100) {
        doc.addPage();
        finalY = drawExecutiveHeader(doc, "RESUMEN ANALÍTICO DE GESTIÓN ACADÉMICA");
      }

      // Elegant background and border
      doc.setDrawColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
      doc.setLineWidth(0.5);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(PDF_MARGIN, finalY, pageWidth - (PDF_MARGIN * 2), 35, 2, 2, 'FD');

      // Title bar
      doc.setFillColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
      doc.rect(PDF_MARGIN + 5, finalY + 4, 3, 3, 'F'); 
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
      doc.text("RESUMEN ANALÍTICO DE GESTIÓN ACADÉMICA", PDF_MARGIN + 12, finalY + 7);

      // Data Grid
      const colW = (pageWidth - (PDF_MARGIN * 2)) / 4;
      const dataY = finalY + 18;
      
      const renderMetric = (label: string, value: string, x: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(PDF_COLORS.TEXT_DARK_GRAY[0], PDF_COLORS.TEXT_DARK_GRAY[1], PDF_COLORS.TEXT_DARK_GRAY[2]);
        doc.text(label.toUpperCase(), x, dataY);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(0, 0, 0);
        doc.text(value.toUpperCase(), x, dataY + 8);
      };

      renderMetric("POBLACIÓN TOTAL", `${totalStudents} ESTUDIANTES`, PDF_MARGIN + 12);
      renderMetric("ALERTAS TEMPRANAS", `${totalAlerts} REGISTROS`, PDF_MARGIN + 12 + colW);
      renderMetric("% DESEMPEÑO BAJO", `${avgFailureRate}% PROMEDIO`, PDF_MARGIN + 12 + (colW * 2));
      
      const cleanBarrera = topBarrera.length > 28 ? topBarrera.substring(0, 25) + '...' : topBarrera;
      renderMetric("PRINCIPAL BARRERA", cleanBarrera, PDF_MARGIN + 12 + (colW * 3));

      finalY += 45;
      
      // Signatures
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

      // --- SIGNATURES START ---
      let signatureY = finalY;
      const pageWidthActual = doc.internal.pageSize.width;

      if (signatureY > pageHeight - 65) {
        doc.addPage();
        drawExecutiveHeader(doc, "CONSOLIDADO DE GESTIÓN PEDAGÓGICA");
        signatureY = 45;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DOCENTES:", PDF_MARGIN, signatureY + 5);
      signatureY += 15;

      // Identify teachers who registered (if filtered)
      let teachersToSign: string[] = [...DOCENTES].sort();
      if (filtroGrado || filtroDocente || filtroArea) {
        const reportingTeachers = new Set(filteredReportes.map(r => r.docente.toUpperCase()));
        teachersToSign = Array.from(reportingTeachers).sort();
      }

      const sigCols = 3;
      const sigLineW = 60;
      const sigSpacingX = (pageWidthActual - 2 * PDF_MARGIN - sigCols * sigLineW) / (sigCols - 1);
      const sigRowHeight = 30;
      let sigCurrentY = signatureY;

      for (let i = 0; i < teachersToSign.length; i++) {
        const col = i % sigCols;
        if (col === 0 && sigCurrentY > pageHeight - 35) {
            doc.addPage();
            drawExecutiveHeader(doc, "CONSOLIDADO DE GESTIÓN PEDAGÓGICA");
            sigCurrentY = 45;
        }
        const x = PDF_MARGIN + col * (sigLineW + sigSpacingX);
        const y = sigCurrentY + 10;
        doc.line(x, y, x + sigLineW, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(teachersToSign[i].toUpperCase(), x + sigLineW / 2, y + 4, { align: 'center' });
        if (col === sigCols - 1 || i === teachersToSign.length - 1) {
            sigCurrentY += sigRowHeight;
        }
      }

      // Rector Centered at the end
      if (sigCurrentY > pageHeight - 45) {
        doc.addPage();
        drawExecutiveHeader(doc, "CONSOLIDADO DE GESTIÓN PEDAGÓGICA");
        sigCurrentY = 45;
      } else {
        sigCurrentY += 5;
      }

      const directorX = pageWidthActual / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.line(directorX - 40, sigCurrentY + 15, directorX + 40, sigCurrentY + 15);
      doc.text("MANUEL MALDONADO", directorX, sigCurrentY + 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("RECTOR INSTITUCIONAL", directorX, sigCurrentY + 25, { align: "center" });
      // --- SIGNATURES END ---

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pageCount);
      }

      doc.save(`Consolidado_Gestion_Pedagogica_${new Date().toISOString().split('T')[0]}.pdf`);
      setError(null);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError("Hubo un error al generar el documento institucional.");
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-800 p-4 rounded-lg flex items-center gap-2">
        <AlertCircle size={20} />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="REGISTRO DOCENTE"
        description="Consulte, edite y elimine los reportes académicos enviados por los docentes. Utilice los filtros para encontrar rápidamente la información que necesita."
        imageUrl="https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&q=80&w=800"
      >
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={exportToPDF}
            disabled={filteredReportes.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 uppercase text-[11px] tracking-widest"
          >
            <FileOutput size={18} />
            Exportar Consolidado
          </button>
          {isDirectivo && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-6 py-2.5 rounded-xl font-bold transition-all border border-rose-500/20 uppercase text-[11px] tracking-widest"
            >
              <Trash2 size={18} />
              Borrar Registros
            </button>
          )}
        </div>
      </PageHeader>

      <div className="executive-card overflow-hidden flex flex-col border-white/5" style={{ maxHeight: '65vh' }}>
        <div className="p-6 border-b border-white/5 bg-[#1e1e1e]/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Buscar por docente, área o estudiante..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="executive-input w-full pl-10 pr-4 py-2.5"
            />
          </div>
          <select
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            className="executive-input w-full px-4 py-2.5"
          >
            <option value="" className="bg-[#1A1A1A]">TODOS LOS PERIODOS</option>
            {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">PERIODO {p}</option>)}
          </select>
          <select
            value={filtroDocente}
            onChange={(e) => setFiltroDocente(e.target.value)}
            className="executive-input w-full px-4 py-2.5"
          >
            <option value="" className="bg-[#1A1A1A]">TODOS LOS DOCENTES</option>
            {[...customDocentes].sort().map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d}</option>)}
          </select>
          <select
            value={filtroGrado}
            onChange={(e) => setFiltroGrado(e.target.value)}
            className="executive-input w-full px-4 py-2.5"
          >
            <option value="" className="bg-[#1A1A1A]">TODOS LOS GRADOS</option>
            {GRADOS.map(g => <option key={g} value={g} className="bg-[#1A1A1A]">{g}</option>)}
          </select>
          <select
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            className="executive-input w-full px-4 py-2.5"
          >
            <option value="" className="bg-[#1A1A1A]">TODAS LAS ASIGNATURAS</option>
            {[...customAreas]
              .filter(a => !a.toUpperCase().includes('TODAS LAS'))
              .sort()
              .map(a => <option key={a} value={a} className="bg-[#1A1A1A]">{a}</option>)}
          </select>
          <select
            value={filtroAcciones}
            onChange={(e) => setFiltroAcciones(e.target.value)}
            className="executive-input w-full px-4 py-2.5"
          >
            <option value="" className="bg-[#1A1A1A]">Filtrar por Acción</option>
            <option value="con_acciones" className="bg-[#1A1A1A]">Con acciones de mejora</option>
            <option value="sin_acciones" className="bg-[#1A1A1A]">Sin acciones de mejora</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar bg-[#1A1A1A]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#002366] sticky top-0 z-10 shadow-xl">
              <tr>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em]">Docente</th>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em]">Grado</th>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em]">Área</th>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em] text-center">Alerta Temprana</th>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em] text-center">Desempeño Bajo</th>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em] text-center">% REP.</th>
                <th className="py-5 px-6 text-[10px] font-bold text-white uppercase tracking-[0.2em] text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredReportes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-24 text-center">
                    <div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-white/5 mb-4">
                      <Search className="text-slate-600" size={32} />
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[11px]">Sin registros encontrados</p>
                  </td>
                </tr>
              ) : (
                filteredReportes.map((reporte, idx) => (
                  <React.Fragment key={reporte.id}>
                    <tr className={`${idx % 2 === 0 ? 'bg-[#1A1A1A]' : 'bg-[#222222]'} hover:bg-white/5 transition-colors group border-white/5`}>
                      <td className="py-4 px-6 text-sm text-slate-300 font-bold uppercase tracking-tight">{reporte.docente}</td>
                      <td className="py-4 px-6 text-sm text-slate-400 font-medium tracking-widest">{reporte.grado}</td>
                      <td className="py-4 px-6 text-sm text-slate-400 font-medium tracking-tight uppercase">{reporte.area}</td>
                      <td className="py-4 px-6 text-sm text-center">
                        <span className="inline-flex items-center gap-1.5 justify-center px-4 py-1.5 text-[10px] font-black text-amber-400 bg-amber-400/10 rounded-full border border-amber-400/20 shadow-[0_0_15px_-5px_rgba(251,191,36,0.3)]">
                          <AlertTriangle size={12} />
                          {reporte.estudiantesPreventivo?.length || 0}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-center">
                        <span className="inline-flex items-center gap-1.5 justify-center px-4 py-1.5 text-[10px] font-black text-rose-400 bg-rose-400/10 rounded-full border border-rose-400/20 shadow-[0_0_15px_-5px_rgba(244,63,94,0.3)]">
                          <TrendingDown size={12} />
                        {(() => {
                          let repruebanDespuesDeAccionesCount = 0;
                          if (reporte.estudiantesPierden) {
                            reporte.estudiantesPierden.forEach(est => {
                              const accion = reporte.accionesMejoramiento?.find(a => a.estudiante === est);
                              if (!accion || accion.aprobo !== 'Sí') {
                                repruebanDespuesDeAccionesCount++;
                              }
                            });
                          }
                          return repruebanDespuesDeAccionesCount;
                        })()}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-center font-black text-white/80 tracking-widest">
                        {(() => {
                           let repruebanDespuesDeAccionesCount = 0;
                           if (reporte.estudiantesPierden) {
                             reporte.estudiantesPierden.forEach(est => {
                               const accion = reporte.accionesMejoramiento?.find(a => a.estudiante === est);
                               if (!accion || accion.aprobo !== 'Sí') {
                                 repruebanDespuesDeAccionesCount++;
                               }
                             });
                           }
                           return reporte.totalEstudiantes > 0 ? ((repruebanDespuesDeAccionesCount) / reporte.totalEstudiantes * 100).toFixed(1) + '%' : '0.0%';
                        })()}
                      </td>
                      <td className="py-4 px-6 text-sm text-right flex justify-end gap-2">
                        <button
                          onClick={() => setExpandedId(expandedId === reporte.id ? null : reporte.id!)}
                          className={`p-2.5 rounded-xl transition-all ${expandedId === reporte.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-blue-400 hover:bg-white/5'}`}
                          title="Desplegar Detalles"
                        >
                          {expandedId === reporte.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                        <button
                          onClick={() => exportIndividualPDF(reporte)}
                          className="p-2.5 text-slate-500 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-all"
                          title="Descargar PDF"
                        >
                          <Download size={20} strokeWidth={1.5} />
                        </button>
                        {(isDirectivo || 
                          (reporte.authorUid && auth.currentUser && reporte.authorUid === auth.currentUser.uid) || 
                          (reporte.docente && localStorage.getItem('teacherName') && reporte.docente.toUpperCase() === localStorage.getItem('teacherName')?.toUpperCase())) && (
                          <>
                            <button
                              onClick={() => handleEdit(reporte)}
                              className="p-2.5 text-slate-500 hover:text-emerald-400 hover:bg-white/5 rounded-xl transition-all"
                              title="Editar"
                            >
                              <Edit2 size={20} strokeWidth={1.5} />
                            </button>
                            <button
                               onClick={() => {
                                 setPendingAction(() => () => handleDelete(reporte.id!));
                                 setConfirmMessage("¿ESTÁ SEGURO DE ELIMINAR ESTE REPORTE?");
                                 setIsConfirmOpen(true);
                               }}
                              className="p-2.5 text-slate-500 hover:text-rose-400 hover:bg-white/5 rounded-xl transition-all"
                              title="Borrar"
                            >
                              <Trash2 size={20} strokeWidth={1.5} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {expandedId === reporte.id && (
                      <tr className="bg-[#0f172a]/50 backdrop-blur-sm">
                        <td colSpan={8} className="py-10 px-10 border-b border-white/5">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            <div className="bg-[#1A1A1A] p-6 rounded-3xl border border-white/5 flex flex-col h-full shadow-2xl">
                              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-white/5">
                                <AlertTriangle className="text-amber-400" size={16} />
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Corte Preventivo</h4>
                              </div>
                              {(!reporte.estudiantesPreventivo || reporte.estudiantesPreventivo.length === 0) ? (
                                <p className="text-xs text-slate-600 italic mt-auto">Sin registros</p>
                              ) : (
                                <ul className="list-disc pl-4 text-[13px] text-slate-300 font-bold space-y-2 marker:text-blue-500">
                                  {reporte.estudiantesPreventivo.slice().sort().map((est, i) => (
                                    <li key={i} className="uppercase tracking-tight leading-snug">{est}</li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div className="bg-[#1A1A1A] p-6 rounded-3xl border border-white/5 flex flex-col h-full shadow-2xl">
                              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-white/5">
                                <AlertOctagon className="text-rose-400" size={16} />
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Desempeño Bajo</h4>
                              </div>
                              {(!reporte.estudiantesPierden || reporte.estudiantesPierden.length === 0) ? (
                                <p className="text-xs text-slate-600 italic mt-auto">Sin registros</p>
                              ) : (
                                <ul className="list-disc pl-4 text-[13px] text-slate-300 font-black space-y-2 marker:text-rose-500">
                                  {reporte.estudiantesPierden.slice().sort().map((est, i) => (
                                    <li key={i} className="uppercase tracking-tight leading-snug">{est}</li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div className="bg-[#1A1A1A] p-6 rounded-3xl border border-white/5 flex flex-col h-full shadow-2xl">
                              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-white/5">
                                <Presentation className="text-blue-400" size={16} />
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estrategias</h4>
                              </div>
                              {(!reporte.estrategias || reporte.estrategias.length === 0) ? (
                                <p className="text-xs text-slate-600 italic mt-auto">Sin registros</p>
                              ) : (
                                <ul className="list-disc pl-4 text-[13px] text-slate-300 font-bold space-y-2 marker:text-blue-400">
                                  {reporte.estrategias.slice().sort().map((est, i) => (
                                    <li key={i} className="leading-snug">{est}</li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div className="bg-[#1A1A1A] p-6 rounded-3xl border border-white/5 flex flex-col h-full shadow-2xl">
                              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-white/5">
                                <BrainCircuit className="text-emerald-400" size={16} />
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Barreras</h4>
                              </div>
                              {(!reporte.barreras || reporte.barreras.length === 0) ? (
                                <p className="text-xs text-slate-600 italic mt-auto">Sin registros</p>
                              ) : (
                                <ul className="list-disc pl-4 text-[13px] text-slate-300 font-bold space-y-2 marker:text-emerald-400">
                                  {reporte.barreras.slice().sort().map((b, i) => (
                                    <li key={i} className="leading-snug">{b}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                          
                          {(reporte.accionesMejoramiento && reporte.accionesMejoramiento.length > 0) && (
                            <div className="mt-8 pt-8 border-t border-white/5">
                              <h4 className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.4em] mb-6 drop-shadow-sm">Consolidado de Acciones de Mejoramiento</h4>
                              <div className="overflow-hidden rounded-3xl border border-white/5 shadow-2xl">
                                <table className="w-full text-left text-sm border-collapse">
                                  <thead className="bg-[#1e1e1e]">
                                    <tr>
                                      <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Estudiante</th>
                                      <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Acción</th>
                                      <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle</th>
                                      <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5 bg-[#1A1A1A]">
                                    {reporte.accionesMejoramiento.slice().sort((a,b) => a.estudiante.localeCompare(b.estudiante)).map((acc, i) => (
                                      <tr key={i} className="hover:bg-white/5 transition-colors">
                                        <td className="py-3 px-6 text-slate-300 font-bold uppercase tracking-tight text-xs">{acc.estudiante}</td>
                                        <td className="py-3 px-6 text-center">
                                          <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${acc.realizoAccion === 'Sí' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                            {acc.realizoAccion}
                                          </span>
                                        </td>
                                        <td className="py-3 px-6 text-slate-400 italic text-[11px] leading-relaxed">{acc.accionRealizada || '-'}</td>
                                        <td className="py-3 px-6 text-center">
                                          {acc.aprobo ? (
                                            <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${acc.aprobo === 'Sí' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                              {acc.aprobo}
                                            </span>
                                          ) : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Table */}
      <div className="executive-card overflow-hidden flex flex-col border-white/5">
        <div className="p-8 border-b border-white/5 bg-[#1e1e1e]/50">
          <h3 className="text-[18px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2">Resumen Estratégico de Datos</h3>
          <p className="text-[12px] font-medium text-slate-500 uppercase tracking-tight leading-relaxed">Consolidado institucional según segmentación aplicada en los parámetros de búsqueda.</p>
        </div>
        <div className="overflow-x-auto bg-[#1A1A1A]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#1e1e1e] border-b border-white/5">
              <tr>
                <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Docente</th>
                <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Periodo</th>
                <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grado</th>
                <th className="py-4 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Área/Asignatura</th>
                <th className="py-4 px-6 text-[10px] font-bold text-amber-500 uppercase tracking-widest text-center">Alerta Temprana</th>
                <th className="py-4 px-6 text-[10px] font-bold text-rose-500 uppercase tracking-widest text-center">Desempeño Bajo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredReportes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-600 text-[11px] font-bold uppercase tracking-widest">No hay datos consolidados proyectados.</td>
                </tr>
              ) : (
                filteredReportes.map((r, idx) => (
                  <tr key={`summary-${r.id}`} className={`${idx % 2 === 0 ? 'bg-[#1A1A1A]' : 'bg-[#222222]'} hover:bg-white/5`}>
                    <td className="py-3 px-6 text-[11px] text-slate-300 font-bold uppercase tracking-tight">{r.docente}</td>
                    <td className="py-3 px-6 text-[11px] text-slate-400 font-bold">{r.periodo}</td>
                    <td className="py-3 px-6 text-[11px] text-slate-400 font-bold">{r.grado}</td>
                    <td className="py-3 px-6 text-[11px] text-slate-300 font-bold uppercase tracking-tighter">{r.area}</td>
                    <td className="py-3 px-6 text-[11px] text-center font-black text-amber-400">{r.estudiantesPreventivo?.length || 0}</td>
                    <td className="py-3 px-6 text-[11px] text-center font-black text-rose-400">
                      {(() => {
                        let count = 0;
                        if (r.estudiantesPierden) {
                          r.estudiantesPierden.forEach(est => {
                            const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
                            if (!accion || accion.aprobo !== 'Sí') count++;
                          });
                        }
                        return count;
                      })()}
                    </td>
                  </tr>
                ))
              )}
              {filteredReportes.length > 0 && (
                <tr className="bg-[#002366] font-bold">
                  <td colSpan={4} className="py-5 px-6 text-[10px] text-right text-white uppercase tracking-[0.3em]">Consolidado Total Acumulado:</td>
                  <td className="py-5 px-6 text-sm text-center text-white font-black drop-shadow-lg">
                    {filteredReportes.reduce((sum, r) => sum + (r.estudiantesPreventivo?.length || 0), 0)}
                  </td>
                  <td className="py-5 px-6 text-sm text-center text-white font-black drop-shadow-lg">
                    {filteredReportes.reduce((sum, r) => {
                      let count = 0;
                      if (r.estudiantesPierden) {
                        r.estudiantesPierden.forEach(est => {
                          const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
                          if (!accion || accion.aprobo !== 'Sí') count++;
                        });
                      }
                      return sum + count;
                    }, 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {editingReporte && (
        <EditReporteModal
          reporte={editingReporte}
          onClose={() => setEditingReporte(null)}
          onSuccess={() => setEditingReporte(null)}
        />
      )}

      <NoDataModal 
        isOpen={isNoDataModalOpen} 
        onClose={() => setIsNoDataModalOpen(false)} 
      />
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={() => {
          if (pendingAction) pendingAction();
        }}
        passwordType={passwordModalConfig.type}
        teacherName={passwordModalConfig.teacherName}
      />
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
          if (onConfirm) onConfirm();
          setIsConfirmOpen(false);
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
