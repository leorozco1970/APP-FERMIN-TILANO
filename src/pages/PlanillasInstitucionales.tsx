import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, query, where, writeBatch, serverTimestamp, doc, deleteDoc, updateDoc, getDoc, addDoc, setDoc } from 'firebase/firestore';
import { 
  FileSpreadsheet, Users, Upload, Download, Trash2, Search, 
  Save, Filter, CheckCircle2, AlertCircle, AlertOctagon, Sparkles, Settings, Eye,
  Lock, Unlock, Pencil, X, FileDown, FileText
} from 'lucide-react';
import { GRADOS, PERIODOS, DOCENTES, AREAS } from '../lib/constants';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

import { formatName } from '../lib/formatter';
import { PageHeader } from '../components/PageHeader';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useNotification } from '../context/NotificationContext';
import { ConfirmModal } from '../components/ConfirmModal';

const BLACK_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FF000000' } },
  left: { style: 'thin' as const, color: { argb: 'FF000000' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
  right: { style: 'thin' as const, color: { argb: 'FF000000' } }
};

const MONTH_COLORS_LIST = [
  'FF99CCFF', 'FFFFCC99', 'FFCCFFCC', 'FFCCCCFF', 'FFFFCC99', 'FFCCFFFF'
];

const COLOMBIAN_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03',
  '2026-05-01', '2026-05-25', '2026-06-15', '2026-06-22', '2026-07-20',
  '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16',
  '2026-12-08', '2026-12-25'
];

export function PlanillasInstitucionales() {
  const { notify } = useNotification();
  const [activeSubTab, setActiveSubTab] = useState<'generar' | 'asistencia'>('generar');
  const [userRole, setUserRole] = useState<string | null>(null);

  // Modals
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Generar States
  const [selectedGradoGen, setSelectedGradoGen] = useState<string>(GRADOS[0]);
  const [selectedPeriodo, setSelectedPeriodo] = useState<string>(PERIODOS[0]);
  const [selectedDocente, setSelectedDocente] = useState<string>(DOCENTES[0]);
  const [selectedArea, setSelectedArea] = useState<string>(AREAS[0]);
  
  const [masterTemplate, setMasterTemplate] = useState<string | null>(null);
  const [masterAsistencia, setMasterAsistencia] = useState<string | null>(null);
  
  // Asistencia States
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  
  const [config, setConfig] = useState({
    cellDocente: 'D7',
    cellGrado: 'M7',
    cellArea: 'U7',
    cellPeriodo: 'H4', // No mencionado específicamente en el último prompt, pero lo mantengo configurable
    cellCount: 'AD7',
    cellFirstStudent: 'C17'
  });

  const [status, setStatus] = useState({ text: '', type: '' });
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (!text) return;
    if (type === 'error') notify.error(text);
    else if (type === 'success') notify.success(text);
    else notify.info(text);
  };

  useEffect(() => {
    checkUserRole();
    fetchMasterTemplate();
  }, []);

  const handleDeleteConfirmed = async () => {
    // Legacy delete confirmed removed as listado moved to Matriculas
    setIsConfirmOpen(false);
  };

  const checkUserRole = async () => {
    // Check localStorage first for immediate UI update, mirroring Layout.tsx
    const localRole = localStorage.getItem('userRole');
    if (localRole) setUserRole(localRole);

    if (auth.currentUser) {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setUserRole(role);
          localStorage.setItem('userRole', role);
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
      }
    }
  };

  const isConfigAuthorized = userRole === 'administrativo' || userRole === 'directivo';

  const fetchMasterTemplate = async () => {
    try {
      // Planilla
      const planillaSnap = await getDoc(doc(db, 'config', 'master_spreadsheet'));
      if (planillaSnap.exists()) {
        const data = planillaSnap.data();
        setMasterTemplate(data.base64);
        if (data.config) setConfig(data.config);
      }
      
      // Asistencia
      const asistenciaSnap = await getDoc(doc(db, 'config', 'master_asistencia'));
      if (asistenciaSnap.exists()) {
        setMasterAsistencia(asistenciaSnap.data().base64);
      }
    } catch (error) {
      console.error('Error fetching master templates:', error);
    }
  };

  const handleMasterUpload = async (file: File, type: 'planilla' | 'asistencia' = 'planilla') => {
    // Firestore doc limit is 1MB. Base64 adds ~33% overhead.
    if (file.size > 750 * 1024) {
      showStatus(`Error: El archivo es muy grande (${(file.size/1024).toFixed(0)}KB). Límite ~750KB.`, 'error');
      return;
    }

    showStatus('Procesando plantilla maestra...', 'info');
    
    const reader = new FileReader();
    reader.onerror = () => {
      showStatus('Error al leer el archivo localmente.', 'error');
    };

    reader.onload = async (e) => {
      const docId = type === 'planilla' ? 'master_spreadsheet' : 'master_asistencia';
      try {
        const base64 = e.target?.result as string;
        
        await setDoc(doc(db, 'config', docId), {
          id: docId,
          base64,
          name: file.name,
          updatedAt: serverTimestamp()
        }, { merge: true });

        if (type === 'planilla') setMasterTemplate(base64);
        else setMasterAsistencia(base64);

        showStatus(`Plantilla Maestra de ${type === 'planilla' ? 'Planilla' : 'Asistencia'} guardada con éxito.`, 'success');
      } catch (error: any) {
        console.error('Error saving master template:', error);
        handleFirestoreError(error, OperationType.WRITE, `config/${docId}`);
        showStatus('Error al guardar en la base de datos.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const generateAsistencia = async () => {
    if (!masterAsistencia) {
      showStatus('No hay una plantilla de asistencia configurada.', 'error');
      return;
    }
    if (!fechaInicio || !fechaFin) {
      showStatus('Por favor seleccione las fechas del periodo.', 'error');
      return;
    }

    setIsGenerating(true);
    showStatus('Generando control de asistencia...', 'info');

    try {
      const q = query(collection(db, 'estudiantes'), where('grado', '==', selectedGradoGen));
      const snap = await getDocs(q);
      const studentNames = snap.docs
        .map(doc => (doc.data().nombre || '').toString().trim().toUpperCase())
        .filter(name => name.length > 0)
        .sort();

      if (studentNames.length === 0) {
        showStatus('No hay estudiantes registrados para este grado.', 'error');
        setIsGenerating(false);
        return;
      }

      // Robust base64 to Buffer conversion
      let buffer: ArrayBuffer;
      try {
        const base64Data = masterAsistencia.includes(',') 
          ? masterAsistencia.split(',')[1] 
          : masterAsistencia;
        const cleanedBase64 = base64Data.replace(/\s/g, '');
        const binaryString = window.atob(cleanedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        buffer = bytes.buffer;
      } catch (e: any) {
        throw new Error(`Error decodificando la plantilla: ${e.message}`);
      }
      
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer);
      } catch (e: any) {
        throw new Error(`Error al leer el archivo Excel: ${e.message}. Asegúrese de que la plantilla sea un archivo .xlsx válido.`);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error("La plantilla no contiene hojas de trabajo válidas.");
      }

      // Sheet name - safe rename
      try {
        const safeName = `${selectedGradoGen} ASISTENCIA`.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);
        worksheet.name = safeName;
      } catch (e) {}

      // Metadata Helper to avoid merge errors
      function safeSetValue(cellAddr: string, value: any, mergeRange?: string) {
        try {
          const cell = worksheet.getCell(cellAddr);
          if (mergeRange) {
            try { worksheet.unMergeCells(mergeRange); } catch (e) {}
          }
          cell.value = value;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (mergeRange) {
            try { worksheet.mergeCells(mergeRange); } catch (e) {}
          }
          return cell;
        } catch (e) {
          console.warn(`Error setting metadata for ${cellAddr}:`, e);
          return worksheet.getCell(cellAddr);
        }
      }

      // Metadata Attendance
      safeSetValue('D9', selectedDocente.toUpperCase(), 'D9:G9');
      safeSetValue('J9', selectedGradoGen, 'J9:M9');
      safeSetValue('V9', selectedArea.toUpperCase(), 'V9:AC9');
      const pCellHead = safeSetValue('B11', selectedPeriodo.toUpperCase(), 'B11:AC11');
      pCellHead.font = { bold: true };

      // Dates Logic
      const start = new Date(fechaInicio + 'T00:00:00');
      const end = new Date(fechaFin + 'T00:00:00');
      const datesToProcess: Date[] = [];
      let current = new Date(start);

      // Colombian Holidays 2026
      // (already defined at top of function)

      while (current <= end) {
        const day = current.getDay();
        const dateStr = current.toISOString().split('T')[0];
        const isHoliday = COLOMBIAN_HOLIDAYS_2026.includes(dateStr);
        const isRecess = (dateStr >= '2026-06-22' && dateStr <= '2026-07-13');

        if (day !== 0 && day !== 6 && !isHoliday && !isRecess) {
          datesToProcess.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }

      if (datesToProcess.length === 0) {
        throw new Error("No hay días hábiles en el rango de fechas seleccionado.");
      }

      // CLEAN ENTIRE ACTION AREA (Rows 13-100, Columns 2-150)
      const cleanToRow = Math.max(100, 15 + studentNames.length);
      for (let r = 13; r <= cleanToRow; r++) {
        const row = worksheet.getRow(r);
        for (let c = 2; c <= 150; c++) {
          const cell = row.getCell(c);
          if (cell.isMerged) {
            try { worksheet.unMergeCells(cell.master.address); } catch(e) {}
          }
          cell.value = null;
          cell.fill = { type: 'pattern', pattern: 'none' };
          cell.border = {};
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      }

      // Restore No and Names Headers
      const hNo = worksheet.getRow(13).getCell(2);
      hNo.value = 'No';
      hNo.font = { bold: true };
      hNo.alignment = { horizontal: 'center', vertical: 'middle' };
      try { worksheet.mergeCells(13, 2, 14, 2); } catch(e){}

      const hNames = worksheet.getRow(13).getCell(3);
      hNames.value = 'NOMBRES Y APELLIDOS';
      hNames.font = { bold: true };
      hNames.alignment = { horizontal: 'center', vertical: 'middle' };
      try { worksheet.mergeCells(13, 3, 14, 3); } catch(e){}

      const monthGroups: { month: string, startCol: number, endCol: number }[] = [];
      datesToProcess.forEach((date, i) => {
        const col = 4 + i;
        const monthName = date.toLocaleString('es-ES', { month: 'long' }).toUpperCase();
        const dayNum = date.getDate();
        
        const lastGroup = monthGroups[monthGroups.length - 1];
        if (!lastGroup || lastGroup.month !== monthName) {
          monthGroups.push({ month: monthName, startCol: col, endCol: col });
        } else {
          lastGroup.endCol = col;
        }

        const dayCell = worksheet.getRow(14).getCell(col);
        dayCell.value = dayNum;
        dayCell.alignment = { horizontal: 'center' };
      });

      monthGroups.forEach((group, idx) => {
        const color = MONTH_COLORS_LIST[idx % MONTH_COLORS_LIST.length];
        const cell = worksheet.getRow(13).getCell(group.startCol);
        cell.value = group.month;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        
        if (group.endCol > group.startCol) {
          try { worksheet.mergeCells(13, group.startCol, 13, group.endCol); } catch (e) {}
        }
      });

      // Totals Columns
      const lastDateCol = 3 + datesToProcess.length;
      const totalCol = lastDateCol + 1;
      const percentCol = lastDateCol + 2;

      // Set Column Widths
      worksheet.getColumn(2).width = 5; // No
      worksheet.getColumn(3).width = 45; // Names
      worksheet.getColumn(totalCol).width = 15;
      worksheet.getColumn(percentCol).width = 8;

      const tH = worksheet.getRow(13).getCell(totalCol);
      tH.value = 'TOTAL INASIST.';
      tH.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      tH.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
      tH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF444444' } };
      try { worksheet.mergeCells(13, totalCol, 14, totalCol); } catch(e){}

      const pH = worksheet.getRow(13).getCell(percentCol);
      pH.value = '%';
      pH.alignment = { horizontal: 'center', vertical: 'middle' };
      pH.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      pH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
      try { worksheet.mergeCells(13, percentCol, 14, percentCol); } catch(e){}

      // Students
      studentNames.forEach((name, i) => {
        const rowNum = 15 + i;
        const row = worksheet.getRow(rowNum);
        
        row.getCell(2).value = i + 1;
        row.getCell(2).alignment = { horizontal: 'center' };

        row.getCell(3).value = name;
        row.getCell(3).alignment = { horizontal: 'left' };

        const startAddr = row.getCell(4).address;
        const endAddr = row.getCell(lastDateCol).address;
        const tCell = row.getCell(totalCol);
        // Formula counts zeros (0) as requested
        tCell.value = { formula: `COUNTIF(${startAddr}:${endAddr},0)`, result: 0 };
        tCell.alignment = { horizontal: 'center' };
        tCell.font = { bold: true };
        tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

        const pCell = row.getCell(percentCol);
        pCell.value = { formula: `IF(${datesToProcess.length}>0, ${tCell.address}/${datesToProcess.length}, 0)`, result: 0 };
        pCell.numFmt = '0%';
        pCell.alignment = { horizontal: 'center' };
        pCell.font = { bold: true };
        pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      });

      // COMPREHENSIVE BORDER PASS (Rows 13 to tableLastRow, Columns 2 to percentCol)
      const tableLastRow = 14 + studentNames.length;
      const blackBorder: any = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };

      for (let r = 13; r <= tableLastRow; r++) {
        const row = worksheet.getRow(r);
        for (let c = 2; c <= percentCol; c++) {
          const cell = row.getCell(c);
          cell.border = blackBorder;
          
          // Preserve custom horizontal alignment if it exists (e.g., student names are Left)
          const existingH = cell.alignment?.horizontal;
          cell.alignment = {
            vertical: 'middle',
            horizontal: existingH || 'center',
            wrapText: (r === 13 && c === totalCol) // Only wrap the Total header
          };
        }
      }

      // Also clean empty rows below students (say up to row 100)
      for (let r = tableLastRow + 1; r <= 100; r++) {
        const row = worksheet.getRow(r);
        for (let c = 1; c <= 150; c++) {
          const cell = row.getCell(c);
          if (cell.isMerged) {
            try { worksheet.unMergeCells(cell.master.address); } catch(e) {}
          }
          cell.value = null;
          cell.fill = { type: 'pattern', pattern: 'none' };
          cell.border = {};
        }
      }

      const outBuffer = await workbook.xlsx.writeBuffer();
      const fileName = `ASISTENCIA_${selectedGradoGen}_${selectedArea}.xlsx`;
      saveAs(new Blob([outBuffer]), fileName);
      showStatus('Asistencia generada con éxito.', 'success');
      setIsGenerating(false);
    } catch (error: any) {
      console.error(error);
      showStatus(`Error: ${error.message || 'Fallo en la generación'}`, 'error');
      setIsGenerating(false);
    }
  };

  const generatePlanilla = async () => {
    if (!masterTemplate) {
      showStatus('No hay una plantilla maestra configurada.', 'error');
      return;
    }
    setIsGenerating(true);
    showStatus('Consultando estudiantes y preparando planilla...', 'info');

    try {
      const q = query(collection(db, 'estudiantes'), where('grado', '==', selectedGradoGen));
      const snap = await getDocs(q);
      const studentNames = snap.docs
        .map(doc => (doc.data().nombre || '').toString().trim().toUpperCase())
        .filter(name => name.length > 0)
        .sort();

      if (studentNames.length === 0) {
        showStatus('No hay estudiantes registrados.', 'error');
        setIsGenerating(false);
        return;
      }

      // Robust base64 to Buffer conversion
      let buffer: ArrayBuffer;
      try {
        const base64Data = masterTemplate.includes(',') 
          ? masterTemplate.split(',')[1] 
          : masterTemplate;
        const cleanedBase64 = base64Data.replace(/\s/g, '');
        const binaryString = window.atob(cleanedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        buffer = bytes.buffer;
      } catch (e: any) {
        throw new Error(`Error decodificando la planilla: ${e.message}`);
      }
      
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer);
      } catch (e: any) {
        throw new Error(`Error al leer el archivo Excel: ${e.message}.`);
      }

      const worksheet = workbook.worksheets[0];

      // SET SHEET NAME AS REQUESTED: "Grado y Area"
      try {
        worksheet.name = `${selectedGradoGen} - ${selectedArea}`.substring(0, 31);
      } catch (e) {
        console.warn("Could not rename worksheet (formula conflict?):", e);
      }

      // Inject Metadata with guards
      if (config.cellDocente) worksheet.getCell(config.cellDocente).value = selectedDocente.toUpperCase();
      if (config.cellArea) worksheet.getCell(config.cellArea).value = selectedArea.toUpperCase();
      if (config.cellGrado) worksheet.getCell(config.cellGrado).value = selectedGradoGen;
      if (config.cellCount) worksheet.getCell(config.cellCount).value = studentNames.length;
      
      // Inject Students
      const cellFirst = config.cellFirstStudent || 'C17';
      const match = cellFirst.match(/([A-Z]+)(\d+)/);
      if (match) {
        const col = match[1];
        const startRow = parseInt(match[2]);
        studentNames.forEach((name, i) => {
          const rowIdx = startRow + i;
          // Security check: don't write too many rows if the template is small (optional but good)
          const cell = worksheet.getCell(`${col}${rowIdx}`);
          cell.value = name;
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          // Apply basic border to newly filled student cells
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }

      const outBuffer = await workbook.xlsx.writeBuffer();
      const fileName = `PLANILLA - ${selectedPeriodo} - ${selectedArea}.xlsx`;
      saveAs(new Blob([outBuffer]), fileName);
      showStatus('Planilla generada con éxito.', 'success');
      setIsGenerating(false);
    } catch (error: any) {
      console.error(error);
      showStatus(`Error: ${error.message || 'Fallo en la generación'}`, 'error');
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader 
        title="Planillas Institucionales" 
        description="Centralización y automatización de registros académicos. Gestión de listados oficiales y generación de planillas maestras sin alterar el formato institucional."
      />

      {/* Tabs Selection */}
      <div className="flex justify-center p-1 bg-white/5 backdrop-blur-xl rounded-2xl max-w-sm mx-auto mb-8 border border-white/10">
        {[
          { id: 'generar', label: 'Planilla Notas', icon: Download },
          { id: 'asistencia', label: 'Control Asistencia', icon: FileSpreadsheet }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === tab.id 
              ? 'bg-blue-600 text-white shadow-lg' 
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'generar' && (
        <div key="generar-tab" className="max-w-4xl mx-auto space-y-8">
          {/* Instrucciones Breves */}
          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 text-center space-y-4">
            <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest italic">Generación Automatizada</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest max-w-xl mx-auto leading-relaxed">
              Complete los campos a continuación para generar su planilla institucional. El sistema inyectará automáticamente los nombres de los estudiantes registrados del grado seleccionado.
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl space-y-10">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Configuración de Planilla</h3>
              <div className="flex items-center gap-4">
                {isConfigAuthorized && (
                  <>
                    <button 
                      onClick={() => setIsAdminMode(!isAdminMode)}
                      className={`p-2 transition-colors ${isAdminMode ? 'text-blue-500' : 'text-slate-700 hover:text-slate-500'}`}
                      title="Modo Administrador"
                    >
                      {isAdminMode ? <Unlock size={20} /> : <Lock size={20} />}
                    </button>
                    <button 
                      onClick={() => setShowConfig(!showConfig)}
                      className="p-2 text-slate-500 hover:text-white transition-colors"
                    >
                      <Settings size={20} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {showConfig && isConfigAuthorized && (
              <div className="overflow-hidden">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 p-6 bg-black/20 rounded-3xl border border-white/5">
                  {Object.entries(config).map(([k, v]) => (
                    <div key={k}>
                      <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2 block">{k.replace('cell','')}</label>
                      <input 
                        type="text" value={v} 
                        onChange={(e) => setConfig({...config, [k]: e.target.value.toUpperCase()})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isAdminMode && isConfigAuthorized && (
              <div className="p-8 bg-blue-600/5 border border-blue-500/20 rounded-[2rem] space-y-8">
                <div className="flex items-center gap-3 mb-2">
                  <Settings className="text-blue-500" size={18} />
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Panel Administrativo de Plantillas</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Planilla Upload */}
                  <div 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.xlsx';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) handleMasterUpload(file, 'planilla');
                      };
                      input.click();
                    }}
                    className="cursor-pointer py-10 border-2 border-dashed border-blue-500/30 rounded-2xl flex flex-col items-center justify-center gap-4 hover:bg-blue-500/10 transition-all"
                  >
                    <Upload size={24} className="text-blue-500" />
                    <p className="text-[10px] font-black text-white uppercase tracking-widest text-center">
                      {masterTemplate ? 'ACTUALIZAR PLANTILLA PLANILLA' : 'SUBIR PLANTILLA PLANILLA'}
                    </p>
                  </div>

                  {/* Asistencia Upload */}
                  <div 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.xlsx';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) handleMasterUpload(file, 'asistencia');
                      };
                      input.click();
                    }}
                    className="cursor-pointer py-10 border-2 border-dashed border-emerald-500/30 rounded-2xl flex flex-col items-center justify-center gap-4 hover:bg-emerald-500/10 transition-all"
                  >
                    <Upload size={24} className="text-emerald-500" />
                    <p className="text-[10px] font-black text-white uppercase tracking-widest text-center">
                      {masterAsistencia ? 'ACTUALIZAR PLANTILLA ASISTENCIA' : 'SUBIR PLANTILLA ASISTENCIA'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nombre del Docente</label>
                  <select 
                    value={selectedDocente} 
                    onChange={(e) => setSelectedDocente(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                  >
                    {DOCENTES.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Área / Asignatura</label>
                  <select 
                    value={selectedArea} 
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                  >
                    {AREAS.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Grado</label>
                    <select 
                      value={selectedGradoGen} 
                      onChange={(e) => setSelectedGradoGen(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                    >
                      {GRADOS.map(g => <option key={g} value={g} className="bg-slate-900">{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Periodo</label>
                    <select 
                      value={selectedPeriodo} 
                      onChange={(e) => setSelectedPeriodo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                    >
                      {PERIODOS.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
                    </select>
                  </div>
                </div>

                <button
                  onClick={generatePlanilla}
                  disabled={isGenerating || !masterTemplate}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-6 rounded-3xl text-[12px] uppercase tracking-[0.3em] shadow-[0_20px_40px_-10px_rgba(16,185,129,0.4)] transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-4"
                >
                  {isGenerating ? (
                    <>
                      <Sparkles className="animate-spin" size={20} />
                      PROCESANDO...
                    </>
                  ) : (
                    <>
                      <Download size={20} />
                      GENERAR PLANILLA
                    </>
                  )}
                </button>
              </div>
            </div>

            {!masterTemplate && !isAdminMode && (
              <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-4">
                <AlertCircle className="text-rose-500" />
                <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest">
                  ALERTA: La plantilla base no ha sido cargada. Active el Modo Administrador para subirla.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'asistencia' && (
        <div key="asistencia-tab" className="max-w-4xl mx-auto space-y-8">
          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 text-center space-y-4">
            <h3 className="text-sm font-black text-emerald-400 uppercase tracking-widest italic">Generar Control de Asistencia</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest max-w-xl mx-auto leading-relaxed">
              Sistema de control de asistencia bi-mensual. Seleccione las fechas de inicio y fin del periodo; el sistema generará automáticamente los campos de días y meses excluyendo fines de semana.
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nombre del Docente</label>
                  <select 
                    value={selectedDocente} 
                    onChange={(e) => setSelectedDocente(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                  >
                    {DOCENTES.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Área / Asignatura</label>
                  <select 
                    value={selectedArea} 
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                  >
                    {AREAS.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Grado</label>
                    <select 
                      value={selectedGradoGen} 
                      onChange={(e) => setSelectedGradoGen(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                    >
                      {GRADOS.map(g => <option key={g} value={g} className="bg-slate-900">{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Periodo</label>
                    <select 
                      value={selectedPeriodo} 
                      onChange={(e) => setSelectedPeriodo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black"
                    >
                      {PERIODOS.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block flex items-center justify-between">
                      Fecha Inicio Periodo
                      {selectedPeriodo === 'I' && <span className="text-[8px] text-blue-400 lowercase">ej: feb 02</span>}
                      {selectedPeriodo === 'II' && <span className="text-[8px] text-blue-400 lowercase">ej: mayo 04</span>}
                      {selectedPeriodo === 'III' && <span className="text-[8px] text-blue-400 lowercase">ej: ago 24</span>}
                    </label>
                    <input 
                      type="date" 
                      value={fechaInicio} 
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black focus:border-indigo-500 focus:bg-white/10 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block flex items-center justify-between">
                      Fecha Fin Periodo
                      {selectedPeriodo === 'I' && <span className="text-[8px] text-rose-400 lowercase">ej: mayo 01</span>}
                      {selectedPeriodo === 'II' && <span className="text-[8px] text-rose-400 lowercase">ej: ago 21</span>}
                      {selectedPeriodo === 'III' && <span className="text-[8px] text-rose-400 lowercase">ej: nov 27</span>}
                    </label>
                    <input 
                      type="date" 
                      value={fechaFin} 
                      onChange={(e) => setFechaFin(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white uppercase font-black focus:border-indigo-500 focus:bg-white/10 transition-all"
                    />
                  </div>
                </div>

                <button
                  onClick={generateAsistencia}
                  disabled={isGenerating || !masterAsistencia || !fechaInicio || !fechaFin}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-3xl text-[12px] uppercase tracking-[0.3em] shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)] transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-4"
                >
                  {isGenerating ? (
                    <>
                      <Sparkles className="animate-spin" size={20} />
                      PROCESANDO...
                    </>
                  ) : (
                    <>
                      <Download size={20} />
                      GENERAR ASISTENCIA
                    </>
                  )}
                </button>
              </div>
            </div>

            {!masterAsistencia && !isAdminMode && (
              <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-4">
                <AlertCircle className="text-rose-500" />
                <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest">
                  ALERTA: La plantilla de asistencia no ha sido cargada por el administrador.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {status.text && (
        <div className="fixed bottom-10 right-10 z-[100] animate-in slide-in-from-right-10 duration-500">
          <div className={`
            px-8 py-5 rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] border-t border-white/10 flex items-center gap-4 backdrop-blur-xl relative overflow-hidden group
            ${status.type === 'error' ? 'bg-rose-500/90 text-white' : 
              status.type === 'success' ? 'bg-emerald-600/90 text-white' : 
              'bg-blue-600/90 text-white'}
          `}>
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 animate-shine" />
            
            {status.type === 'error' ? <AlertOctagon size={24} className="shrink-0" /> : 
             status.type === 'success' ? <CheckCircle2 size={24} className="shrink-0" /> : 
             <Sparkles size={24} className="shrink-0 animate-pulse" />}
            
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1 leading-none">{status.type === 'error' ? 'Sistema / Alerta' : 'Sistema / Info'}</span>
              <span className="text-xs font-black uppercase tracking-widest leading-tight">{status.text}</span>
            </div>

            <button 
              onClick={() => showStatus('')}
              className="ml-4 p-2 hover:bg-white/10 rounded-xl transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title="SISTEMA"
        message="¿ESTÁ SEGURO DE REALIZAR ESTA ACCIÓN?"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
