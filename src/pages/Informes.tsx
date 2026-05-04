import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, deleteDoc, writeBatch, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Reporte } from '../lib/types';
import { PERIODOS, GRADOS, DOCENTES, AREAS } from '../lib/constants';
import { LOGO_BASE64 } from '../lib/logo';
import { 
  FileOutput, 
  Users, 
  Presentation, 
  ShieldCheck, 
  X, 
  RefreshCw, 
  Trash2, 
  AlertTriangle, 
  MonitorCheck,
  ChevronLeft,
  Calendar,
  Clock,
  User as UserIcon
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS, getPerfectTableStyles } from '../lib/pdfUtils';

import { PasswordModal } from '../components/PasswordModal';
import { NoDataModal } from '../components/NoDataModal';
import { PageHeader } from '../components/PageHeader';
import { useNotification } from '../context/NotificationContext';

export function Informes() {
  const { notify } = useNotification();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [matriculas, setMatriculas] = useState<Record<string, number>>({});
  const [retiradosCount, setRetiradosCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const userRole = localStorage.getItem('userRole');
  const isDirectivo = userRole === 'directivo';
  const [filtroPeriodo, setFiltroPeriodo] = useState('I');

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isNoDataModalOpen, setIsNoDataModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Historico de acceso admin logic
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const qReportes = query(collection(db, 'reportes'));
      const qMatriculas = query(collection(db, 'matriculas'));
      const qRetirados = query(collection(db, 'retirados'));

      const [snapReportes, snapMatriculas, snapRetirados] = await Promise.all([
        getDocs(qReportes),
        getDocs(qMatriculas),
        getDocs(qRetirados)
      ]);

      const reportsData: Reporte[] = snapReportes.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reporte));
      setReportes(reportsData);

      const matriculasData: Record<string, number> = {};
      snapMatriculas.forEach(doc => {
        matriculasData[doc.id] = doc.data().totalEstudiantes || 0;
      });
      setMatriculas(matriculasData);

      setRetiradosCount(snapRetirados.size);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'informes');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const q = query(collection(db, 'login_history'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLoginHistory(data as any);
      localStorage.setItem('admin_login_history_cache', JSON.stringify(data));
    } catch (err) {
      console.error("Error en bitácora:", err);
      notify.error('ERROR AL CARGAR LA BITÁCORA.');
    }
  };

  const groupedLoginHistory = useMemo(() => {
    const groups: Record<string, { nombre: string; rol: string; entries: any[] }> = {};
    loginHistory.forEach(log => {
      const name = log.nombre || log.docente || 'Colaborador';
      if (!groups[name]) {
        groups[name] = { nombre: name, rol: log.rol || 'DOCENTE', entries: [] };
      }
      groups[name].entries.push(log);
    });
    return Object.values(groups).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [loginHistory]);

  const handleDeleteHistory = async () => {
    try {
      setIsDeletingHistory(true);
      const q = query(collection(db, 'login_history'));
      const snap = await getDocs(q);
      
      const chunks = Array.from({ length: Math.ceil(snap.docs.length / 500) }, (_, i) =>
        snap.docs.slice(i * 500, (i + 1) * 500)
      );

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      
      setLoginHistory([]);
      setShowDeleteConfirm(false);
      notify.success('HISTORIAL DE ACCESOS ELIMINADO CORRECTAMENTE.');
    } catch (e) {
      console.error("Error deleting history:", e);
      notify.error('ERROR AL ELIMINAR EL HISTORIAL.');
    } finally {
      setIsDeletingHistory(false);
    }
  };

  useEffect(() => {
    if (showHistoryModal) {
      const cached = localStorage.getItem('admin_login_history_cache');
      if (cached && loginHistory.length === 0) {
        try {
          setLoginHistory(JSON.parse(cached));
        } catch (e) {
          fetchHistory();
        }
      } else {
        fetchHistory();
      }
    }
  }, [showHistoryModal]);

  useEffect(() => {
    fetchData();
  }, []);

  const getFilteredReportes = () => {
    return reportes.filter(r => r.periodo === filtroPeriodo);
  };

  const handleInformeDirectivosClick = () => {
    generarInformeDirectivos();
  };

  // Exportar Bitácora a PDF
  const generarPDFBitacora = () => {
    try {
      if (groupedLoginHistory.length === 0) {
        notify.warning('NO HAY DATOS DE AUDITORÍA PARA EXPORTAR EN ESTE MOMENTO.');
        return;
      }

      const doc = new jsPDF();
      const reportTitle = "BITÁCORA DE AUDITORÍA MAESTRA";
      const metaInfo = `FECHA DE GENERACIÓN: ${new Date().toLocaleDateString('es-CO')} | ${new Date().toLocaleTimeString('es-CO')}`;
      const introText = "El presente documento constituye el registro oficial de auditoría de accesos y autenticaciones en la plataforma institucional. Este historial garantiza la trazabilidad de las acciones realizadas por el cuerpo docente y administrativo, asegurando la integridad y el control de la información académica procesada.";
      
      const startY = drawExecutiveHeader(doc, reportTitle, introText, metaInfo);
      
      const tableData = groupedLoginHistory.map(group => [
        group.nombre.toUpperCase(),
        group.rol.toUpperCase(),
        group.entries.length,
        group.entries.map(e => {
          let date;
          if (e.timestamp?.toDate) {
            date = e.timestamp.toDate();
          } else if (e.timestamp?.seconds) {
             date = new Date(e.timestamp.seconds * 1000);
          } else {
             date = new Date(e.timestamp);
          }
          
          if (isNaN(date.getTime())) return 'FECHA NO DISPONIBLE';

          return `${date.toLocaleDateString('es-CO')} ${date.toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})}`;
        }).join('\n')
      ]);

      autoTable(doc, {
        startY: startY,
        margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 25 },
        head: [['USUARIO / COLABORADOR', 'ROL', 'CANTIDAD DE ACCESOS', 'DETALLE CRONOLÓGICO']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, textColor: PDF_COLORS.WHITE, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, fontStyle: 'bold', lineColor: PDF_COLORS.STEEL_BORDERS, overflow: 'linebreak', cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 30 },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 'auto' }
        },
        didDrawPage: (data) => {
          doc.setPage(data.pageNumber);
          drawExecutiveHeader(doc, reportTitle);
        }
      });

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          drawExecutiveFooter(doc, i, totalPages);
      }

      doc.save(`Bitacora_Auditoria_${new Date().getFullYear()}_${new Date().getMonth()+1}.pdf`);
      notify.success('BITÁCORA EXPORTADA EXITOSAMENTE.');
    } catch (e) {
      console.error("Error exportando bitácora:", e);
      notify.error('FALLO TÉCNICO AL GENERAR EL DOCUMENTO DE AUDITORÍA.');
    }
  };

  const generarInformeDirectivos = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const reportesFiltrados = getFilteredReportes().sort((a, b) => a.grado.localeCompare(b.grado));
      const reportTitle = "INFORME EJECUTIVO DE GESTIÓN ACADÉMICA";

      if (reportesFiltrados.length === 0) return;

      const currentYAfterHeader = drawExecutiveHeader(doc, reportTitle, INTRO_TEXTS.INFORME_DIRECTIVO, `PERIODO EVALUADO: ${filtroPeriodo}`);

      const totalMatriculaGlobal = Object.values(matriculas).reduce((a, b) => a + b, 0);
      const matriculaActiva = Math.max(0, totalMatriculaGlobal - retiradosCount);

      const stats = reportesFiltrados.reduce((acc: any, curr) => {
        acc.preventivo += (curr.estudiantesPreventivo || []).length;
        acc.pierden += (curr.estudiantesPierden || []).length;
        return acc;
      }, { totalMatricula: totalMatriculaGlobal, matriculaActiva, retirados: retiradosCount, preventivo: 0, pierden: 0 });

      autoTable(doc, { 
        startY: currentYAfterHeader,
        margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 25 },
        head: [['CONSOLIDADO INDICADORES DE GESTIÓN ACADÉMICA', 'TOTAL']],
        body: [
          [ 'MATRÍCULA BRUTA (REGISTRO GLOBAL)', stats.totalMatricula ],
          [ 'ESTUDIANTES RETIRADOS DEL SISTEMA', stats.retirados ],
          [ 'MATRÍCULA ACTIVA (POBLACIÓN REAL)', stats.matriculaActiva ],
          [ 'TOTAL REPORTADOS EN CORTE PREVENTIVO', stats.preventivo ], 
          [ 'TOTAL CON DESEMPEÑO BAJO AL FINALIZAR EL PERIODO', stats.pierden ]
        ],
        theme: 'grid',
        rowPageBreak: 'avoid',
        headStyles: { 
          fillColor: PDF_COLORS.PRIMARY_NAVY, 
          textColor: PDF_COLORS.WHITE,
          fontSize: 9, 
          fontStyle: 'bold',
          halign: 'center'
        },
        styles: { 
          fontSize: 8.5, 
          textColor: [0, 0, 0], 
          fontStyle: 'bold',
          lineColor: PDF_COLORS.STEEL_BORDERS,
          lineWidth: 0.1,
          valign: 'middle',
          cellPadding: 5,
          overflow: 'linebreak'
        },
        alternateRowStyles: {
          fillColor: PDF_COLORS.CLOUD_ZEBRA
        },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'center', cellWidth: 40 }
        },
        didDrawPage: (data) => {
          doc.setPage(data.pageNumber);
        }
      });

      let currentY = (doc as any).lastAutoTable.finalY + 15;

      // Consolidado por Áreas (Academic Criticality)
      const areaRanking = AREAS
        .filter(area => area.toUpperCase() !== 'ESO')
        .map(area => {
          const count = reportesFiltrados
            .filter(r => r.area.toUpperCase() === area.toUpperCase())
            .reduce((sum, curr) => sum + (curr.estudiantesPierden || []).length, 0);
          return [area.toUpperCase(), count];
        })
        .sort((a, b) => (b[1] as number) - (a[1] as number));

      if (currentY > pageHeight - 60) { doc.addPage(); currentY = 35; }
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("RANKING DE CRITICIDAD POR ÁREAS (MAYOR REPROBACIÓN)", PDF_MARGIN, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [['ÁREA ACADÉMICA', 'ESTUDIANTES CON DESEMPEÑO BAJO']],
        body: areaRanking,
        theme: 'grid',
        headStyles: { fillColor: [153, 27, 27], textColor: 255, halign: 'center', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'center', cellWidth: 50, textColor: [153, 27, 27] } },
        margin: { left: PDF_MARGIN, right: PDF_MARGIN }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;

      // Consolidado por Grados
      const gradoRanking = GRADOS.map(grado => {
        const count = reportesFiltrados
          .filter(r => r.grado === grado)
          .reduce((sum, curr) => sum + (curr.estudiantesPierden || []).length, 0);
        return [grado.toUpperCase(), count];
      });

      if (currentY > pageHeight - 60) { doc.addPage(); currentY = 35; }
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CONSOLIDADO DE REPROBACIÓN POR GRADOS", PDF_MARGIN, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [['GRADO / NIVEL', 'ESTUDIANTES CON DESEMPEÑO BAJO']],
        body: gradoRanking,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: 'center', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'center', cellWidth: 50, textColor: [153, 27, 27] } },
        margin: { left: PDF_MARGIN, right: PDF_MARGIN }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;

      // Ranking Docentes (Corte Preventivo)
      const docenteRanking = [...DOCENTES].map(docente => {
        const count = reportesFiltrados
          .filter(r => r.docente.toUpperCase() === docente.toUpperCase())
          .reduce((sum, curr) => sum + (curr.estudiantesPreventivo || []).length, 0);
        return [docente.toUpperCase(), count];
      })
      .filter(d => (d[1] as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));

      if (currentY > pageHeight - 60) { doc.addPage(); currentY = 35; }
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("RANKING DE REPORTES EN CORTE PREVENTIVO POR DOCENTE", PDF_MARGIN, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [['DOCENTE RESPONSABLE', 'ALERTAS PREVENTIVAS REPORTADAS']],
        body: docenteRanking.length > 0 ? docenteRanking : [['NO SE REPORTAN ALERTAS EN ESTE PERIODO', 0]],
        theme: 'grid',
        headStyles: { fillColor: [20, 83, 45], textColor: 255, halign: 'center', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'center', cellWidth: 50, textColor: [20, 83, 45] } },
        margin: { left: PDF_MARGIN, right: PDF_MARGIN }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;

      // Ranking Docentes (Reprobación)
      const docentePierdenRanking = [...DOCENTES].map(docente => {
        const count = reportesFiltrados
          .filter(r => r.docente.toUpperCase() === docente.toUpperCase())
          .reduce((sum, curr) => sum + (curr.estudiantesPierden || []).length, 0);
        return [docente.toUpperCase(), count];
      })
      .filter(d => (d[1] as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));

      if (currentY > pageHeight - 60) { doc.addPage(); currentY = 35; }
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("RANKING DE DOCENTES SEGÚN REPROBACIÓN ACADÉMICA", PDF_MARGIN, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [['DOCENTE RESPONSABLE', 'ESTUDIANTES CON DESEMPEÑO BAJO']],
        body: docentePierdenRanking.length > 0 ? docentePierdenRanking : [['SISTEMA: NO SE REGISTRA REPROBACIÓN', 0]],
        theme: 'grid',
        headStyles: { fillColor: [153, 27, 27], textColor: 255, halign: 'center', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'center', cellWidth: 50, textColor: [153, 27, 27] } },
        margin: { left: PDF_MARGIN, right: PDF_MARGIN }
      });

      // --- SIGNATURES START ---
      currentY = (doc as any).lastAutoTable.finalY + 25;
      
      // Block 1: Rector (centered)
      if (currentY > pageHeight - 65) {
        doc.addPage();
        drawExecutiveHeader(doc, reportTitle);
        currentY = 45;
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
      
      const directorX = pageWidth / 2;
      doc.line(directorX - 40, currentY + 15, directorX + 40, currentY + 15);
      doc.text("MANUEL MALDONADO", directorX, currentY + 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("RECTOR INSTITUCIONAL", directorX, currentY + 25, { align: "center" });

      // Block 2: Teacher grid
      currentY += 40;
      if (currentY > pageHeight - 50) {
        doc.addPage();
        drawExecutiveHeader(doc, reportTitle);
        currentY = 45;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DOCENTES:", PDF_MARGIN, currentY + 5);
      currentY += 15;

      const reportingTeachersSet = new Set(reportesFiltrados.map(r => r.docente.toUpperCase()));
      const signaturesToUse = Array.from(reportingTeachersSet).sort();
      const sigCols = 2;
      const sigLineW = 60;
      const sigSpacingX = (pageWidth - 2 * PDF_MARGIN - sigCols * sigLineW) / (sigCols - 1);
      const sigRowHeight = 30;
      let sigCurrentY = currentY;

      for (let i = 0; i < signaturesToUse.length; i++) {
        const col = i % sigCols;
        
        if (col === 0 && sigCurrentY > pageHeight - 35) {
            doc.addPage();
            drawExecutiveHeader(doc, reportTitle);
            sigCurrentY = 45;
        }
        
        const x = PDF_MARGIN + col * (sigLineW + sigSpacingX);
        const y = sigCurrentY + 10;
        
        doc.line(x, y, x + sigLineW, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(signaturesToUse[i].toUpperCase(), x + sigLineW / 2, y + 4, { align: 'center' });
        
        if (col === sigCols - 1 || i === signaturesToUse.length - 1) {
            sigCurrentY += sigRowHeight;
        }
      }
      // --- SIGNATURES END ---

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          drawExecutiveFooter(doc, i, totalPages);
      }

      doc.save(`Informe_Directivo_P${filtroPeriodo}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  const generarActaConsejo = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const reportesFiltrados = getFilteredReportes();

      if (reportesFiltrados.length === 0) return;

      const reportTitle = "ACTA DE COMISIÓN DE EVALUACIÓN Y PROMOCIÓN";
      const metaInfo = `PERIODO EVALUADO: ${filtroPeriodo}`;
      const startY = drawExecutiveHeader(doc, reportTitle, INTRO_TEXTS.COMISION_EVALUACION, metaInfo);

      let currentY = startY;

      // SUMMARY STATS CALCULATION
      const totalMatriculaGlobal = Object.values(matriculas).reduce((a, b) => a + b, 0);
      const totalMatriculaActiva = Math.max(0, totalMatriculaGlobal - retiradosCount);
      const totalPreventivoSet = new Set();
      const totalBajoSet = new Set();
      const teachersPreventivoSet = new Set();
      const teachersBajoSet = new Set();

      reportesFiltrados.forEach(r => {
        (r.estudiantesPreventivo || []).forEach(s => totalPreventivoSet.add(s.toUpperCase().trim()));
        (r.estudiantesPierden || []).forEach(s => totalBajoSet.add(s.toUpperCase().trim()));
        
        if ((r.estudiantesPreventivo || []).length > 0) teachersPreventivoSet.add(r.docente.toUpperCase());
        if ((r.estudiantesPierden || []).length > 0) teachersBajoSet.add(r.docente.toUpperCase());
      });

      const totalPreventivoCount = totalPreventivoSet.size;
      const totalBajoCount = totalBajoSet.size;
      const percPreventivo = totalMatriculaActiva > 0 ? ((totalPreventivoCount / totalMatriculaActiva) * 100).toFixed(1) : '0';
      const percBajo = totalMatriculaActiva > 0 ? ((totalBajoCount / totalMatriculaActiva) * 100).toFixed(1) : '0';

      // SUMMARY TABLE
      autoTable(doc, {
        startY: currentY,
        margin: { left: PDF_MARGIN, right: PDF_MARGIN },
        head: [['CONSOLIDADO GENERAL DE RESULTADOS', 'PROCESO ACADÉMICO']],
        body: [
          ['MATRÍCULA BRUTA INSTITUCIONAL', totalMatriculaGlobal],
          ['ESTUDIANTES RETIRADOS CENSADOS', retiradosCount],
          ['POBLACIÓN ACADÉMICA ACTIVA', totalMatriculaActiva],
          ['ESTUDIANTES EN CORTE PREVENTIVO', `${totalPreventivoCount} (${percPreventivo}%)`],
          ['ESTUDIANTES CON DESEMPEÑO BAJO', `${totalBajoCount} (${percBajo}%)`],
          ['DOCENTES CON REPORTES PREVENTIVOS', teachersPreventivoSet.size],
          ['DOCENTES CON REPORTES DE DESEMPEÑO BAJO', teachersBajoSet.size]
        ],
        theme: 'grid',
        headStyles: { fillColor: PDF_COLORS.PRIMARY_NAVY, textColor: 255, halign: 'center', fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 3.5, fontStyle: 'bold', lineColor: PDF_COLORS.STEEL_BORDERS, lineWidth: 0.1 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 50, halign: 'center' } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // DETAILED LIST BY GRADE
      GRADOS.forEach((grado) => {
        const reportesGrado = reportesFiltrados.filter(r => r.grado === grado);
        
        if (currentY > pageHeight - 40) { 
          doc.addPage(); 
          currentY = 25; 
        }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
        doc.text(`GRADO: ${grado}`, PDF_MARGIN, currentY);
        currentY += 8;

        // Grouping logic for the user request
        const studentSummary: Record<string, { areas: string[], teachers: string[] }> = {};
        reportesGrado.forEach(rep => {
          if (rep.estudiantesPierden && rep.estudiantesPierden.length > 0) {
            rep.estudiantesPierden.forEach(studentName => {
              const nameKey = studentName.toUpperCase().trim();
              if (!studentSummary[nameKey]) {
                studentSummary[nameKey] = { areas: [], teachers: [] };
              }
              studentSummary[nameKey].areas.push(rep.area.toUpperCase());
              studentSummary[nameKey].teachers.push(rep.docente.toUpperCase());
            });
          }
        });

        const studentsInGrade = Object.keys(studentSummary).sort();

        if (studentsInGrade.length === 0) {
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("SISTEMA: NO HAY ESTUDIANTES CON DESEMPEÑOS BAJOS EN ESTE PERIODO", PDF_MARGIN + 5, currentY);
          currentY += 12;
        } else {
          const bodyTable = studentsInGrade.map((name) => {
            const data = studentSummary[name];
            return [
              name,
              data.areas.join('\n'),
              data.teachers.join('\n')
            ];
          });

          autoTable(doc, {
            startY: currentY,
            margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 25 },
            head: [['ESTUDIANTE', 'COORDINACIÓN / ÁREAS REPROBADAS', 'DOCENTES RESPONSABLES']],
            body: bodyTable,
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 8, halign: 'center' },
            styles: { fontSize: 7.5, cellPadding: 3, valign: 'middle', overflow: 'linebreak', lineColor: PDF_COLORS.STEEL_BORDERS, lineWidth: 0.1 },
            columnStyles: {
              0: { cellWidth: 50, fontStyle: 'bold' },
              1: { cellWidth: 'auto' },
              2: { cellWidth: 50 }
            }
          });
          currentY = (doc as any).lastAutoTable.finalY + 12;
        }
      });

      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 30;
      }
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

      let sigY = currentY + 15;
      const directorX = pageWidth / 2;

      if (sigY > pageHeight - 65) {
        doc.addPage();
        drawExecutiveHeader(doc, reportTitle);
        sigY = 45;
      }

      doc.line(directorX - 40, sigY + 15, directorX + 40, sigY + 15);
      doc.text("MANUEL MALDONADO", directorX, sigY + 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("RECTOR INSTITUCIONAL", directorX, sigY + 25, { align: "center" });

      sigY += 40;
      if (sigY > pageHeight - 50) {
        doc.addPage();
        drawExecutiveHeader(doc, reportTitle);
        sigY = 45;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DOCENTES:", PDF_MARGIN, sigY + 5);
      sigY += 15;

      const reportingTeachersActa = new Set(reportesFiltrados.map(r => r.docente.toUpperCase()));
      const allTeachers = Array.from(reportingTeachersActa).sort();
      const sigCols = 2;
      const sigLineW = 60;
      const sigSpacingX = (pageWidth - 2 * PDF_MARGIN - sigCols * sigLineW) / (sigCols - 1);
      const sigRowHeight = 30;
      let sigCurrentY = sigY;

      for (let i = 0; i < allTeachers.length; i++) {
        const col = i % sigCols;
        if (col === 0 && sigCurrentY > pageHeight - 35) {
            doc.addPage();
            drawExecutiveHeader(doc, reportTitle);
            sigCurrentY = 45;
        }
        const x = PDF_MARGIN + col * (sigLineW + sigSpacingX);
        const y = sigCurrentY + 10;
        doc.line(x, y, x + sigLineW, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(allTeachers[i].toUpperCase(), x + sigLineW / 2, y + 4, { align: 'center' });
        if (col === sigCols - 1 || i === allTeachers.length - 1) {
            sigCurrentY += sigRowHeight;
        }
      }

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          drawExecutiveFooter(doc, i, totalPages);
      }

      doc.save(`Acta_Comision_P${filtroPeriodo}.pdf`);
    } catch (error) {
      console.error("Error generating Acta:", error);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  const checkDataAndExport = (action: () => void) => {
    if (getFilteredReportes().length === 0) {
      setIsNoDataModalOpen(true);
      return;
    }
    action();
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <PageHeader
        title="REPORTES INSTITUCIONALES"
        description="Gestión y procesamiento de informes ejecutivos, actas de comisión."
        imageUrl="https://images.unsplash.com/photo-1589330694653-ded6df03f754?auto=format&fit=crop&q=80&w=1200"
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

      <div className="flex flex-col md:flex-row justify-between items-center bg-[#1e1e1e] p-8 rounded-3xl border border-white/5 mb-4 shadow-2xl">
        <div className="mb-4 md:mb-0">
          <h2 className="text-xl font-bold text-white tracking-widest uppercase">Parámetros de Generación</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Vínculo estratégico para el seguimiento académico institucional</p>
        </div>
        <div className="flex items-center gap-6">
          <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Periodo Académico:</label>
          <select
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            className="executive-input px-6 py-2.5 min-w-[200px]"
          >
            {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">Periodo {p}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className={`bg-[#1A1A1A] p-12 rounded-[2.5rem] shadow-2xl border border-white/5 flex flex-col items-center text-center transition-all duration-500 relative group overflow-hidden h-full ${!isDirectivo ? 'opacity-60 grayscale' : 'hover:shadow-blue-900/10 hover:-translate-y-2'}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
          <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-8 shadow-inner relative z-10 transform transition-transform duration-700 border ${!isDirectivo ? 'bg-slate-800/50 text-slate-600 border-slate-700' : 'bg-blue-600/10 text-blue-500 group-hover:rotate-12 border-blue-500/10'}`}>
            <Presentation size={48} />
          </div>
          <h3 className="text-2xl font-black text-white mb-4 relative z-10 uppercase tracking-tighter">INFORME DIRECTIVO</h3>
          <p className="text-[13px] text-slate-400 mb-10 flex-1 leading-relaxed relative z-10 font-medium uppercase tracking-tight">
            Compilación técnica de estadísticas, análisis de criticidad académica y proyecciones estratégicas institucionales.
            {!isDirectivo && <span className="block mt-4 text-[#D4AF37] font-black text-[10px] tracking-widest">FUNCIONALIDAD EXCLUSIVA PARA DIRECTIVOS</span>}
          </p>
          <button
            onClick={() => {
              if (isDirectivo) checkDataAndExport(handleInformeDirectivosClick);
            }}
            disabled={!isDirectivo}
            className={`w-full flex items-center justify-center gap-3 font-black py-4 px-8 rounded-2xl transition-all shadow-xl relative z-10 uppercase text-[11px] tracking-[0.2em] ${!isDirectivo ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-950/40'}`}
          >
            <FileOutput size={24} />
            {isDirectivo ? 'Compilar Informe PDF' : 'Acceso Restringido'}
          </button>
        </div>

        <div className="bg-[#1A1A1A] p-12 rounded-[2.5rem] shadow-2xl border border-white/5 flex flex-col items-center text-center hover:shadow-slate-900/10 hover:-translate-y-2 transition-all duration-500 relative group overflow-hidden h-full">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-600 to-[#0A1128]"></div>
          <div className="w-24 h-24 bg-slate-800/20 text-slate-400 rounded-3xl flex items-center justify-center mb-8 shadow-inner relative z-10 transform group-hover:-rotate-12 transition-transform duration-700 border border-white/5">
            <Users size={48} />
          </div>
          <h3 className="text-2xl font-black text-white mb-4 relative z-10 uppercase tracking-tighter">ACTA DE COMISION Y PROMOCION</h3>
          <p className="text-[13px] text-slate-400 mb-10 flex-1 leading-relaxed relative z-10 font-medium uppercase tracking-tight">
            Acta oficial para la Comisión de Evaluación y Promoción
          </p>
          <button
            onClick={() => checkDataAndExport(generarActaConsejo)}
            className="w-full flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-900 text-white font-black py-4 px-8 rounded-2xl transition-all shadow-xl shadow-black/40 relative z-10 uppercase text-[11px] tracking-[0.2em]"
          >
            <FileOutput size={24} />
            Generar Acta Oficial
          </button>
        </div>
      </div>

      {/* Admin Access Addon */}
      <div className="flex justify-center mt-12 mb-6">
         <button
            onClick={() => {
              if (!isDirectivo) return;
              setPendingAction(() => () => setShowHistoryModal(true));
              setIsPasswordModalOpen(true);
            }}
            disabled={!isDirectivo}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 font-black text-[10px] tracking-widest uppercase shadow-sm active:scale-95 ${
              isDirectivo 
                ? 'bg-gradient-to-r from-slate-800 to-[#0A1128] text-white hover:shadow-xl hover:shadow-blue-900/20 hover:-translate-y-0.5 border border-white/5' 
                : 'bg-white/5 text-slate-700 border border-white/5 cursor-not-allowed opacity-40'
            }`}
          >
            <ShieldCheck size={16} /> 
            {isDirectivo ? 'ACCESO EXCLUSIVO ADMINISTRADOR' : 'ACCESO RESTRINGIDO A ADMINISTRACIÓN'}
          </button>
      </div>

      {/* Login History Modal - Ultra-Clean High-End Version */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[9000] flex items-center justify-center p-0 md:p-8 lg:p-12 animate-in fade-in duration-500">
           <div className="bg-[#0A0A0A] sm:rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,1)] w-full max-w-7xl h-full lg:h-[90vh] overflow-hidden flex flex-col border border-white/5 animate-in zoom-in-95 duration-500 relative">
            <div className="bg-[#0D0D0D] px-8 py-10 sm:px-14 sm:py-12 text-white relative shrink-0 border-b border-white/5">
               <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none" />
               
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                 <div className="flex items-center gap-6">
                   <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center shadow-2xl group transition-all hover:bg-white/10">
                      <ShieldCheck size={32} className="text-[#D4AF37]" />
                   </div>
                   <div>
                     <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-headings mb-1">BITÁCORA DE AUDITORÍA MAESTRA</h2>
                     <div className="flex items-center gap-3">
                       <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Registro Histórico de Autenticaciones Institucionales</p>
                     </div>
                   </div>
                 </div>
                 
                 <div className="flex items-center gap-4">
                    <button
                      onClick={fetchHistory}
                      disabled={loading}
                      className="p-3 bg-white/5 border border-white/10 text-blue-500 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center group"
                      title="Actualizar Bitácora"
                    >
                      <RefreshCw size={20} className={loading ? 'animate-spin' : 'group-active:rotate-180 transition-transform duration-500'} />
                    </button>
                    <button
                      onClick={generarPDFBitacora}
                      disabled={loginHistory.length === 0}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white border border-blue-500/20 rounded-xl transition-all font-black text-[10px] tracking-widest uppercase disabled:opacity-30 shadow-lg shadow-blue-500/20"
                    >
                      <FileOutput size={18} /> Exportar PDF
                    </button>
                    <button
                      onClick={() => {}}
                      className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 group"
                      title="Actualizar Datos"
                    >
                      <RefreshCw size={20} className={loading ? 'animate-spin' : 'group-active:rotate-180 transition-transform duration-500'} />
                    </button>
                    {isDirectivo && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/20 rounded-xl transition-all font-black text-[10px] tracking-widest uppercase"
                      >
                        <Trash2 size={18} /> Borrar Registros
                      </button>
                    )}
                    <button 
                      onClick={() => setShowHistoryModal(false)}
                      className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5"
                    >
                      <X size={24} />
                    </button>
                 </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 sm:p-14 bg-[#0A0A0A]">
              {showDeleteConfirm && (
                 <div className="bg-[#111] border border-rose-500/30 rounded-3xl p-10 mb-12 animate-in slide-in-from-top-8 duration-500 shadow-2xl">
                    <div className="flex items-center gap-6 mb-8">
                      <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-500/20">
                        <AlertTriangle size={32} />
                      </div>
                      <div>
                        <h4 className="font-black text-white text-xl uppercase tracking-tighter">Autorización de Borrado Irreversible</h4>
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] mt-1.5 opacity-80">Esta acción eliminará todos los registros de auditoría de forma permanente.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={handleDeleteHistory}
                        disabled={isDeletingHistory}
                        className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] tracking-[0.3em] rounded-2xl transition-all uppercase shadow-lg shadow-rose-950/40"
                      >
                        {isDeletingHistory ? 'PROCESANDO...' : 'SÍ, EJECUTAR DEPURACIÓN'}
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-black text-[11px] tracking-[0.3em] rounded-2xl transition-all uppercase border border-white/10"
                      >
                        ABORTAR OPERACIÓN
                      </button>
                    </div>
                 </div>
               )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {groupedLoginHistory.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5 border-dashed">
                      <MonitorCheck size={40} className="text-slate-600" />
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No se han detectado registros de actividad en la bitácora</p>
                  </div>
                ) : (
                  groupedLoginHistory.map((group) => (
                    <div key={group.nombre} className="group bg-[#0D0D0D] rounded-3xl border border-white/5 hover:border-white/10 transition-all duration-500 overflow-hidden flex flex-col shadow-2xl">
                      <div className="p-8 border-b border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent flex justify-between items-center">
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 bg-white/[0.03] rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-white group-hover:bg-blue-600/20 transition-all duration-500 border border-white/5 shadow-inner">
                            <UserIcon size={24} strokeWidth={1.5} />
                          </div>
                          <div>
                            <h4 className="text-lg font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{group.nombre}</h4>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-[#D4AF37]"></span>
                              ROL: {group.rol.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[20px] font-black text-white tracking-tighter">{group.entries.length}</p>
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Accesos registrados</p>
                        </div>
                      </div>
                      <div className="p-6 max-h-[300px] overflow-y-auto custom-scrollbar bg-[#0A0A0A]/30">
                        <div className="space-y-3">
                          {group.entries.map((log: any, idx: number) => (
                            <div key={log.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors group/item">
                              <div className="flex items-center gap-4">
                                <div className="text-slate-600 font-mono text-[9px] w-6">{idx + 1}</div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                     <Calendar size={10} className="text-blue-500/60" />
                                     <span className="text-[11px] font-bold text-slate-200">
                                       {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date(log.timestamp).toLocaleDateString()}
                                     </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                     <Clock size={10} className="text-[#D4AF37]/60" />
                                     <span className="text-[9px] font-bold text-slate-500 italic">
                                       {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : new Date(log.timestamp).toLocaleTimeString()}
                                     </span>
                                  </div>
                                </div>
                              </div>
                              <div className="opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <MonitorCheck size={14} className="text-emerald-500/40" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-[#0D0D0D] p-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                 <ShieldCheck size={18} className="text-[#D4AF37]" />
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SISTEMA DE VERIFICACIÓN DE IDENTIDAD TILANA • NIVEL DE SEGURIDAD MÁXIMO</p>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="w-full sm:w-auto px-10 py-3 bg-white hover:bg-white/90 text-black font-black text-[11px] tracking-widest uppercase rounded-xl transition-all shadow-xl shadow-white/5"
              >
                Finalizar Auditoría
              </button>
            </div>
          </div>
        </div>
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
          setIsPasswordModalOpen(false);
          if (pendingAction) pendingAction();
        }}
      />
    </div>
  );
}
