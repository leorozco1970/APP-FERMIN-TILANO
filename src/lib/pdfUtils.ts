import jsPDF from 'jspdf';
import { LOGO_BASE64 } from './logo';

// Professional Palette Constants for executive diagramming
export const PDF_COLORS = {
  PRIMARY_NAVY: [0, 35, 102] as [number, number, number], // #002366 - Navy Blue Solid
  GOLD_MATTE: [197, 161, 67] as [number, number, number], // #C5A143 - Gold Matte
  CLOUD_ZEBRA: [242, 242, 242] as [number, number, number], // #F2F2F2 - Zebra Gray
  TEXT_DARK_GRAY: [40, 40, 40] as [number, number, number], // Dark Text
  TEXT_LIGHT_GRAY: [100, 100, 100] as [number, number, number], // Secondary
  STEEL_BORDERS: [180, 180, 180] as [number, number, number], // Darker for better visibility
  WHITE: [255, 255, 255] as [number, number, number]
};

export const PDF_MARGIN = 25; // 2.5cm strictly

export const INTRO_TEXTS = {
  COMISION_EVALUACION: "En cumplimiento de lo establecido en el Decreto 1290 de 2009 y de conformidad con el Sistema Institucional de Evaluación de los Estudiantes (SIEE) de la Institución Educativa Fermín Tilano, se procede a la presente sesión de la Comisión de Evaluación y Promoción. Este documento tiene como propósito analizar de manera integral el desempeño académico y convivencial de los estudiantes correspondientes al periodo en curso, con el fin de definir estrategias pedagógicas de apoyo y garantizar el debido proceso en la formación académica, velando siempre por la excelencia educativa y la equidad institucional.",
  SEGUIMIENTO_ACADEMICO: "El presente reporte constituye un instrumento estratégico de gestión de aula diseñado para el monitoreo permanente y sistemático del progreso escolar en la Institución Educativa Fermín Tilano. Su objetivo primordial es la identificación temprana de alertas académicas y factores de riesgo de reprobación, permitiendo la implementación oportuna de planes de mejoramiento y la armonización de las prácticas pedagógicas. A través de este consolidado, se facilita la toma de decisiones informadas por parte del cuerpo docente y directivo, garantizando el derecho a una educación con dignidad y calidad para todos los estudiantes.",
  ACTA_CORTE_PREVENTIVO: "En el marco de la estrategia de Alerta Temprana y el Plan de Formación Integral de la Institución Educativa Fermín Tilano, se suscribe la presente Acta de Corte Preventivo. Este instrumento tiene como finalidad la identificación y caracterización de estudiantes que presentan dificultades persistentes en el alcance de los logros previstos para el periodo académico en curso. El presente reporte se emite con carácter preventivo para activar de manera inmediata los protocolos de acompañamiento pedagógico, estableciendo compromisos específicos entre la institución, el docente y el acudiente, con el objetivo de mitigar el riesgo de reprobación y fortalecer los procesos de aprendizaje antes del cierre oficial del periodo.",
  CONSOLIDADO_DESEMPEÑO_BAJO: "El presente reporte identifica a los estudiantes que, al finalizar el periodo académico, presentan desempeños pendientes en las competencias previstas para el área. Este consolidado tiene como objetivo formalizar el estado actual del proceso educativo para activar de manera inmediata las acciones de mejoramiento y apoyo pedagógico requeridos. Los resultados aquí descritos señalan la necesidad de un compromiso conjunto entre la institución, el docente, el estudiante y los padres de familia para alcanzar los logros institucionales en el siguiente periodo académico.",
  INFORME_DIRECTIVO: "El presente informe consolida los resultados académicos institucionales del periodo evaluado, proporcionando una visión detallada de los indicadores de desempeño escolar en la Institución Educativa Fermín Tilano. Este documento desglosa de manera estadística la incidencia de alertas en corte preventivo y situaciones de desempeño pendiente, categorizadas por áreas, grados y docentes responsables. Su propósito es servir como insumo técnico para la dirección docente en la identificación de nodos críticos de pérdida académica, permitiendo la toma de decisiones estratégicas y la validación de los procesos de seguimiento y actas generadas para el acompañamiento estudiantil.",
  REGISTRO_CONVIVENCIA: "En concordancia con el marco legal vigente y el Sistema Nacional de Convivencia Escolar, se fundamenta este registro bajo el Artículo 69 del Decreto 1965 de 2013, el cual clasifica las situaciones que afectan la convivencia en Tipos I, II y III. De igual manera, se da estricto cumplimiento a lo estipulado en el Manual de Convivencia Institucional, específicamente en su Artículo 70 (Situaciones Tipo I) referidas a conflictos manejados por mediación pedagógica; Artículo 72 (Situaciones Tipo II) correspondientes a conductas que requieren activación de protocolos por reincidencia o afectación a la integridad; y el Artículo 74 (Situaciones Tipo III) sobre actos que constituyen presuntos delitos. A continuación, se relacionan nominalmente los estudiantes que durante el presente periodo académico fueron objeto de seguimiento convivencial, detallando la tipificación de la falta y la cantidad de actas registradas en su proceso formativo:",
  ESTRATEGIA_FORMACION: "El presente documento consolida la creación y formalización de la estrategia pedagógica dentro de la Institución Educativa Fermín Tilano. Este es el espacio donde organizamos, damos valor y visibilidad a las grandes iniciativas que nacen para el beneficio de nuestros estudiantes, ya sean Centros de Interés, semilleros, clubes o proyectos de aula.\nEl propósito de este registro es asegurar que nuestra propuesta esté bien estructurada: que tenga un horario claro, un grupo de estudiantes definido, proyección para sostenerse en el tiempo y el respaldo de las directivas del colegio. Con esto, garantizamos de forma sencilla y directa que la estrategia cumpla con los pasos necesarios para ser oficial y reconocida por el Ministerio de Educación Nacional.",
  SEGUIMIENTO_PFI: "Seguimiento sistemático a las metas de transferencia y apropiación curricular. Este reporte consolida el avance de los objetivos trazados en el Plan de Formación Integral (PFI), permitiendo una lectura técnica de los indicadores de aprendizaje y el fortalecimiento de las prácticas pedagógicas en el aula.",
  ANALISIS_PEDAGOGICO: "El presente Plan de Acción Estratégico constituye una sugerencia pedagógica diseñada para el fortalecimiento de los procesos de enseñanza y aprendizaje. Basado en el Modelo Crítico-Constructivista, este documento consolida el diagnóstico realizado a través del Sistema de Seguimiento Académico, transformando las barreras de aprendizaje identificadas en oportunidades de intervención docente. El objetivo de este plan es proporcionar al docente un conjunto de estrategias personalizadas que permitan mediar el conocimiento de manera efectiva, ajustándose a las realidades socio-emocionales y ritmos de aprendizaje de cada grupo.",
  PLAN_AULA: "El presente Plan de Aula constituye el instrumento oficial de planeación pedagógica de la Institución Educativa Fermín Tilano. En este documento se sistematizan las estrategias de enseñanza, los referentes de calidad y las evidencias de aprendizaje diseñadas para el periodo correspondiente, garantizando la coherencia curricular y el seguimiento efectivo al proceso de formación estudiantil conforme a los lineamientos del PEI y las mallas curriculares vigentes."
};

/**
 * Signature Blocks for Institutional Validity
 */
export const drawSignatureLines = (d: jsPDF, names: string[], yPosition: number) => {
  const pageWidth = d.internal.pageSize.width;
  const count = names.length;
  const spacing = (pageWidth - (PDF_MARGIN * 2)) / count;
  const navy = PDF_COLORS.PRIMARY_NAVY;

  d.setDrawColor(navy[0], navy[1], navy[2]);
  d.setLineWidth(0.2);
  d.setFontSize(8);
  d.setFont("helvetica", "bold");

  names.forEach((name, i) => {
    const x = PDF_MARGIN + (i * spacing) + (spacing / 2);
    const lineHalfWidth = 25;
    
    d.line(x - lineHalfWidth, yPosition, x + lineHalfWidth, yPosition);
    d.setTextColor(navy[0], navy[1], navy[2]);
    d.text(name.toUpperCase(), x, yPosition + 5, { align: "center" });
    d.setFont("helvetica", "normal");
    d.setFontSize(7);
    d.text("Firma Autorizada", x, yPosition + 9, { align: "center" });
  });
};

/**
 * Institutional Header - High Precision Multi-line Center Format
 * Designed for the FIRST page only.
 */
export const drawExecutiveHeader = (d: jsPDF, title: string, introText: string = "", metaInfo?: string) => {
  const pageWidth = d.internal.pageSize.width;
  const isFirstPage = (d as any).internal.getCurrentPageInfo().pageNumber === 1;
  const navy = PDF_COLORS.PRIMARY_NAVY;
  const gold = PDF_COLORS.GOLD_MATTE;

  if (isFirstPage) {
    // 1. Cleaning background (White Header)
    d.setFillColor(255, 255, 255);
    d.rect(0, 0, pageWidth, 55, "F");

    // 2. Decorative Top Borders
    d.setFillColor(navy[0], navy[1], navy[2]);
    d.rect(0, 0, pageWidth, 3, "F"); 
    d.setFillColor(gold[0], gold[1], gold[2]);
    d.rect(0, 3, pageWidth, 1, "F"); 

    // 3. Shield (Logo)
    const logoSize = 22; 
    const logoX = 23; 
    const logoY = 7;
    try {
      d.addImage(LOGO_BASE64, "PNG", logoX, logoY, logoSize, logoSize);
    } catch(e) {
      console.warn("Logo failed to load");
    }

    // 4. Institutional Text
    const centerX = pageWidth / 2 + 10; 
    
    d.setTextColor(navy[0], navy[1], navy[2]);
    d.setFont("helvetica", "bold");
    d.setFontSize(11);
    d.text("INSTITUCIÓN EDUCATIVA FERMÍN TILANO", centerX, 16, { align: "center" });
    
    d.setTextColor(80, 80, 80);
    d.setFont("helvetica", "bold");
    d.setFontSize(8);
    d.text("CHORRERA – JUAN DE ACOSTA, ATLÁNTICO", centerX, 21, { align: "center" });
    
    d.setFont("helvetica", "normal");
    d.setFontSize(6.5);
    d.text("Reconocimiento Oficial de la SED según Resolución N° 00453 del 01/02/2010", centerX, 26, { align: "center" });
    d.text("DANE: 208372000040 | NIT: 802009383-6", centerX, 30, { align: "center" });
    d.text("Correo: secretaria@fermintilano.edu.co", centerX, 34, { align: "center" });

    // 5. Section Divider
    d.setDrawColor(navy[0], navy[1], navy[2]);
    d.setLineWidth(0.3);
    d.line(PDF_MARGIN, 40, pageWidth - PDF_MARGIN, 40);
  } else {
    // COMPACT HEADER for continuation pages
    d.setFillColor(navy[0], navy[1], navy[2]);
    d.rect(0, 0, pageWidth, 2, "F");
  }

  // 4. Report Title
  d.setTextColor(navy[0], navy[1], navy[2]);
  d.setFontSize(12);
  d.setFont("helvetica", "bold");
  
  const titleY = isFirstPage ? 52 : 12;
  const maxTitleWidth = pageWidth - (PDF_MARGIN * 2);
  const splitTitleLines = d.splitTextToSize(title.toUpperCase(), maxTitleWidth);
  let nextY = titleY;
  
  d.text(splitTitleLines, pageWidth / 2, titleY, { align: "center" });
  nextY += (splitTitleLines.length * 6) + 3;

  // 5. Meta Info (Filters) - ONLY FIRST PAGE
  if (isFirstPage && metaInfo) {
    d.setFontSize(9.5);
    d.setFont("helvetica", "bold");
    d.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
    d.text(metaInfo.toUpperCase(), pageWidth / 2, nextY, { align: "center" });
    nextY += 8;
  }
  
  if (isFirstPage && introText) {
    d.setTextColor(PDF_COLORS.TEXT_DARK_GRAY[0], PDF_COLORS.TEXT_DARK_GRAY[1], PDF_COLORS.TEXT_DARK_GRAY[2]);
    d.setFontSize(9);
    d.setFont("helvetica", "normal");
    
    const textWidth = pageWidth - (PDF_MARGIN * 2);
    const introLines = d.splitTextToSize(introText, textWidth);
    
    d.text(introLines, PDF_MARGIN, nextY, { 
      align: "justify", 
      maxWidth: textWidth 
    });
    
    nextY += (introLines.length * 4.5) + 8;
  }

  return nextY;
};

/**
 * Common Table Styles for the "Perfect, Beautiful" look requested
 */
export const getPerfectTableStyles = () => ({
  styles: {
    fontSize: 6,
    cellPadding: 1,
    lineWidth: 0.2,
    lineColor: PDF_COLORS.STEEL_BORDERS,
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: 'normal' as const,
    valign: 'middle' as const,
    overflow: 'linebreak' as const,
  },
  headStyles: {
    fillColor: PDF_COLORS.PRIMARY_NAVY as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
    fontSize: 6.5,
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    cellPadding: 2,
  },
  alternateRowStyles: {
    fillColor: PDF_COLORS.CLOUD_ZEBRA as [number, number, number],
  },
  margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 20 },
});

/**
 * CIERRE DOCUMENTAL Y PIE DE PÁGINA
 */
export const drawExecutiveFooter = (d: jsPDF, pageNumber: number, totalPages: number) => {
  const pageWidth = d.internal.pageSize.width;
  const pageHeight = d.internal.pageSize.height;

  d.setDrawColor(220, 220, 220);
  d.setLineWidth(0.1);
  d.line(PDF_MARGIN, pageHeight - 15, pageWidth - PDF_MARGIN, pageHeight - 15);

  d.setFontSize(7);
  d.setTextColor(PDF_COLORS.TEXT_LIGHT_GRAY[0], PDF_COLORS.TEXT_LIGHT_GRAY[1], PDF_COLORS.TEXT_LIGHT_GRAY[2]);
  d.setFont("helvetica", "normal");
  d.text(`PLATAFORMA TILANISTA • LEONARDO OROZCO • TUTOR PTA/FI – ATLÁNTICO • Página ${pageNumber} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
};

/**
 * Watermark for executive reports (Only on pages > 1)
 */
export const drawWatermark = (d: jsPDF) => {
  const pageWidth = d.internal.pageSize.width;
  const pageHeight = d.internal.pageSize.height;
  
  d.saveGraphicsState();
  d.setGState(new (d as any).GState({ opacity: 0.03 }));
  d.setTextColor(PDF_COLORS.GOLD_MATTE[0], PDF_COLORS.GOLD_MATTE[1], PDF_COLORS.GOLD_MATTE[2]);
  d.setFontSize(50);
  d.setFont("helvetica", "bold");
  d.text("I.E. FERMÍN TILANO", pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
  d.restoreGraphicsState();
};

/**
 * Error handler for Firestore operations
 */
export const handleFirestoreError = (error: any, type: string, path: string) => {
  console.error(`Firestore Error [${type}] at [${path}]:`, error);
  throw JSON.stringify({
    error: error.message || 'Error desconocido',
    operationType: type,
    path,
  });
};

