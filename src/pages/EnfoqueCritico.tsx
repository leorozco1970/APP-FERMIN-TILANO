import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { Reporte } from '../lib/types';
import { PERIODOS, BARRERAS, DOCENTES } from '../lib/constants';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { GoogleGenAI, Type } from '@google/genai';
import { Sparkles, Loader2, Download, CheckCircle2, ShieldAlert, Lightbulb, Copy, BookOpen, Cpu, MoveUp, Zap, AlertCircle, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawExecutiveHeader, drawExecutiveFooter, PDF_COLORS, PDF_MARGIN, INTRO_TEXTS } from '../lib/pdfUtils';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface AIAnalysisResult {
  vinculoConstructivista: string;
  sugerenciasAccion: string;
  superacionBarreras: string;
}

import { PageHeader } from '../components/PageHeader';

export function EnfoqueCritico() {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroDocente, setFiltroDocente] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

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

  const filteredReportes = useMemo(() => {
    return reportes.filter(r => {
      const matchPeriodo = filtroPeriodo ? r.periodo === filtroPeriodo : true;
      const matchDocente = filtroDocente ? r.docente === filtroDocente : true;
      return matchPeriodo && matchDocente;
    });
  }, [reportes, filtroPeriodo, filtroDocente]);

  const barrerasStats = useMemo(() => {
    const totalReportes = filteredReportes.length;
    if (totalReportes === 0) return [];

    const statsByGrado: Record<string, any> = {};

    filteredReportes.forEach(r => {
      if (r.barreras && r.barreras.length > 0) {
        r.barreras.forEach(b => {
          if (!statsByGrado[b]) {
             statsByGrado[b] = { name: b, total: 0 };
          }
          const gradeKey = r.grado || 'Otro';
          if (!statsByGrado[b][gradeKey]) {
            statsByGrado[b][gradeKey] = 0;
          }
          statsByGrado[b][gradeKey]++;
          statsByGrado[b].total++;
        });
      }
    });

    return Object.values(statsByGrado).sort((a, b) => b.total - a.total);
  }, [filteredReportes]);

  const gradosPresentes = useMemo(() => {
    const grados = new Set<string>();
    filteredReportes.forEach(r => {
      if (r.grado) grados.add(r.grado);
    });
    return Array.from(grados).sort();
  }, [filteredReportes]);

  const estrategiasUnicas = useMemo(() => {
    const estrategiasSet = new Set<string>();
    filteredReportes.forEach(r => {
      if (r.estrategias) {
        r.estrategias.forEach(e => {
          if (e.trim()) estrategiasSet.add(e.trim());
        });
      }
    });
    return Array.from(estrategiasSet).sort();
  }, [filteredReportes]);

  const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

  const promptData = useMemo(() => {
    const grados = Array.from(new Set(filteredReportes.map(r => r.grado))).join(', ') || 'No especificado';
    const areas = Array.from(new Set(filteredReportes.map(r => r.area))).join(', ') || 'No especificada';
    const cantidad = filteredReportes.reduce((sum, r) => sum + (r.estudiantesPierden?.length || 0), 0);
    const barreras = Array.from(new Set(filteredReportes.flatMap(r => r.barreras || []))).join(', ') || 'Ninguna';
    const estrategias = Array.from(new Set(filteredReportes.flatMap(r => r.estrategias || []))).join(', ') || 'Ninguna';

    // Hash for caching: We use the combined period, teacher, and raw lengths to distinguish states.
    // Changing to v2 to invalidate previous caches that included 'orientador'.
    const cacheKey = `v2_ai_analysis_${filtroPeriodo || 'all'}_${filtroDocente || 'all'}_${filteredReportes.length}_${cantidad}`;

    return { grados, areas, cantidad, barreras, estrategias, cacheKey };
  }, [filteredReportes, filtroPeriodo, filtroDocente]);

  const generateAIAnalysis = async () => {
    if (filteredReportes.length === 0) {
      setAiError('No hay datos suficientes para analizar.');
      return;
    }

    setIsGenerating(true);
    setAiError(null);
    setCopySuccess(false);

    try {
      // Intentar recuperar de caché (Firestore o localStorage)
      // Usaremos un documento en settings para guardar cachés simples.
      const cacheRef = doc(db, 'settings', promptData.cacheKey);
      const cacheSnap = await getDoc(cacheRef);
      
      if (cacheSnap.exists()) {
        const cachedData = cacheSnap.data() as AIAnalysisResult;
        setAiAnalysis(cachedData);
        setIsGenerating(false);
        return;
      }

      // @ts-ignore
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        setAiError('La clave de la API de Gemini no está configurada o no tiene acceso al cliente. Comunícate con el administrador.');
        setIsGenerating(false);
        return;
      }
      
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `Actúa como Desarrollador Full-Stack Senior y Consultor en Tecnología Educativa (EdTech).
Reconfigura el análisis para que actúe bajo el Modelo Pedagógico Activo-Constructivista.
Tono: Profesional, inspirador y resolutivo.

Analiza los siguientes datos del docente ${filtroDocente || 'en general'}:
- Grados afectados: ${promptData.grados}
- Áreas implicadas: ${promptData.areas}
- Estudiantes con bajo rendimiento: ${promptData.cantidad}
- Barreras mapeadas: ${promptData.barreras}
- Estrategias usadas: ${promptData.estrategias}

Formato de Salida Obligatorio:
1. "vinculoConstructivista": Breve frase sobre cómo la práctica actual del docente encaja en el modelo activo.
2. "sugerenciasAccion": 2 estrategias específicas (ABP, Gamificación, Aprendizaje Cooperativo o Debates) alineadas al constructivismo.
3. "superacionBarreras": Una recomendación práctica para convertir la barrera detectada en una oportunidad de aprendizaje autónomo.

Restricciones: No usar prosa larga. Deben ser como viñetas impactantes. Total de palabras de la respuesta global: menos de 120.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              vinculoConstructivista: { type: Type.STRING },
              sugerenciasAccion: { type: Type.STRING },
              superacionBarreras: { type: Type.STRING }
            },
            required: ["vinculoConstructivista", "sugerenciasAccion", "superacionBarreras"]
          }
        }
      });

      if (response.text) {
        const parsedData = JSON.parse(response.text) as AIAnalysisResult;
        setAiAnalysis(parsedData);
        // Guardar en caché
        try {
          await setDoc(cacheRef, parsedData);
        } catch (e) {
          console.warn("No se pudo cachear el análisis", e);
        }
      } else {
        setAiError('No se pudo generar el análisis.');
      }
    } catch (error: any) {
      console.error("Error generating AI analysis:", error);
      setAiError('Error al conectar con la IA. Verifica tu conexión o la clave de API.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!aiAnalysis) return;
    
    // Formatear texto limpio para el acta
    const textoActa = `
ACTA DE CONSEJO ACADÉMICO - ANÁLISIS PEDAGÓGICO
I.E. FERMÍN TILANO
${new Date().toLocaleDateString()}
${filtroPeriodo ? `Periodo: ${filtroPeriodo}` : ''} ${filtroDocente ? `| Docente: ${filtroDocente}` : ''}

=== ANÁLISIS ACTIVO-CONSTRUCTIVISTA ===

VÍNCULO CONSTRUCTIVISTA: 
${aiAnalysis.vinculoConstructivista}

SUGERENCIAS DE ACCIÓN: 
${aiAnalysis.sugerenciasAccion}

SUPERACIÓN DE BARRERAS: 
${aiAnalysis.superacionBarreras}
`;
    
    navigator.clipboard.writeText(textoActa).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
    });
  };

    const exportActionPlanPDF = () => {
    if (!aiAnalysis) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    try {
      const startY = drawExecutiveHeader(doc, "PLAN DE ACCIÓN ESTRATÉGICO", INTRO_TEXTS.ANALISIS_PEDAGOGICO);

      let currentY = startY;

      doc.setFontSize(9);

      // Analysis Sections with clean cards
      const sections = [
        { title: "VÍNCULO CONSTRUCTIVISTA", content: aiAnalysis.vinculoConstructivista, color: [248, 250, 252], textColor: [0, 35, 102] },
        { title: "SUGERENCIAS DE ACCIÓN", content: aiAnalysis.sugerenciasAccion, color: [248, 250, 252], textColor: [0, 35, 102] },
        { title: "SUPERACIÓN DE BARRERAS", content: aiAnalysis.superacionBarreras, color: [248, 250, 252], textColor: [0, 35, 102] }
      ];

      sections.forEach(section => {
        const splitContent = doc.splitTextToSize(section.content, pageWidth - (PDF_MARGIN * 2) - 10);
        const cardHeight = (splitContent.length * 5) + 18;

        if (currentY + cardHeight > pageHeight - 65) {
          doc.addPage();
          currentY = drawExecutiveHeader(doc, "PLAN DE ACCIÓN ESTRATÉGICO");
        }

        // Clean Card background
        doc.setFillColor(section.color[0], section.color[1], section.color[2]);
        doc.setDrawColor(PDF_COLORS.STEEL_BORDERS[0], PDF_COLORS.STEEL_BORDERS[1], PDF_COLORS.STEEL_BORDERS[2]);
        doc.roundedRect(PDF_MARGIN, currentY, pageWidth - (PDF_MARGIN * 2), cardHeight, 1, 1, 'FD');
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(section.textColor[0], section.textColor[1], section.textColor[2]);
        doc.text(section.title, PDF_MARGIN + 5, currentY + 8);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50);
        doc.text(splitContent, PDF_MARGIN + 5, currentY + 16);
        
        currentY += cardHeight + 8;
      });

      // Teachers list
      const uniqueTeachers = Array.from(new Set(filteredReportes.map(r => r.docente).filter(Boolean))).sort();
      if (uniqueTeachers.length > 0) {
        if (currentY > pageHeight - 60) { 
          doc.addPage(); 
          currentY = drawExecutiveHeader(doc, "DOCENTES INVOLUCRADOS"); 
        }
        
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);
        doc.text("DOCENTES INVOLUCRADOS EN ESTE DIAGNÓSTICO:", PDF_MARGIN, currentY);
        currentY += 10;
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        uniqueTeachers.forEach(t => {
          if (currentY > pageHeight - 30) { 
            doc.addPage(); 
            currentY = drawExecutiveHeader(doc, "DOCENTES INVOLUCRADOS"); 
          }
          doc.text(`• ${t.toUpperCase()}`, PDF_MARGIN + 5, currentY);
          currentY += 6;
        });
      }

      // --- SIGNATURES START ---
      let sigY = currentY + 25;
      const directorX = pageWidth / 2;

      if (sigY > pageHeight - 80) {
        doc.addPage();
        sigY = 40;
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(PDF_COLORS.PRIMARY_NAVY[0], PDF_COLORS.PRIMARY_NAVY[1], PDF_COLORS.PRIMARY_NAVY[2]);

      // Rector
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.line(directorX - 40, sigY + 15, directorX + 40, sigY + 15);
      doc.text("MANUEL MALDONADO", directorX, sigY + 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("RECTOR INSTITUCIONAL", directorX, sigY + 25, { align: "center" });

      // Dynamic Team
      sigY += 35;
      if (sigY > pageHeight - 50) {
        doc.addPage();
        sigY = 40;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("EQUIPO DINAMIZADOR (DOCENTES):", PDF_MARGIN, sigY);
      sigY += 15;

      const allTeachersSigPlan = [...DOCENTES].sort();
      const sigColsCount = 2;
      const sigLineWSize = 60;
      const sigSpacingXSize = (pageWidth - 2 * PDF_MARGIN - sigColsCount * sigLineWSize) / (sigColsCount - 1);
      const sigRowHeightSize = 30;
      let sigCurrentYPos = sigY;

      for (let i = 0; i < allTeachersSigPlan.length; i++) {
          const col = i % sigColsCount;
          if (col === 0 && sigCurrentYPos > pageHeight - 35) {
              doc.addPage();
              sigCurrentYPos = 40;
          }
          const x = PDF_MARGIN + col * (sigLineWSize + sigSpacingXSize);
          const y = sigCurrentYPos;
          doc.line(x, y, x + sigLineWSize, y);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.text(allTeachersSigPlan[i].toUpperCase(), x + sigLineWSize / 2, y + 4, { align: 'center' });
          if (col === sigColsCount - 1 || i === allTeachersSigPlan.length - 1) {
              sigCurrentYPos += sigRowHeightSize;
          }
      }
      // --- SIGNATURES END ---

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawExecutiveFooter(doc, i, pageCount);
      }

      doc.save(`Plan_Accion_Estrategico_${filtroDocente || 'General'}.pdf`);
    } catch (e) {
      console.error("Error generating PDF", e);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <PageHeader 
        title="ANALISIS PEDAGOGICO"
        description="Sincronización Pedagógica Integral: Análisis de Barreras y Despliegue de Intervenciones Críticas para la Transformación del Rendimiento Escolar"
        imageUrl="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800"
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#1e1e1e] p-6 rounded-3xl border border-white/5 shadow-2xl gap-6">
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-600/20">
              <Zap size={20} className="text-blue-500" />
           </div>
           <div>
              <h2 className="text-base font-black text-white uppercase tracking-widest">Filtros</h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Segmentación de datos académicos</p>
           </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <select
            value={filtroDocente}
            onChange={(e) => setFiltroDocente(e.target.value)}
            className="executive-input px-6 min-w-[220px]"
          >
            <option value="" className="bg-[#1A1A1A]">TODOS LOS DOCENTES</option>
            {DOCENTES.map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d}</option>)}
          </select>
          <select
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            className="executive-input px-6 min-w-[180px]"
          >
            <option value="" className="bg-[#1A1A1A]">TODOS LOS PERIODOS</option>
            {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">PERIODO {p}</option>)}
          </select>
        </div>
      </div>

      <div className="executive-card bg-[#1e1e1e]/80 p-10 border-white/5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          
          <div className="lg:pr-12">
            <div className="flex items-center gap-4 mb-4">
              <ShieldAlert className="text-rose-500 animate-pulse" size={28} />
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Matriz de Barreras Críticas</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Identificación de puntos ciegos pedagógicos</p>
              </div>
            </div>
            
            {filteredReportes.length === 0 ? (
              <div className="h-80 flex items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem]">
                <AlertCircle className="text-slate-800 mr-2" size={24} />
                <p className="text-slate-700 font-bold uppercase tracking-widest text-[11px]">Ausencia de reportes en este cuadrante</p>
              </div>
            ) : (
              <div className="h-80 mt-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barrerasStats.filter(b => b.total > 0)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                    <XAxis type="number" allowDecimals={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} axisLine={{stroke: '#334155'}} />
                    <YAxis dataKey="name" type="category" width={140} tick={{fill: '#cbd5e1', fontSize: 10, fontWeight: 700}} axisLine={{stroke: '#334155'}} />
                    <Tooltip 
                      cursor={{fill: '#1e293b'}}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)' }}
                      itemStyle={{ color: '#f1f5f9', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                    />
                    <Legend iconType="rect" wrapperStyle={{ fontSize: '9px', color: '#64748b', fontWeight: 'black', textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: '20px' }} />
                    {gradosPresentes.map((grado, index) => (
                      <Bar key={grado} dataKey={grado} stackId="a" fill={COLORS[index % COLORS.length]} radius={index === gradosPresentes.length - 1 ? [0, 6, 6, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pt-12 lg:pt-0 lg:pl-12 flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <Lightbulb className="text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]" size={28} />
              <div>
                 <h3 className="text-xl font-black text-white uppercase tracking-tighter">PROTOCOLOS DE ANALISIS</h3>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Estrategias desplegadas por la tripulación docente</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-black/20 p-6 rounded-[2.5rem] border border-white/5 mt-6 custom-scrollbar max-h-[350px]">
              {estrategiasUnicas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-20">
                  <BookOpen size={64} className="mb-4" />
                  <p className="text-[11px] font-black uppercase tracking-[0.3em]">Sin datos de intervención registrados</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {estrategiasUnicas.map((estrategia, index) => (
                    <div key={index} className="flex items-start gap-4 p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-blue-500/30 hover:bg-white/10 transition-all duration-300 group shadow-lg">
                      <div className="bg-blue-500/10 text-blue-400 p-2 rounded-xl shrink-0 mt-0.5 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-inner">
                        <CheckCircle2 size={18} />
                      </div>
                      <span className="text-[11px] text-slate-300 font-bold uppercase tracking-tight leading-relaxed group-hover:text-white transition-colors">{estrategia}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="bg-[#1e1e1e] p-12 rounded-[3.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] -mr-32 -mt-32 pointer-events-none group-hover:bg-blue-600/10 transition-colors duration-1000 animate-pulse-slow"></div>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
               <Sparkles className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" size={36} />
               <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">ANALISIS PEDAGOGICO</h3>
            </div>
          </div>
          <button
            onClick={generateAIAnalysis}
            disabled={isGenerating || filteredReportes.length === 0}
            className={`flex items-center gap-3 text-white font-black py-4 px-10 rounded-2xl transition-all shadow-2xl uppercase text-[11px] tracking-[0.3em] ${
              isGenerating 
                ? 'bg-slate-800 cursor-not-allowed opacity-50' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/40 hover:-translate-y-1 active:scale-95'
            }`}
          >
            {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Cpu size={20} />}
            {isGenerating ? 'Analizando...' : 'Generar Análisis'}
          </button>
        </div>

        {aiError && (
          <div className="bg-rose-500/10 text-rose-400 p-6 rounded-2xl mb-8 text-[11px] border border-rose-500/20 font-black uppercase tracking-[0.2em] flex items-center gap-4 animate-in slide-in-from-top-4">
            <AlertCircle size={24} /> {aiError}
          </div>
        )}

        {aiAnalysis ? (
          <div className="bg-black/40 p-10 rounded-[3rem] border border-white/5 shadow-inner relative z-10 animate-in fade-in duration-1000">
            
            <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/5">
               <div className="w-1.5 h-10 bg-blue-600 rounded-full"></div>
               <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">
                 Informe de Analisis Pedagogico: <span className="text-blue-400 font-black">{filtroDocente || 'CONSULTA MULTIDIMENSIONAL'}</span>
               </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
              {/* Tarjeta 1 */}
              <div className="bg-[#1A1A1A] border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-blue-500/40 transition-all duration-500 hover:-translate-y-2 shadow-2xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-600/10 transition-colors"></div>
                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="bg-blue-500/10 text-blue-500 p-3 rounded-2xl border border-blue-500/20 shadow-inner">
                    <BookOpen size={24} />
                  </div>
                  <h5 className="font-black text-white text-xs uppercase tracking-widest">ADN Constructivista</h5>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed relative font-medium uppercase tracking-tight italic">
                  "{aiAnalysis.vinculoConstructivista}"
                </p>
              </div>

              {/* Tarjeta 2 */}
              <div className="bg-[#1A1A1A] border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-amber-500/40 transition-all duration-500 hover:-translate-y-2 shadow-2xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/10 transition-colors"></div>
                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="bg-amber-500/10 text-amber-500 p-3 rounded-2xl border border-amber-500/20 shadow-inner">
                    <MoveUp size={24} />
                  </div>
                  <h5 className="font-black text-white text-xs uppercase tracking-widest">Sugerencias Tácticas</h5>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed relative font-medium uppercase tracking-tight italic">
                  "{aiAnalysis.sugerenciasAccion}"
                </p>
              </div>

              {/* Tarjeta 3 */}
              <div className="bg-[#1A1A1A] border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-emerald-500/40 transition-all duration-500 hover:-translate-y-2 shadow-2xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/10 transition-colors"></div>
                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="bg-emerald-500/10 text-emerald-500 p-3 rounded-2xl border border-emerald-500/20 shadow-inner">
                    <Zap size={24} />
                  </div>
                  <h5 className="font-black text-white text-xs uppercase tracking-widest">Ataque a Barreras</h5>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed relative font-medium uppercase tracking-tight italic">
                  "{aiAnalysis.superacionBarreras}"
                </p>
              </div>
            </div>

            {/* Actions for Document */}
            <div className="flex flex-col sm:flex-row justify-center gap-6 pt-10 border-t border-white/5">
               <button
                  onClick={exportActionPlanPDF}
                  className="flex items-center justify-center gap-3 bg-[#0A1128] hover:bg-[#002366] text-white font-black text-[10px] tracking-[0.3em] py-5 px-10 rounded-2xl transition-all shadow-2xl border border-white/5 hover:border-blue-500/30 uppercase"
                >
                  <Download size={20} />
                  Descargar Protocolo PDF
                </button>
                <button
                  onClick={handleCopyToClipboard}
                  className={`flex items-center justify-center gap-3 font-black text-[10px] tracking-[0.3em] py-5 px-10 rounded-2xl transition-all shadow-2xl uppercase border ${copySuccess ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-[#D4AF37] border-[#D4AF37]/30 hover:bg-white/10'}`}
                >
                  {copySuccess ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                  {copySuccess ? 'TOKEN COPIADO' : 'COPIAR AL PORTAPAPELES'}
                </button>
            </div>
          </div>
        ) : (
          !isGenerating && !aiError && (
            <div className="text-center py-24 bg-black/20 rounded-[3rem] border border-dashed border-white/10 group-hover:border-blue-500/20 transition-all duration-700">
              <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5 group-hover:scale-110 transition-transform duration-700">
                <Sparkles className="text-slate-700" size={40} />
              </div>
              <p className="text-slate-600 font-black uppercase tracking-[0.4em] text-[12px]">Sin análisis solicitado</p>
              <p className="text-[9px] text-slate-800 font-black uppercase tracking-[0.2em] mt-3 italic opacity-40">Haga clic en el botón superior para iniciar el procesamiento</p>
            </div>
          )
        )}
      </div>

    </div>
  );
}
