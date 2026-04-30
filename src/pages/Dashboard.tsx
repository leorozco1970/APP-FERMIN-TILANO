import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Reporte } from '../lib/types';
import { PERIODOS } from '../lib/constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, LabelList, AreaChart, Area } from 'recharts';
import { Users, AlertTriangle, TrendingDown, BookOpen, Activity, CheckCircle2, Download, X, BrainCircuit } from 'lucide-react';
import html2canvas from 'html2canvas';

import { PageHeader } from '../components/PageHeader';
import { InstitutionalLoading } from '../components/InstitutionalLoading';

import { formatName } from '../lib/formatter';

export function Dashboard() {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [matriculasGlobales, setMatriculasGlobales] = useState<Record<string, number>>({});
  const [retirados, setRetirados] = useState<any[]>([]);
  const [estudiantesInclusion, setEstudiantesInclusion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroGrado, setFiltroGrado] = useState('');
  const [filtroDocente, setFiltroDocente] = useState('');
  const [filtroArea, setFiltroArea] = useState('');

  // Drawer state
  const [drawerData, setDrawerData] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    color: string;
    students: { nombre: string; nota: string; estado: string }[];
  } | null>(null);

  useEffect(() => {
    // Wait for auth to be ready if it's currently null
    let unsubscribeReportes: () => void = () => {};
    let unsubscribeMatriculas: () => void = () => {};
    let unsubscribeApoyo: () => void = () => {};
    let unsubscribeRetirados: () => void = () => {};

    const setupListeners = () => {
      // Live reportes
      const q = query(collection(db, 'reportes'));
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

      // Live matriculas
      unsubscribeMatriculas = onSnapshot(collection(db, 'matriculas'), (snapshot) => {
        const data: Record<string, number> = {};
        snapshot.forEach((doc) => {
          data[doc.id] = doc.data().totalEstudiantes || 0;
        });
        setMatriculasGlobales(data);
      }, (err) => {
         console.warn("Matriculas sync delayed:", err);
      });

      // Live Apoyo (Inclusión PIAR)
      unsubscribeApoyo = onSnapshot(collection(db, 'estudiantes_inclusion'), (snapshot) => {
        const data: any[] = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        setEstudiantesInclusion(data);
      }, (err) => {
         console.warn("Inclusion sync delayed:", err);
      });

      // Live Retirados
      unsubscribeRetirados = onSnapshot(collection(db, 'retirados'), (snapshot) => {
        const data: any[] = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        setRetirados(data);
      }, (err) => {
         console.warn("Retirados sync delayed:", err);
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
        unsubscribeApoyo();
        unsubscribeRetirados();
      };
    }

    return () => {
      unsubscribeReportes();
      unsubscribeMatriculas();
      unsubscribeApoyo();
      unsubscribeRetirados();
    };
  }, []);

  // Compute unique filter options
  const opcionesGrado = useMemo(() => Array.from(new Set(reportes.map(r => r.grado))).sort(), [reportes]);
  const opcionesDocente = useMemo(() => Array.from(new Set(reportes.map(r => r.docente))).sort(), [reportes]);
  const opcionesArea = useMemo(() => Array.from(new Set(reportes.map(r => r.area))).sort(), [reportes]);


  const filteredReportes = useMemo(() => {
    return reportes.filter(r => {
      if (filtroPeriodo && r.periodo !== filtroPeriodo) return false;
      if (filtroGrado && r.grado !== filtroGrado) return false;
      if (filtroDocente && r.docente !== filtroDocente) return false;
      if (filtroArea && r.area !== filtroArea) return false;
      return true;
    });
  }, [reportes, filtroPeriodo, filtroGrado, filtroDocente, filtroArea]);

  const filteredRetirados = useMemo(() => {
    if (!filtroGrado) return retirados;
    return retirados.filter(r => r.grado === filtroGrado);
  }, [retirados, filtroGrado]);

  const filteredInclusion = useMemo(() => {
    if (!filtroGrado) return estudiantesInclusion;
    return estudiantesInclusion.filter(r => r.grado === filtroGrado);
  }, [estudiantesInclusion, filtroGrado]);

  const stats = useMemo(() => {
    const uniqueMatriculasTable: Record<string, number> = {};
    const uniquePreventivo = new Set<string>();
    const uniquePierden = new Set<string>();
    
    // Create a set of retired student identifiers for efficient exclusion
    const retiredSet = new Set(retirados.map(r => `${r.nombre.trim().toUpperCase()}-${r.grado}`));

    filteredReportes.forEach(r => {
      // Internal calculation for cases
      if (r.estudiantesPreventivo) {
        r.estudiantesPreventivo.forEach(est => {
          if (est.trim()) {
            const id = `${est.trim().toUpperCase()}-${r.grado}`;
            if (!retiredSet.has(id)) {
              uniquePreventivo.add(id);
            }
          }
        });
      }

      if (r.estudiantesPierden) {
         r.estudiantesPierden.forEach(est => {
           if (est.trim()) {
             const normalizedEst = est.trim().toUpperCase();
             const id = `${normalizedEst}-${r.grado}`;
             
             if (!retiredSet.has(id)) {
               const accion = r.accionesMejoramiento?.find(a => a.estudiante.trim().toUpperCase() === normalizedEst);
               if (!accion || accion.aprobo !== 'Sí') {
                 uniquePierden.add(id);
               }
             }
           }
         });
      }
    });

    // Use global matriculas instead of report-based ones
    let totalMatriculas = 0;
    if (filtroGrado) {
       totalMatriculas = matriculasGlobales[filtroGrado] || 0;
       
       // Fallback to report-based if global not set yet
       if (totalMatriculas === 0) {
         const r = filteredReportes.find(rep => rep.grado === filtroGrado);
         if (r) totalMatriculas = r.totalEstudiantes || 0;
       }
    } else {
       totalMatriculas = Object.values(matriculasGlobales).reduce((a, b) => a + b, 0);
       
       // Fallback to report-based sum if global sum is 0
       if (totalMatriculas === 0) {
          filteredReportes.forEach(r => {
            if (!uniqueMatriculasTable[r.grado]) {
              uniqueMatriculasTable[r.grado] = r.totalEstudiantes || 0;
            }
          });
          totalMatriculas = Object.values(uniqueMatriculasTable).reduce((a, b) => a + b, 0);
       }
    }

    const totalPierden = uniquePierden.size;
    const totalPreventivo = uniquePreventivo.size;
    
    // Subtract retired students from total enrollment for active calculations
    const activeMatriculas = Math.max(0, totalMatriculas - filteredRetirados.length);
    
    const porcentajePerdida = activeMatriculas > 0 ? ((totalPierden / activeMatriculas) * 100).toFixed(1) : '0.0';
    const porcentajeAprobacion = activeMatriculas > 0 ? (100 - parseFloat(porcentajePerdida)).toFixed(1) : '0.0';

    return { totalMatriculas: activeMatriculas, totalPreventivo, totalPierden, porcentajePerdida, porcentajeAprobacion, bruta: totalMatriculas };
  }, [filteredReportes, matriculasGlobales, filtroGrado]);

  const status = useMemo(() => {
    const p = parseFloat(stats.porcentajePerdida);
    if (p > 20) return 'critico';
    if (p >= 10) return 'riesgo';
    return 'optimo';
  }, [stats.porcentajePerdida]);

  const dataPorArea = useMemo(() => {
    const map: Record<string, { area: string; totalEstudiantes: number; pierden: number }> = {};
    
    filteredReportes.forEach(r => {
      if (!map[r.area]) {
        map[r.area] = { area: r.area, totalEstudiantes: 0, pierden: 0 };
      }
      map[r.area].totalEstudiantes += r.totalEstudiantes;
      let reprueban = 0;
      if (r.estudiantesPierden) {
         r.estudiantesPierden.forEach(est => {
           const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
           if (!accion || accion.aprobo !== 'Sí') reprueban++;
         });
      }
      map[r.area].pierden += reprueban;
    });

    return Object.values(map).map(d => ({
      ...d,
      porcentaje: d.totalEstudiantes > 0 ? Number(((d.pierden / d.totalEstudiantes) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.pierden - a.pierden).slice(0, 10);
  }, [filteredReportes]);

  const alertas = useMemo(() => {
    let optimo = 0, riesgo = 0, critico = 0;
    dataPorArea.forEach(a => {
      if (a.porcentaje > 20) critico++;
      else if (a.porcentaje >= 10) riesgo++;
      else optimo++;
    });
    return { optimo, riesgo, critico };
  }, [dataPorArea]);

  const evolucionData = useMemo(() => {
    return PERIODOS.map(p => {
      const reps = reportes.filter(r => r.periodo === p);
      let preventivo = 0;
      let pierden = 0;
      
      reps.forEach(r => {
        preventivo += r.estudiantesPreventivo?.length || 0;
        let reprueban = 0;
        if (r.estudiantesPierden) {
           r.estudiantesPierden.forEach(est => {
             const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
             if (!accion || accion.aprobo !== 'Sí') reprueban++;
           });
        }
        pierden += reprueban;
      });

      return {
        periodo: `Periodo ${p}`,
        preventivo,
        pierden,
        totalAlertas: preventivo + pierden
      };
    });
  }, [reportes]);

  const dataPorDocente = useMemo(() => {
    const map: Record<string, { docente: string; totalEstudiantes: number; pierden: number }> = {};
    
    filteredReportes.forEach(r => {
      if (!map[r.docente]) {
        map[r.docente] = { docente: r.docente, totalEstudiantes: 0, pierden: 0 };
      }
      map[r.docente].totalEstudiantes += r.totalEstudiantes;
      let reprueban = 0;
      if (r.estudiantesPierden) {
         r.estudiantesPierden.forEach(est => {
           const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
           if (!accion || accion.aprobo !== 'Sí') reprueban++;
         });
      }
      map[r.docente].pierden += reprueban;
    });

    return Object.values(map).map(d => ({
      ...d,
      porcentaje: d.totalEstudiantes > 0 ? Number(((d.pierden / d.totalEstudiantes) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.pierden - a.pierden).slice(0, 10);
  }, [filteredReportes]);

  const heatmapData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const areasSet = new Set<string>();
    const gradosSet = new Set<string>();

    filteredReportes.forEach(r => {
      areasSet.add(r.area);
      gradosSet.add(r.grado);
      if (!map[r.area]) map[r.area] = {};
      if (!map[r.area][r.grado]) map[r.area][r.grado] = 0;
      let reprueban = 0;
      if (r.estudiantesPierden) {
         r.estudiantesPierden.forEach(est => {
           const accion = r.accionesMejoramiento?.find(a => a.estudiante === est);
           if (!accion || accion.aprobo !== 'Sí') reprueban++;
         });
      }
      map[r.area][r.grado] += reprueban;
    });

    const sortedAreas = Array.from(areasSet).sort();
    const sortedGrados = Array.from(gradosSet).sort((a, b) => {
      const order = ['TRANSICIÓN', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°'];
      const idxA = order.indexOf(a.toUpperCase());
      const idxB = order.indexOf(b.toUpperCase());
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    let maxVal = 0;
    sortedAreas.forEach(a => {
      sortedGrados.forEach(g => {
        if (map[a] && map[a][g] > maxVal) maxVal = map[a][g];
      });
    });

    return { map, areas: sortedAreas, grados: sortedGrados, maxVal };
  }, [filteredReportes]);

  const getHeatmapColor = (val: number, max: number) => {
    if (val === 0) return 'bg-white/5 text-slate-700';
    const ratio = val / (max || 1);
    if (ratio < 0.3) return 'bg-emerald-600 text-white font-bold';
    if (ratio < 0.7) return 'bg-amber-600 text-white font-bold';
    return 'bg-rose-600 text-white font-bold shadow-lg';
  };

  const handleDownload = async (id: string, name: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    
    try {
      const originalTransform = element.style.transform;
      element.style.transform = 'none'; // Temporarily disable transforms to avoid layout issues in canvas
      
      const canvas = await html2canvas(element, { 
        scale: 2,
        backgroundColor: '#1a1a1a',
        useCORS: true,
        logging: false,
        allowTaint: true,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById(id);
          if (clonedElement) {
             clonedElement.style.transform = 'none';
          }
        }
      });

      element.style.transform = originalTransform;

      const link = document.createElement('a');
      link.style.display = 'none';
      link.download = `${name.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 500);
      
    } catch (error) {
      console.error('Error downloading chart:', error);
    }
  };

  const handleBarClick = (data: any, type: string) => {
    let students: any[] = [];
    let title = '';
    let subtitle = '';
    let color = 'bg-slate-800';
    
    // Identified retired set for filtering
    const retiredSet = new Set(retirados.map(r => `${r.nombre.trim().toUpperCase()}-${r.grado}`));

    if (type === 'area') {
      const relevant = filteredReportes.filter(r => r.area === data.area);
      relevant.forEach(r => {
        if (r.estudiantesPierden) {
          r.estudiantesPierden.forEach(est => {
            const normalized = est.trim().toUpperCase();
            if (!retiredSet.has(`${normalized}-${r.grado}`)) {
              const accion = r.accionesMejoramiento?.find(a => a.estudiante.trim().toUpperCase() === normalized);
              students.push({
                nombre: est,
                nota: accion?.nota || 'N/A',
                estado: (!accion || accion.aprobo !== 'Sí') ? 'Reprobado' : 'Aprobado con AC'
              });
            }
          });
        }
      });
      title = `Detalle: ${data.area}`;
      subtitle = 'Análisis de Estudiantes';
      color = 'bg-blue-600';
    } else if (type === 'docente') {
      const relevant = filteredReportes.filter(r => r.docente === data.docente);
      relevant.forEach(r => {
        if (r.estudiantesPierden) {
          r.estudiantesPierden.forEach(est => {
            const normalized = est.trim().toUpperCase();
            if (!retiredSet.has(`${normalized}-${r.grado}`)) {
              const accion = r.accionesMejoramiento?.find(a => a.estudiante.trim().toUpperCase() === normalized);
              students.push({
                nombre: est,
                nota: accion?.nota || 'N/A',
                estado: (!accion || accion.aprobo !== 'Sí') ? 'Reprobado' : 'Aprobado con AC'
              });
            }
          });
        }
      });
      title = `Docente: ${data.docente}`;
      subtitle = 'Estudiantes con Dificultades';
      color = 'bg-amber-500';
    } else if (type === 'heatmap') {
      const relevant = filteredReportes.filter(r => r.area === data.area && r.grado === data.grado);
      relevant.forEach(r => {
         if (r.estudiantesPierden) {
          r.estudiantesPierden.forEach(est => {
             const normalized = est.trim().toUpperCase();
             if (!retiredSet.has(`${normalized}-${r.grado}`)) {
               const accion = r.accionesMejoramiento?.find(a => a.estudiante.trim().toUpperCase() === normalized);
               students.push({
                 nombre: est,
                 nota: accion?.nota || 'N/A',
                 estado: (!accion || accion.aprobo !== 'Sí') ? 'Reprobado' : 'Aprobado con AC'
               });
             }
          });
         }
      });
      title = `Detalle: ${data.area} - Grado ${data.grado}`;
      subtitle = `Mapa de Calor Contextual`;
      color = 'bg-rose-500';
    }

    setDrawerData({
      isOpen: true,
      title,
      subtitle,
      color,
      students: students.filter(s => s.estado === 'Reprobado').sort((a, b) => a.nombre.localeCompare(b.nombre)),
    });
  };

  if (loading) {
    return <InstitutionalLoading />;
  }

  return (
    <div className="space-y-8 pb-12 transition-all duration-700 animate-fade-in-up">
      <PageHeader 
        title="TABLERO ESTRATÉGICO DE SEGUIMIENTO"
        description="Sincronización Pedagógica Integral: Análisis de Barreras y Despliegue de Intervenciones Críticas para la Transformación del Rendimiento Escolar"
        imageUrl="https://images.unsplash.com/photo-1543269664-56d93c1b41a6?auto=format&fit=crop&q=80&w=1200"
      >
        <div className="mt-8 flex flex-wrap gap-4 items-center">
          <div className="bg-[#1A1A1A]/80 backdrop-blur-sm p-1.5 rounded-2xl border border-white/10 shadow-xl flex flex-wrap gap-3">
            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className="rounded-xl border-none px-4 py-2 bg-transparent focus:ring-0 text-white text-sm font-bold cursor-pointer"
            >
              <option value="" className="bg-[#1A1A1A]">TODOS LOS PERIODOS</option>
              {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A]">PERIODO {p}</option>)}
            </select>
            <div className="w-px h-6 bg-white/10 self-center"></div>
            <select
              value={filtroGrado}
              onChange={(e) => setFiltroGrado(e.target.value)}
              className="rounded-xl border-none px-4 py-2 bg-transparent focus:ring-0 text-white text-sm font-bold cursor-pointer"
            >
              <option value="" className="bg-[#1A1A1A]">TODOS LOS GRADOS</option>
              {opcionesGrado.map(g => <option key={g} value={g} className="bg-[#1A1A1A]">GRADO {g}</option>)}
            </select>
            <div className="w-px h-6 bg-white/10 self-center"></div>
            <select
              value={filtroDocente}
              onChange={(e) => setFiltroDocente(e.target.value)}
              className="rounded-xl border-none px-4 py-2 bg-transparent focus:ring-0 text-white text-sm font-bold cursor-pointer max-w-[180px] truncate"
            >
              <option value="" className="bg-[#1A1A1A]">TODOS LOS DOCENTES</option>
              {opcionesDocente.map(d => <option key={d} value={d} className="bg-[#1A1A1A]">{d.toUpperCase()}</option>)}
            </select>
            <div className="w-px h-6 bg-white/10 self-center"></div>
            <select
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              className="rounded-xl border-none px-4 py-2 bg-transparent focus:ring-0 text-white text-sm font-bold cursor-pointer max-w-[180px] truncate"
            >
              <option value="" className="bg-[#1A1A1A]">TODAS LAS ASIGNATURAS</option>
              {opcionesArea
                .filter(a => !a.toUpperCase().includes('TODAS LAS'))
                .map(a => <option key={a} value={a} className="bg-[#1A1A1A]">{a.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      </PageHeader>

      {/* Metric Bento Grid */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Card: Global Matricula */}
        <div className="flex-1 flex flex-col items-center justify-center p-10 bg-gradient-to-br from-blue-600/20 to-indigo-600/20 rounded-[3rem] border border-white/10 relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] group-hover:scale-125 transition-transform duration-700">
            <Users size={160} />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 rounded-[2rem] bg-blue-600 flex items-center justify-center text-white mb-6 shadow-xl shadow-blue-900/40">
              <Users size={40} />
            </div>
            <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.5em] mb-2">Matrícula Institucional Activa</p>
            <h2 className="text-7xl font-black text-white tracking-tighter tabular-nums">
              {stats.totalMatriculas}
            </h2>
            <div className="mt-8 flex gap-4">
              {filteredRetirados.length > 0 && (
                <span className="px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] font-black text-rose-400 uppercase tracking-widest">
                  {filteredRetirados.length} RETIROS {filtroGrado ? 'EN GRADO' : 'GLOBALES'}
                </span>
              )}
              <span className="px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                Sincronización SIMAT
              </span>
            </div>
          </div>
        </div>

        {/* Actionable Metrics Side Grid */}
        <div className="lg:w-[480px] grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="executive-card p-8 flex flex-col justify-between group overflow-hidden relative border-white/5">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-125 transition-transform duration-500 text-white">
               <AlertTriangle size={80} />
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-rose-600/10 flex items-center justify-center text-rose-400 border border-rose-500/20 group-hover:bg-rose-600 group-hover:text-white transition-all">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Alertas Activas</p>
                <h3 className="text-3xl font-black text-white tracking-tighter">{stats.totalPierden}</h3>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-rose-400 bg-rose-600/10 px-3 py-1 rounded-full border border-rose-600/20 font-black tracking-tighter">{stats.porcentajePerdida}% CRÍTICO</span>
            </div>
          </div>

          <div className="executive-card p-8 flex flex-col justify-between group overflow-hidden relative border-white/5">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-125 transition-transform duration-500 text-white">
               <BrainCircuit size={80} />
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <BrainCircuit size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Apoyo (SIMAT)</p>
                <h3 className="text-3xl font-black text-white tracking-tighter">{filteredInclusion.length}</h3>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-indigo-400 bg-indigo-600/10 px-3 py-1 rounded-full border border-indigo-600/20 font-black tracking-tighter">INCLUSIÓN ACTIVA</span>
            </div>
          </div>

          <div className="executive-card p-8 flex flex-col justify-between group overflow-hidden relative border-white/5 sm:col-span-2">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-125 transition-transform duration-500 text-white">
               <Activity size={80} />
            </div>
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={24} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Índice de Aprobación Global</p>
                   <span className="text-2xl font-black text-emerald-400 tracking-tighter">{stats.porcentajeAprobacion}%</span>
                </div>
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                   <div 
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 shadow-[0_0_10px_rgba(52,211,153,0.3)]" 
                    style={{ width: `${stats.porcentajeAprobacion}%` }}
                   />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estudiantes que pierden por área */}
        <div 
          id="chart-areas"
          className="executive-card p-8 flex flex-col animate-cascade-4 relative overflow-hidden"
        >
          <button 
            data-html2canvas-ignore="true"
            onClick={() => handleDownload('chart-areas', 'areas-con-desafios')} 
            className="absolute top-6 right-6 text-slate-500 hover:text-blue-400 transition-colors p-2.5 bg-white/5 hover:bg-white/10 rounded-xl z-20" 
            title="Descargar Reporte"
          >
            <Download size={20} />
          </button>
          <div className="mb-8 pr-12">
            <h3 className="text-[18px] font-bold text-[#D4AF37] mb-2 uppercase tracking-wider">Áreas con Desafíos de Aprendizaje</h3>
            <p className="text-[12px] font-medium text-slate-400 leading-relaxed">Identificación de áreas críticas para la armonización curricular profesional.</p>
          </div>
          <div className="flex-1 min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataPorArea} margin={{ top: 20, right: 10, left: -20, bottom: 90 }}>
                <defs>
                  <linearGradient id="barGradientNavy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D2D2D" />
                <XAxis 
                  dataKey="area" 
                  tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} 
                  interval={0} 
                  angle={-45} 
                  textAnchor="end" 
                  height={90} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#1A1A1A', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}} />
                <Bar onClick={(data) => handleBarClick(data, 'area')} dataKey="pierden" fill="url(#barGradientNavy)" radius={[6, 6, 0, 0]} maxBarSize={45} className="hover:opacity-90 transition-opacity cursor-pointer">
                  <LabelList dataKey="pierden" position="top" style={{ fill: 'white', fontSize: 11, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmap */}
        <div 
          id="chart-heatmap"
          className="executive-card p-8 flex flex-col animate-cascade-5 relative overflow-hidden"
        >
          <button 
            data-html2canvas-ignore="true"
            onClick={() => handleDownload('chart-heatmap', 'mapa-de-calor-academico')} 
            className="absolute top-6 right-6 text-slate-500 hover:text-blue-400 transition-colors p-2.5 bg-white/5 hover:bg-white/10 rounded-xl z-20" 
            title="Descargar Reporte"
          >
            <Download size={20} />
          </button>
          <div className="mb-8 pr-12">
            <h3 className="text-[18px] font-bold text-[#D4AF37] mb-2 uppercase tracking-wider">Mapa de Calor: Desempeño Académico</h3>
            <p className="text-[12px] font-medium text-slate-400 leading-relaxed">Visualización estratégica por área y grado.</p>
          </div>
          <div className="flex-1 overflow-auto min-h-[16rem]">
            {heatmapData.areas.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">No hay datos</div>
            ) : (
              <div className="min-w-max">
                <div className="flex">
                  <div className="w-24 shrink-0"></div>
                  {heatmapData.areas.map(a => (
                    <div key={a} className="w-16 text-center text-[9px] font-bold text-slate-600 py-1 truncate px-1" title={a}>
                      {a.length > 6 ? a.substring(0, 6) + '.' : a}
                    </div>
                  ))}
                </div>
                {heatmapData.grados.map(grado => (
                  <div key={grado} className="flex mt-0.5">
                    <div className="w-24 shrink-0 py-1 pr-3 text-xs font-black text-slate-500 bg-white/[0.03] flex items-center justify-end rounded-l-lg">Grado {grado}</div>
                    {heatmapData.areas.map(area => {
                      const val = heatmapData.map[area]?.[grado] || 0;
                      return (
                        <div key={`${area}-${grado}`} className="w-16 px-[1px]">
                          <div 
                            onClick={() => handleBarClick({area, grado}, 'heatmap')}
                            className={`w-full rounded-sm h-full min-h-[24px] flex items-center justify-center text-[10px] transition-all hover:scale-110 hover:shadow-md cursor-pointer ${getHeatmapColor(val, heatmapData.maxVal)}`} 
                            title={`${area} - Grado ${grado}: ${val} reprobados`}
                          >
                            {val > 0 ? val : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-center gap-6 text-xs font-normal text-slate-500">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-emerald-500"></div> Óptimo</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-amber-500"></div> Riesgo</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-rose-400"></div> Crítico</div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 gap-6">
        {/* Evolución por periodo */}
        <div 
          id="chart-evolucion"
          className="executive-card p-8 flex flex-col animate-cascade-6 relative overflow-hidden"
        >
          <button 
            data-html2canvas-ignore="true"
            onClick={() => handleDownload('chart-evolucion', 'evolucion-historica-logros')} 
            className="absolute top-6 right-6 text-slate-500 hover:text-blue-400 transition-colors p-2.5 bg-white/5 hover:bg-white/10 rounded-xl z-20" 
            title="Descargar Reporte"
          >
            <Download size={20} />
          </button>
          <div className="mb-8 pr-12">
            <h3 className="text-[18px] font-bold text-[#D4AF37] mb-2 uppercase tracking-wider">Trazabilidad de Logros por Periodo</h3>
            <p className="text-[12px] font-medium text-slate-400 leading-relaxed">Monitoreo histórico de la formación integral académica.</p>
          </div>
          <div className="flex-1 min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucionData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="areaGradientBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D2D2D" />
                <XAxis dataKey="periodo" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} />
                <Tooltip 
                  cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '3 3' }} 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#1A1A1A] p-4 rounded-2xl shadow-2xl border border-white/10">
                          <p className="font-bold text-[#D4AF37] mb-3 uppercase tracking-widest text-[10px]">{data.periodo}</p>
                          <div className="space-y-2">
                            <p className="text-xs text-slate-300 flex justify-between gap-8">
                              <span>Corte Preventivo:</span> 
                              <span className="font-bold text-blue-400">{data.preventivo}</span>
                            </p>
                            <p className="text-xs text-slate-300 flex justify-between gap-8">
                              <span>Desempeño Bajo:</span> 
                              <span className="font-bold text-rose-400">{data.pierden}</span>
                            </p>
                            <div className="pt-2 mt-2 border-t border-white/5 flex justify-between gap-8">
                              <span className="text-xs font-bold text-white uppercase tracking-tighter">Total Alertas:</span>
                              <span className="text-xs font-black text-white">{data.totalAlertas}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="totalAlertas" stroke="#3b82f6" strokeWidth={4} fill="url(#areaGradientBlue)" dot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#1A1A1A' }} activeDot={{ r: 9, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}>
                  <LabelList dataKey="totalAlertas" position="top" style={{ fill: 'white', fontSize: 11, fontWeight: 'bold' }} offset={20} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Áreas con mayor pérdida (Porcentaje) */}
        <div 
          id="chart-prioridad"
          className="executive-card p-8 flex flex-col animate-cascade-7 relative overflow-hidden"
        >
          <button 
            data-html2canvas-ignore="true"
            onClick={() => handleDownload('chart-prioridad', 'analisis-porcentual-areas')} 
            className="absolute top-6 right-6 text-slate-500 hover:text-blue-400 transition-colors p-2.5 bg-white/5 hover:bg-white/10 rounded-xl z-20" 
            title="Descargar Reporte"
          >
            <Download size={20} />
          </button>
          <div className="mb-8 pr-12">
            <h3 className="text-[18px] font-bold text-[#D4AF37] mb-2 uppercase tracking-wider">Áreas en Prioridad de Refuerzo</h3>
            <p className="text-[12px] font-medium text-slate-400 leading-relaxed">Análisis porcentual del rendimiento institucional.</p>
          </div>
          <div className="flex-1 min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataPorArea} margin={{ top: 20, right: 10, left: -20, bottom: 90 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D2D2D" />
                <XAxis 
                  dataKey="area" 
                  tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} 
                  interval={0} 
                  angle={-45} 
                  textAnchor="end" 
                  height={90} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} tickFormatter={(val) => `${val}%`} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} formatter={(val) => `${val}%`} contentStyle={{backgroundColor: '#1A1A1A', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}} />
                <Bar onClick={(data) => handleBarClick(data, 'area')} dataKey="porcentaje" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={45} className="hover:opacity-90 transition-opacity cursor-pointer">
                  <LabelList dataKey="porcentaje" position="top" formatter={(val: number) => `${val}%`} style={{ fill: 'white', fontSize: 11, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Docentes con más pérdida (Números) */}
        <div 
          id="chart-docentes"
          className="executive-card p-8 flex flex-col animate-cascade-8 relative overflow-hidden"
        >
          <button 
            data-html2canvas-ignore="true"
            onClick={() => handleDownload('chart-docentes', 'retos-pedagogicos-docentes')} 
            className="absolute top-6 right-6 text-slate-500 hover:text-blue-400 transition-colors p-2.5 bg-white/5 hover:bg-white/10 rounded-xl z-20" 
            title="Descargar Reporte"
          >
            <Download size={20} />
          </button>
          <div className="mb-8 pr-12">
            <h3 className="text-[18px] font-bold text-[#D4AF37] mb-2 uppercase tracking-wider">Docentes con Retos de Nivelación</h3>
            <p className="text-[12px] font-medium text-slate-400 leading-relaxed">Mapeo de entornos para el fortalecimiento pedagógico.</p>
          </div>
          <div className="flex-1 min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataPorDocente} margin={{ top: 20, right: 10, left: -20, bottom: 90 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D2D2D" />
                <XAxis 
                  dataKey="docente" 
                  tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} 
                  interval={0} 
                  angle={-45} 
                  textAnchor="end" 
                  height={90} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#1A1A1A', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}} />
                <Bar onClick={(data) => handleBarClick(data, 'docente')} dataKey="pierden" fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={45} className="hover:opacity-90 transition-opacity cursor-pointer">
                  <LabelList dataKey="pierden" position="top" style={{ fill: 'white', fontSize: 11, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Drawer Panel */}
      {drawerData && drawerData.isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" onClick={() => setDrawerData(null)}></div>
          <div className="w-[480px] max-w-[95vw] bg-[#0F172A] h-full shadow-[ -20px_0_60px_-15px_rgba(0,0,0,0.8)] relative z-[110] flex flex-col animate-fade-in-right border-l border-white/5">
            <div className={`p-10 text-white ${drawerData.color} flex justify-between items-center relative overflow-hidden bg-gradient-to-br ${drawerData.color === 'bg-rose-500' ? 'from-rose-600 to-[#1A1A1A]' : drawerData.color === 'bg-blue-600' ? 'from-blue-700 to-[#1A1A1A]' : 'from-[#D4AF37] to-[#1A1A1A]'}`}>
              <div className="relative z-10">
                <h2 className="text-2xl font-bold tracking-tight mb-2 uppercase">{drawerData.title}</h2>
                <div className="flex items-center gap-3">
                   <div className="h-0.5 w-8 bg-white/40 rounded-full"></div>
                   <p className="text-[10px] font-bold tracking-[0.2em] opacity-80 uppercase">{drawerData.subtitle}</p>
                </div>
              </div>
              <button onClick={() => setDrawerData(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-all relative z-10 group">
                <X size={28} className="group-hover:rotate-90 transition-transform duration-300" />
              </button>
              {/* Decorative circle */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#020617]">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                  Radiografía de Acción
                </h3>
                <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-slate-400 border border-white/10 uppercase tracking-widest">{drawerData.students.length} EXPEDIENTES</span>
              </div>

              <div className="space-y-4">
                {drawerData.students.length === 0 ? (
                  <div className="text-center py-24 flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-2">
                       <CheckCircle2 size={40} className="text-emerald-400" />
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">No se registran alertas críticas</p>
                  </div>
                ) : (
                  drawerData.students.map((s, idx) => (
                    <div key={idx} className="executive-card p-5 flex items-center justify-between hover:bg-white/5 transition-all group border-white/5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-bold text-white border border-white/10 text-xs">
                           {idx + 1}
                        </div>
                        <p className="font-bold text-slate-200 text-xs group-hover:text-blue-400 transition-colors uppercase tracking-tight">{formatName(s.nombre)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${s.estado === 'Reprobado' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                          {s.estado}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
