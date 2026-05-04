import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Reporte } from '../lib/types';
import { PERIODOS, DOCENTES } from '../lib/constants';
import { Search, AlertTriangle, Download, Trash2, Edit, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, drawWatermark, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS } from '../lib/pdfUtils';

interface FailedArea {
  area: string;
  docente: string;
}

interface StudentData {
  nombre: string;
  grado: string;
  areasReprobadas: FailedArea[];
}

import { PageHeader } from '../components/PageHeader';
import { PasswordModal } from '../components/PasswordModal';
import { NoDataModal } from '../components/NoDataModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { MessageModal } from '../components/MessageModal';

export function RegistroEstudiante() {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroGrado, setFiltroGrado] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isNoDataModalOpen, setIsNoDataModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'warning'>('success');
  const [modalMessage, setModalMessage] = useState('');

  const fetchData = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'reportes'));
      const snapshot = await getDocs(q);
      const data: Reporte[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      } as Reporte));
      setReportes(data);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.LIST, 'reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const gradosUnicos = useMemo(() => {
    const grados = new Set(reportes.map(r => r.grado));
    return Array.from(grados).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [reportes]);

  const studentData = useMemo(() => {
    let filtered = reportes;
    
    if (filtroPeriodo) {
      filtered = filtered.filter(r => r.periodo === filtroPeriodo);
    }
    
    if (filtroGrado) {
      filtered = filtered.filter(r => r.grado === filtroGrado);
    }

    const studentsMap = new Map<string, StudentData>();

    filtered.forEach(reporte => {
      if (reporte.estudiantesPierden && Array.isArray(reporte.estudiantesPierden)) {
        reporte.estudiantesPierden.forEach(estudianteRaw => {
          const estudiante = estudianteRaw.trim().toUpperCase();
          if (!estudiante) return;
          
          const key = `${estudiante}-${reporte.grado}`;
          if (!studentsMap.has(key)) {
            studentsMap.set(key, {
              nombre: estudiante,
              grado: reporte.grado,
              areasReprobadas: []
            });
          }
          const student = studentsMap.get(key)!;
          if (!student.areasReprobadas.find(a => a.area === reporte.area)) {
            student.areasReprobadas.push({ area: reporte.area, docente: reporte.docente });
          }
        });
      }
    });

    let result = Array.from(studentsMap.values());

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => s.nombre.toLowerCase().includes(term));
    }

    // Sort by grade (ascending), then by number of failed areas (descending), then by name
    result.sort((a, b) => {
      if (a.grado !== b.grado) {
        return a.grado.localeCompare(b.grado, undefined, { numeric: true });
      }
      if (b.areasReprobadas.length !== a.areasReprobadas.length) {
        return b.areasReprobadas.length - a.areasReprobadas.length;
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return result;
  }, [reportes, filtroPeriodo, filtroGrado, searchTerm]);

  const studentPreventivoData = useMemo(() => {
    let filtered = reportes;
    
    if (filtroPeriodo) {
      filtered = filtered.filter(r => r.periodo === filtroPeriodo);
    }
    
    if (filtroGrado) {
      filtered = filtered.filter(r => r.grado === filtroGrado);
    }

    const studentsMap = new Map<string, StudentData>();

    filtered.forEach(reporte => {
      if (reporte.estudiantesPreventivo && Array.isArray(reporte.estudiantesPreventivo)) {
        reporte.estudiantesPreventivo.forEach(estudianteRaw => {
          const estudiante = estudianteRaw.trim().toUpperCase();
          if (!estudiante) return;

          const key = `${estudiante}-${reporte.grado}`;
          if (!studentsMap.has(key)) {
            studentsMap.set(key, {
              nombre: estudiante,
              grado: reporte.grado,
              areasReprobadas: []
            });
          }
          const student = studentsMap.get(key)!;
          if (!student.areasReprobadas.find(a => a.area === reporte.area)) {
            student.areasReprobadas.push({ area: reporte.area, docente: reporte.docente });
          }
        });
      }
    });

    let result = Array.from(studentsMap.values());

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => s.nombre.toLowerCase().includes(term));
    }

    result.sort((a, b) => {
      if (a.grado !== b.grado) {
        return a.grado.localeCompare(b.grado, undefined, { numeric: true });
      }
      if (b.areasReprobadas.length !== a.areasReprobadas.length) {
        return b.areasReprobadas.length - a.areasReprobadas.length;
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return result;
  }, [reportes, filtroPeriodo, filtroGrado, searchTerm]);

  const handleDeleteAll = async () => {
    setPendingAction(() => async () => {
        try {
          setLoading(true);
          const snapshot = await getDocs(collection(db, 'reportes'));
          const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          await fetchData();
          setLoading(false);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'reportes');
          setLoading(false);
        }
    });
    setIsPasswordModalOpen(true);
  };

  const handleEditStudent = (student: StudentData) => {
    const newName = prompt("Nuevo nombre para el estudiante:", student.nombre);
    if (newName && newName !== student.nombre) {
      setPendingAction(() => async () => {
        try {
          setLoading(true);
          const snapshot = await getDocs(collection(db, 'reportes'));
          const batch = writeBatch(db);
          snapshot.forEach(d => {
            const data = d.data();
            let updated = false;
            let ep = Array.isArray(data.estudiantesPierden) ? [...data.estudiantesPierden] : [];
            let eprev = Array.isArray(data.estudiantesPreventivo) ? [...data.estudiantesPreventivo] : [];
            
            const idxP = ep.findIndex(n => n.trim().toUpperCase() === student.nombre.toUpperCase());
            if (idxP !== -1) {
              ep[idxP] = newName.toUpperCase();
              updated = true;
            }
            const idxPrev = eprev.findIndex(n => n.trim().toUpperCase() === student.nombre.toUpperCase());
            if (idxPrev !== -1) {
              eprev[idxPrev] = newName.toUpperCase();
              updated = true;
            }
            
            if (updated) {
              batch.update(d.ref, { estudiantesPierden: ep, estudiantesPreventivo: eprev });
            }
          });
          await batch.commit();
          await fetchData();
          setLoading(false);
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'reportes');
          setLoading(false);
        }
      });
      setIsPasswordModalOpen(true);
    }
  };

  const handleDeleteStudent = (student: StudentData) => {
    setConfirmMessage(`¿ESTÁ SEGURO DE ELIMINAR A ${student.nombre.toUpperCase()} DE TODOS LOS REGISTROS ACADÉMICOS?`);
    setOnConfirm(() => async () => {
      try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, 'reportes'));
        const batch = writeBatch(db);
        snapshot.forEach(d => {
          const data = d.data();
          let updated = false;
          let ep = Array.isArray(data.estudiantesPierden) ? [...data.estudiantesPierden] : [];
          let eprev = Array.isArray(data.estudiantesPreventivo) ? [...data.estudiantesPreventivo] : [];
          
          const initialLenP = ep.length;
          ep = ep.filter(n => n.trim().toUpperCase() !== student.nombre.toUpperCase());
          if (ep.length !== initialLenP) updated = true;

          const initialLenPrev = eprev.length;
          eprev = eprev.filter(n => n.trim().toUpperCase() !== student.nombre.toUpperCase());
          if (eprev.length !== initialLenPrev) updated = true;
          
          if (updated) {
            batch.update(d.ref, { estudiantesPierden: ep, estudiantesPreventivo: eprev });
          }
        });
        await batch.commit();
        await fetchData();
        setLoading(false);
        setModalType('success');
        setModalMessage('ESTUDIANTE ELIMINADO CORRECTAMENTE DEL SISTEMA.');
        setIsMessageModalOpen(true);
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, 'reportes');
        setLoading(false);
      }
    });

    setPendingAction(() => () => {
      setIsConfirmOpen(true);
    });
    setIsPasswordModalOpen(true);
  };

  const exportToPDF = () => {
    if (studentData.length === 0) {
      setIsNoDataModalOpen(true);
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const docTitle = "CONSOLIDADO DE DESEMPEÑO POR FORTALECER";
    const introText = INTRO_TEXTS.CONSOLIDADO_DESEMPEÑO_BAJO;
    
    const metaInfo = `GRADO: ${filtroGrado || 'TODOS'}   |   PERIODO: ${filtroPeriodo || 'TODOS'}`;
    const currentY = drawExecutiveHeader(doc, docTitle, introText, metaInfo);
    
    const tableData: any[] = [];
    studentData.forEach(student => {
      student.areasReprobadas.forEach((a, i) => {
        if (i === 0) {
          tableData.push([
            { content: student.nombre.toUpperCase(), rowSpan: student.areasReprobadas.length },
            { content: student.grado, rowSpan: student.areasReprobadas.length },
            { content: student.areasReprobadas.length.toString(), rowSpan: student.areasReprobadas.length },
            a.area.toUpperCase(),
            a.docente.toUpperCase()
          ]);
        } else {
          tableData.push([
            a.area.toUpperCase(),
            a.docente.toUpperCase()
          ]);
        }
      });
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 25 },
      head: [['ESTUDIANTE', 'GRADO', 'ÁREAS PERDIDAS', 'ÁREAS / ASIGNATURAS', 'DOCENTE']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: PDF_COLORS.PRIMARY_NAVY, 
        textColor: PDF_COLORS.WHITE, 
        fontStyle: 'bold', 
        halign: 'center',
        valign: 'middle',
        fontSize: 8.5
      },
      styles: { 
        fontSize: 8, 
        cellPadding: 4, 
        valign: 'middle', 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        lineColor: PDF_COLORS.STEEL_BORDERS,
        lineWidth: 0.1,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.CLOUD_ZEBRA
      },
      columnStyles: {
        0: { cellWidth: 50, halign: 'left' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 45, halign: 'left' },
        4: { cellWidth: 'auto', halign: 'left' }
      },
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        doc.setPage(data.pageNumber);
        drawExecutiveHeader(doc, docTitle);
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;

    // Signature Section - Professional Executive Style
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

    // --- SIGNATURES START ---
    let signatureY = finalY;
    const directorX = pageWidth / 2;

    if (signatureY > pageHeight - 65) {
      doc.addPage();
      drawExecutiveHeader(doc, docTitle);
      signatureY = 45;
    }

    // Block 1: Rector (centered)
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

    doc.line(directorX - 40, signatureY + 15, directorX + 40, signatureY + 15);
    doc.text("MANUEL MALDONADO", directorX, signatureY + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("RECTOR INSTITUCIONAL", directorX, signatureY + 25, { align: "center" });

    signatureY += 35;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DOCENTES:", PDF_MARGIN, signatureY + 5);
    signatureY += 15;

    const allTeachers = [...DOCENTES].sort();
    const sigCols = 2;
    const sigLineW = 60;
    const sigSpacingX = (pageWidth - 2 * PDF_MARGIN - sigCols * sigLineW) / (sigCols - 1);
    const sigRowHeight = 30;
    let sigCurrentY = signatureY;

    for (let i = 0; i < allTeachers.length; i++) {
      const col = i % sigCols;
      if (col === 0 && sigCurrentY > pageHeight - 35) {
          doc.addPage();
          drawExecutiveHeader(doc, docTitle);
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
    // --- SIGNATURES END ---

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pageCount);
    }

    doc.save(`Consolidado_Desempeño_Bajo_${filtroPeriodo || 'Todos'}.pdf`);
  };

  const exportStudentIndividualPDF = (student: StudentData) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const docTitle = "SEGUIMIENTO ACADÉMICO INSTITUCIONAL";
    const startY = drawExecutiveHeader(doc, docTitle);
    
    let currentY = startY;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("DATOS DEL ESTUDIANTE", PDF_MARGIN, currentY);
    currentY += 8;

    autoTable(doc, {
      startY: currentY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN },
      head: [],
      body: [
        ['Nombre Completo:', student.nombre.toUpperCase()],
        ['Grado:', student.grado],
        ['Periodo Reportado:', filtroPeriodo ? `Periodo ${filtroPeriodo}` : "Consolidado Anual"]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3, textColor: [0, 0, 0] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 12;
    
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(PDF_COLORS.TEXT_DARK_GRAY[0], PDF_COLORS.TEXT_DARK_GRAY[1], PDF_COLORS.TEXT_DARK_GRAY[2]);
    const introActive = INTRO_TEXTS.SEGUIMIENTO_ACADEMICO;
    const introLines = doc.splitTextToSize(introActive, pageWidth - (PDF_MARGIN * 2));
    doc.text(introLines, PDF_MARGIN, currentY, { align: "justify" });
    currentY += (introLines.length * 5) + 12;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.text("ANÁLISIS DE ÁREAS EN SUPERACIÓN", PDF_MARGIN, currentY);
    currentY += 10;

    const tableData = student.areasReprobadas.map(a => [a.area.toUpperCase(), a.docente.toUpperCase()]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 25 },
      head: [['ÁREA / ASIGNATURA', 'DOCENTE RESPONSABLE']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: PDF_COLORS.PRIMARY_NAVY, 
        textColor: PDF_COLORS.WHITE, 
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 9
      },
      styles: { 
        fontSize: 8.5, 
        cellPadding: 4, 
        font: 'helvetica', 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        lineColor: PDF_COLORS.STEEL_BORDERS,
        lineWidth: 0.1,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.CLOUD_ZEBRA
      },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'left' }
      },
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        doc.setPage(data.pageNumber);
        drawExecutiveHeader(doc, docTitle);
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 30;

    // Signatures
    if (finalY > pageHeight - 65) {
      doc.addPage();
      drawExecutiveHeader(doc, "COMPROMISO ACADÉMICO");
      finalY = 100;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    doc.line(PDF_MARGIN + 5, finalY + 15, PDF_MARGIN + 75, finalY + 15);
    doc.text("FIRMA DEL ACUDIENTE", PDF_MARGIN + 40, finalY + 20, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("COMPROMISO DE APOYO", PDF_MARGIN + 40, finalY + 25, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.line(pageWidth - PDF_MARGIN - 75, finalY + 15, pageWidth - PDF_MARGIN - 5, finalY + 15);
    doc.text("MANUEL MALDONADO", pageWidth - PDF_MARGIN - 40, finalY + 20, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("RECTOR INSTITUCIONAL", pageWidth - PDF_MARGIN - 40, finalY + 25, { align: 'center' });

    const pc = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pc; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pc);
    }

    doc.save(`Informe_Individual_${student.nombre.replace(/\s+/g, '_')}.pdf`);
  };

  const exportActaPreventiva = () => {
    if (studentPreventivoData.length === 0) {
      setIsNoDataModalOpen(true);
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const docTitle = "ACTA DE CORTE PREVENTIVO (ALERTA TEMPRANA)";
    const introText = INTRO_TEXTS.ACTA_CORTE_PREVENTIVO;

    const metaInfo = `GRADO: ${filtroGrado || 'TODOS'}   |   PERIODO: ${filtroPeriodo || 'TODOS'}`;
    const currentY = drawExecutiveHeader(doc, docTitle, introText, metaInfo);

    const tableData: any[] = [];
    studentPreventivoData.forEach(student => {
      student.areasReprobadas.forEach((a, i) => {
        if (i === 0) {
          tableData.push([
            { content: student.nombre.toUpperCase(), rowSpan: student.areasReprobadas.length },
            { content: student.grado, rowSpan: student.areasReprobadas.length },
            a.area.toUpperCase(),
            a.docente.toUpperCase()
          ]);
        } else {
          tableData.push([
            a.area.toUpperCase(),
            a.docente.toUpperCase()
          ]);
        }
      });
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 25 },
      head: [['ESTUDIANTE', 'GRADO', 'ÁREAS / ASIGNATURAS', 'DOCENTE']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: PDF_COLORS.PRIMARY_NAVY, 
        textColor: PDF_COLORS.WHITE, 
        fontStyle: 'bold', 
        halign: 'center',
        valign: 'middle',
        fontSize: 8.5
      },
      styles: { 
        fontSize: 8, 
        cellPadding: 4, 
        valign: 'middle', 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        lineColor: PDF_COLORS.STEEL_BORDERS,
        lineWidth: 0.1,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.CLOUD_ZEBRA
      },
      columnStyles: {
        0: { cellWidth: 60, halign: 'left' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 50, halign: 'left' },
        3: { cellWidth: 'auto', halign: 'left' }
      },
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        doc.setPage(data.pageNumber);
        drawExecutiveHeader(doc, docTitle);
      }
    });

    const finalYActa = (doc as any).lastAutoTable.finalY + 20;
    
    // Signature Section - Professional Executive Style
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

    // --- SIGNATURES START ---
    let sigY = finalYActa;
    const dirX = pageWidth / 2;

    if (sigY > pageHeight - 65) {
      doc.addPage();
      drawExecutiveHeader(doc, docTitle);
      sigY = 45;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DOCENTES:", PDF_MARGIN, sigY + 5);
    sigY += 15;

    // Filter teachers who actually reported
    const reportingTeachersActa = new Set(studentPreventivoData.flatMap(s => s.areasReprobadas.map(a => a.docente.toUpperCase())));
    const teachersToSignActa = Array.from(reportingTeachersActa).sort();

    const sCols = 2;
    const sLineW = 60;
    const sSpacingX = (pageWidth - 2 * PDF_MARGIN - sCols * sLineW) / (sCols - 1);
    const sRowHeight = 30;
    let sCurrentY = sigY;

    for (let i = 0; i < teachersToSignActa.length; i++) {
      const col = i % sCols;
      if (col === 0 && sCurrentY > pageHeight - 35) {
          doc.addPage();
          drawExecutiveHeader(doc, docTitle);
          sCurrentY = 45;
      }
      const x = PDF_MARGIN + col * (sLineW + sSpacingX);
      const y = sCurrentY + 10;
      doc.line(x, y, x + sLineW, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(teachersToSignActa[i].toUpperCase(), x + sLineW / 2, y + 4, { align: 'center' });
      if (col === sCols - 1 || i === teachersToSignActa.length - 1) {
          sCurrentY += sRowHeight;
      }
    }

    if (sCurrentY > pageHeight - 45) {
      doc.addPage();
      drawExecutiveHeader(doc, docTitle);
      sCurrentY = 45;
    } else {
      sCurrentY += 5;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.line(dirX - 40, sCurrentY + 15, dirX + 40, sCurrentY + 15);
    doc.text("MANUEL MALDONADO", dirX, sCurrentY + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("RECTOR INSTITUCIONAL", dirX, sCurrentY + 25, { align: "center" });
    // --- SIGNATURES END ---

    const pc2 = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pc2; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pc2);
    }

    doc.save(`Acta_Corte_Preventivo_${filtroPeriodo || 'Todos'}.pdf`);
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="REGISTRO POR ESTUDIANTE"
        description="Consulte el listado consolidado de estudiantes con áreas reprobadas. Filtre por periodo o grado, y exporte los resultados en formato PDF para las comisiones de evaluación."
        imageUrl="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&q=80&w=800"
      >
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white font-black py-2.5 px-6 rounded-xl transition-all border border-white/10 disabled:opacity-50 uppercase text-[11px] tracking-widest"
            title="Actualizar Datos"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 px-6 rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-95 uppercase text-[10px] tracking-widest"
          >
            <Download size={18} strokeWidth={3} />
            Consolidado Desempeño Bajo
          </button>
          <button
            onClick={exportActaPreventiva}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-6 rounded-2xl transition-all shadow-xl shadow-emerald-900/20 active:scale-95 uppercase text-[10px] tracking-widest"
          >
            <Download size={18} strokeWidth={3} />
            Acta Corte Preventivo
          </button>
        </div>
      </PageHeader>

      <div className="bg-[#1A1A1A] p-6 rounded-3xl shadow-2xl border border-white/5 flex flex-col sm:flex-row gap-6">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre del estudiante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="executive-input pl-12 py-3"
          />
        </div>
        
        <select
          value={filtroPeriodo}
          onChange={(e) => setFiltroPeriodo(e.target.value)}
          className="executive-input px-6 py-3 sm:w-48"
        >
          <option value="" className="bg-[#1A1A1A]">TODOS LOS PERIODOS</option>
          {PERIODOS.map(p => (
            <option key={p} value={p} className="bg-[#1A1A1A]">PERIODO {p}</option>
          ))}
        </select>

        <select
          value={filtroGrado}
          onChange={(e) => setFiltroGrado(e.target.value)}
          className="executive-input px-6 py-3 sm:w-48"
        >
          <option value="" className="bg-[#1A1A1A]">TODOS LOS GRADOS</option>
          {gradosUnicos.map(g => (
            <option key={g} value={g} className="bg-[#1A1A1A]">{g}</option>
          ))}
        </select>
      </div>

      <div className="bg-[#1A1A1A] rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="py-5 px-6 font-black text-slate-400 uppercase tracking-widest text-[10px] border-b border-white/5">Estudiante</th>
                <th className="py-5 px-6 font-black text-slate-400 uppercase tracking-widest text-[10px] border-b border-white/5">Grado</th>
                <th className="py-5 px-6 font-black text-slate-400 uppercase tracking-widest text-[10px] border-b border-white/5">Desempeño Bajo</th>
                <th className="py-5 px-6 font-black text-slate-400 uppercase tracking-widest text-[10px] border-b border-white/5">Áreas / Asignaturas</th>
                <th className="py-5 px-6 font-black text-slate-400 uppercase tracking-widest text-[10px] border-b border-white/5">Docente</th>
                <th className="py-5 px-6 font-black text-slate-400 uppercase tracking-widest text-[10px] border-b border-white/5">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {studentData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500 font-bold uppercase tracking-[0.2em] text-sm">
                    No se han compilado registros académicos para los criterios establecidos.
                  </td>
                </tr>
              ) : (
                studentData.map((student, idx) => {
                  const rowSpan = student.areasReprobadas.length;
                  return (
                    <React.Fragment key={`${student.nombre}-${student.grado}-${idx}`}>
                      {student.areasReprobadas.map((a, i) => (
                        <tr key={i} className={`hover:bg-white/[0.02] transition-colors group ${i === 0 ? 'bg-white/[0.01]' : ''}`}>
                          {i === 0 && (
                            <>
                              <td rowSpan={rowSpan} className="py-4 px-6 font-black text-white align-top border-r border-white/5 group-hover:text-blue-400 transition-colors uppercase tracking-tight">{student.nombre}</td>
                              <td rowSpan={rowSpan} className="py-4 px-6 text-slate-400 align-top border-r border-white/5 font-bold uppercase">{student.grado}</td>
                              <td rowSpan={rowSpan} className="py-4 px-6 align-top border-r border-white/5">
                                <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest border ${
                                  student.areasReprobadas.length >= 3 
                                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
                                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                }`}>
                                  {student.areasReprobadas.length} ÁREAS
                                </span>
                              </td>
                            </>
                          )}
                          <td className="py-4 px-6">
                            <span className="inline-block bg-blue-600/10 text-blue-400 text-[10px] px-3 py-1.5 rounded-xl font-black border border-blue-500/20 uppercase tracking-tighter">
                              {a.area}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                            {a.docente}
                          </td>
                          {i === 0 && (
                            <td rowSpan={rowSpan} className="py-4 px-6 align-top border-l border-white/5">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => exportStudentIndividualPDF(student)}
                                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all duration-300 shadow-lg"
                                title="Descargar reporte individual"
                              >
                                <Download size={18} strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => handleEditStudent(student)}
                                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white transition-all duration-300 shadow-lg"
                                title="Editar estudiante"
                              >
                                <Edit size={18} strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(student)}
                                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all duration-300 shadow-lg"
                                title="Borrar estudiante"
                              >
                                <Trash2 size={18} strokeWidth={2.5} />
                              </button>
                            </div>
                          </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(auth.currentUser?.email === 'leorozco1970@gmail.com' || true) && (
        <div className="flex justify-end mt-8">
          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 font-black py-3 px-8 rounded-2xl transition-all border border-rose-500/20 uppercase text-[10px] tracking-widest shadow-xl active:scale-95"
          >
            <Trash2 size={18} strokeWidth={2.5} />
            Borrar Registros
          </button>
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
          if (pendingAction) pendingAction();
        }}
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
