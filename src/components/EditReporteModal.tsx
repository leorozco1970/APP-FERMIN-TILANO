import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PERIODOS, GRADOS, BARRERAS } from '../lib/constants';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Reporte } from '../lib/types';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { useCustomLists } from '../hooks/useCustomLists';

interface EditReporteModalProps {
  reporte: Reporte;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditReporteModal({ reporte, onClose, onSuccess }: EditReporteModalProps) {
  const { docentes: customDocentes, areas: customAreas } = useCustomLists();

  const [formData, setFormData] = useState({
    periodo: reporte.periodo,
    docente: reporte.docente,
    grado: reporte.grado,
    area: reporte.area,
    totalEstudiantes: (reporte.totalEstudiantes || 0).toString(),
    estudiantesPreventivo: (reporte.estudiantesPreventivo || []).join('\n'),
    estudiantesPierden: (reporte.estudiantesPierden || []).join('\n'),
    accionesMejoramiento: reporte.accionesMejoramiento || [],
    estrategias: (reporte.estrategias || []).join('\n'),
    barreras: reporte.barreras || []
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanList = (text: string) => {
    if (!text) return [];
    return String(text).split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const studentsFailing = React.useMemo(() => {
    return cleanList(formData.estudiantesPierden);
  }, [formData.estudiantesPierden]);

  const handleAddAccion = () => {
    setFormData(prev => ({
      ...prev,
      accionesMejoramiento: [
        ...prev.accionesMejoramiento,
        { estudiante: '', realizoAccion: 'Sí', nota: '', accionRealizada: '', aprobo: 'Sí' }
      ]
    }));
  };

  const handleAccionChange = (index: number, field: string, value: string) => {
    setFormData(prev => {
      const updated = [...prev.accionesMejoramiento];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, accionesMejoramiento: updated };
    });
  };

  const handleRemoveAccion = (index: number) => {
    setFormData(prev => {
      const updated = [...prev.accionesMejoramiento];
      updated.splice(index, 1);
      return { ...prev, accionesMejoramiento: updated };
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (barrera: string) => {
    setFormData(prev => {
      const isSelected = prev.barreras.includes(barrera);
      if (isSelected) {
        return { ...prev, barreras: prev.barreras.filter(b => b !== barrera) };
      } else {
        return { ...prev, barreras: [...prev.barreras, barrera] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.estrategias || formData.estrategias.trim() === '') {
      setError('DEBE INGRESAR AL MENOS UNA ESTRATEGIA UTILIZADA POR EL DOCENTE.');
      return;
    }

    if (!formData.barreras || formData.barreras.length === 0) {
      setError('DEBE SELECCIONAR AL MENOS UNA BARRERA DE APRENDIZAJE.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const total = parseInt(formData.totalEstudiantes);
      if (isNaN(total) || total < 0) {
        throw new Error("EL TOTAL DE ESTUDIANTES DEBE SER UN NÚMERO VÁLIDO.");
      }

      const updateData = {
        periodo: formData.periodo,
        docente: formData.docente,
        grado: formData.grado,
        area: formData.area,
        totalEstudiantes: total,
        estudiantesPreventivo: cleanList(formData.estudiantesPreventivo),
        estudiantesPierden: cleanList(formData.estudiantesPierden),
        estrategias: cleanList(formData.estrategias),
        barreras: formData.barreras,
        accionesMejoramiento: formData.accionesMejoramiento || [],
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'reportes', reporte.id!), updateData);
      onSuccess();
    } catch (err: any) {
      console.error("Error updating document:", err);
      setError(err.message || "ERROR AL ACTUALIZAR EL REGISTRO.");
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 animate-in fade-in duration-300">
      <div 
        className="executive-card max-w-6xl w-full max-h-[85vh] flex flex-col border-white/10 overflow-hidden shadow-[0_45px_100px_-20px_rgba(0,0,0,1)] relative"
        style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)' 
        }}
      >
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-[#0A0A0A]/90 sticky top-0 z-20 backdrop-blur-sm">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-[#C5A059] uppercase tracking-[0.2em] drop-shadow-sm">Editar Registro Académico</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">SISTEMA DE GESTIÓN I.E. FERMÍN TILANO</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-[#0A0A0A]">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              {error}
            </div>
          )}
          
          <form id="edit-form" onSubmit={handleSubmit} className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-50 uppercase tracking-[0.15em] mb-2 px-1">Periodo</label>
                <select
                  name="periodo"
                  value={formData.periodo}
                  onChange={handleInputChange}
                  required
                  className="executive-input w-full text-white font-black"
                >
                  {PERIODOS.map(p => <option key={p} value={p} className="bg-[#1A1A1A] text-white">Periodo {p}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-50 uppercase tracking-[0.15em] mb-2 px-1">Docente</label>
                <select
                  name="docente"
                  value={formData.docente}
                  onChange={handleInputChange}
                  required
                  className="executive-input w-full text-white font-black"
                >
                  <option value="" className="bg-[#1A1A1A] text-white">Seleccione...</option>
                  {[...customDocentes].sort().map(d => <option key={d} value={d} className="bg-[#1A1A1A] text-white font-bold">{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-50 uppercase tracking-[0.15em] mb-2 px-1">Grado</label>
                <select
                  name="grado"
                  value={formData.grado}
                  onChange={handleInputChange}
                  required
                  className="executive-input w-full text-white font-black"
                >
                  <option value="" className="bg-[#1A1A1A] text-white">Seleccione...</option>
                  {GRADOS.map(g => <option key={g} value={g} className="bg-[#1A1A1A] text-white font-bold">{g}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-50 uppercase tracking-[0.15em] mb-2 px-1">Área / Asignatura</label>
                <select
                  name="area"
                  value={formData.area}
                  onChange={handleInputChange}
                  required
                  className="executive-input w-full text-white font-black"
                >
                  <option value="" className="bg-[#1A1A1A] text-white">Seleccione...</option>
                  {[...customAreas].sort().map(a => <option key={a} value={a} className="bg-[#1A1A1A] text-white font-bold">{a}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] mb-1">
                    Alertas Tempranas (Corte Preventivo)
                  </label>
                  <p className="text-[9px] text-slate-300 uppercase tracking-widest">Ingrese un nombre por línea</p>
                </div>
                <textarea
                  name="estudiantesPreventivo"
                  value={formData.estudiantesPreventivo}
                  onChange={handleInputChange}
                  rows={8}
                  className="executive-input w-full resize-none text-[13px] font-bold text-white leading-relaxed uppercase placeholder:lowercase placeholder:font-normal placeholder:text-slate-500"
                  placeholder="ej: juan perez"
                />
              </div>

              <div className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] mb-1">
                    Desempeño Bajo (Reprueban)
                  </label>
                  <p className="text-[9px] text-slate-300 uppercase tracking-widest">Ingrese un nombre por línea</p>
                </div>
                <textarea
                  name="estudiantesPierden"
                  value={formData.estudiantesPierden}
                  onChange={handleInputChange}
                  rows={8}
                  className="executive-input w-full resize-none text-[13px] font-black text-white leading-relaxed uppercase placeholder:lowercase placeholder:font-normal placeholder:text-slate-500"
                  placeholder="ej: carlos ruiz"
                />
              </div>
            </div>

            {/* Acciones de Mejoramiento */}
            <div className="pt-8 border-t border-white/5">
              <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.4em] drop-shadow-sm">
                    Acciones de Mejoramiento
                  </label>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">
                    {studentsFailing.length === 0 ? 'Agregue estudiantes en desempeño bajo para registrar acciones' : 'Siga el progreso de los estudiantes en riesgo'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddAccion}
                  disabled={studentsFailing.length === 0}
                  className="flex items-center gap-2 group px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/40 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" strokeWidth={3} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Añadir registro</span>
                </button>
              </div>

              <div className="space-y-4">
                {formData.accionesMejoramiento.map((accion, index) => (
                  <div key={index} className="relative group p-6 bg-black/40 rounded-[2.5rem] border border-white/5 flex flex-col xl:flex-row gap-5 items-start xl:items-end animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accion.realizoAccion === 'No' ? 'bg-slate-800' : accion.aprobo === 'Sí' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]'}`}></div>
                    
                    <div className="w-full xl:flex-[2.5] min-w-0 pl-2">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Estudiante</label>
                      <select
                        value={accion.estudiante}
                        onChange={(e) => handleAccionChange(index, 'estudiante', e.target.value)}
                        className="executive-input w-full text-[13px] font-bold text-white py-3.5"
                      >
                        <option value="" className="bg-[#1A1A1A] text-slate-200">SELECCIONAR...</option>
                        {studentsFailing.map(est => (
                          <option key={est} value={est} className="bg-[#1A1A1A] text-white font-bold">{est}</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full xl:w-32 shrink-0">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1 text-center">¿Se realizó?</label>
                      <select
                        value={accion.realizoAccion}
                        onChange={(e) => handleAccionChange(index, 'realizoAccion', e.target.value)}
                        className="executive-input w-full text-[13px] font-bold text-white text-center py-3.5"
                      >
                        <option value="Sí" className="bg-[#1A1A1A] text-white">Sí</option>
                        <option value="No" className="bg-[#1A1A1A] text-white">No</option>
                      </select>
                    </div>

                    <div className="w-full xl:flex-[4] min-w-0">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Acción Realizada</label>
                      <input
                        type="text"
                        value={accion.accionRealizada || ''}
                        onChange={(e) => handleAccionChange(index, 'accionRealizada', e.target.value)}
                        placeholder="DESCRIPCIÓN DE LA ACCIÓN..."
                        className="executive-input w-full text-[13px] font-bold text-white uppercase placeholder:text-slate-700 py-3.5"
                        disabled={accion.realizoAccion === 'No'}
                      />
                    </div>

                    <div className="w-full xl:w-28 shrink-0">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1 text-center">¿Aprobó?</label>
                      <select
                        value={accion.aprobo || ''}
                        onChange={(e) => {
                          handleAccionChange(index, 'aprobo', e.target.value);
                          if (e.target.value !== 'Sí') {
                            handleAccionChange(index, 'nota', '');
                          }
                        }}
                        className="executive-input w-full text-[13px] font-bold text-white text-center disabled:opacity-20 py-3.5"
                        disabled={accion.realizoAccion === 'No'}
                      >
                        <option value="" className="bg-[#1A1A1A] text-white">SEL...</option>
                        <option value="Sí" className="bg-[#1A1A1A] text-white">Sí</option>
                        <option value="No" className="bg-[#1A1A1A] text-white">No</option>
                      </select>
                    </div>

                    <div className="w-full xl:w-24 shrink-0">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1 text-center">Nota</label>
                      <input
                        type="text"
                        value={accion.nota || ''}
                        onChange={(e) => handleAccionChange(index, 'nota', e.target.value)}
                        placeholder="5.0"
                        className="executive-input w-full text-[14px] font-black text-white text-center disabled:opacity-20 py-3.5"
                        disabled={accion.realizoAccion === 'No' || accion.aprobo !== 'Sí'}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveAccion(index)}
                      className="p-3.5 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-transparent hover:border-rose-500/20 self-end shrink-0"
                      title="Eliminar registro"
                    >
                      <Trash2 size={24} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">
                    Estrategias de Apoyo *
                  </label>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest">Describa las acciones pedagógicas generales</p>
                </div>
                <textarea
                  name="estrategias"
                  required
                  value={formData.estrategias}
                  onChange={handleInputChange}
                  rows={6}
                  className="executive-input w-full resize-none text-[13px] font-bold text-white leading-relaxed placeholder:text-slate-500"
                  placeholder="Ej. Tutorías grupales, guías de refuerzo..."
                />
              </div>

              <div className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] mb-1">
                    Barreras Identificadas *
                  </label>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest">Seleccione las barreras observadas</p>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                  {BARRERAS.map(barrera => (
                    <label key={barrera} className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${formData.barreras.includes(barrera) ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'bg-black/40 border-white/10 hover:border-white/20'}`}>
                      <input
                        type="checkbox"
                        checked={formData.barreras.includes(barrera)}
                        onChange={() => handleCheckboxChange(barrera)}
                        className="mt-1 rounded border-white/20 bg-transparent text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0"
                      />
                      <span className={`text-[12px] font-black tracking-tight leading-snug uppercase ${formData.barreras.includes(barrera) ? 'text-white' : 'text-slate-300'}`}>{barrera}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </div>
        
        <div className="p-6 border-t border-white/10 flex justify-end gap-4 bg-[#0A0A0A]/95 sticky bottom-0 z-20 backdrop-blur-sm">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-all rounded-xl hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="edit-form"
            disabled={loading}
            className="flex items-center gap-3 bg-blue-700 hover:bg-blue-600 text-white font-black py-4 px-12 rounded-2xl transition-all shadow-2xl shadow-blue-900/40 disabled:opacity-50 uppercase text-[11px] tracking-[0.2em] border border-blue-500/30"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Save size={18} strokeWidth={3} className="text-[#C5A059]" />
                Confirmar y Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
