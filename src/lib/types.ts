export interface AccionMejoramiento {
  estudiante: string;
  realizoAccion: 'Sí' | 'No';
  accionRealizada?: string;
  aprobo?: 'Sí' | 'No';
  nota?: string;
}

export interface Reporte {
  id?: string;
  periodo: string;
  docente: string;
  grado: string;
  area: string;
  totalEstudiantes: number;
  estudiantesPreventivo: string[];
  estudiantesPierden: string[];
  estrategias: string[];
  barreras: string[];
  accionesMejoramiento?: AccionMejoramiento[];
  authorUid: string;
  authorEmail: string;
  createdAt: any;
  updatedAt: any;
}

export interface ActividadCronograma {
  no?: number;
  fecha: string;
  actividad: string;
}

export interface ConvergenciaPeiRow {
  elemento: string;
  meta: string;
  accion: string;
}

export interface EstudianteParticipante {
  id?: string;
  nombre: string;
  documento: string;
  grado: string;
}

export interface ProyectoPedagogico {
  id?: string;
  fechaRegistro?: string;
  docente: string;
  area: string;
  tipoEstrategia: string;
  nombreEstrategia: string;
  modalidad?: string;
  esPeriodico?: 'Sí' | 'No';
  periodicidad?: string;
  intensidadHoraria?: string;
  estudiantesParticipantes?: EstudianteParticipante[];
  numeroEstudiantes: number;
  grados: string[];
  objetivo: string;
  tieneDocumentoSoporte?: 'Sí' | 'No';
  convergenciaPei?: ConvergenciaPeiRow[];
  areasArticuladas?: string[];
  documentoSoporte?: string;
  cronograma?: ActividadCronograma[];
  estudiantesNoParticipan?: string;
  authorUid: string;
  authorEmail: string;
  createdAt: any;
  updatedAt: any;
}

export interface AreaArticulada {
  area: string;
  descripcion: string;
}

export interface PFIActividadCronograma {
  actividad: string;
  fecha: string;
}

export interface PFINecesidadRegistro {
  id: string;
  necesidadPriorizada: string;
  metas: string;
  accionesDesarrollo: string;
  armonizacionCurricular: string;
  productosEvidencias: string;
  recursos: string;
  responsables: string;
  cronograma: PFIActividadCronograma[];
  accionesSeguimiento: string;
  observaciones: string;
}

export interface PlanFormacionIntegralData {
  id?: string;
  institucion: string;
  codigoDane: string;
  lecturaContexto: 'Sí' | 'No';
  fortalezas?: string;
  oportunidadesMejora?: string;
  objetivoGeneral: string;
  objetivosEspecificos: string;
  registrosNecesidades: PFINecesidadRegistro[];
  authorUid: string;
  authorEmail: string;
  createdAt: any;
  updatedAt: any;
}

export interface ArticulacionCurricularData {
  id?: string;
  proyectoId: string;
  nombreEstrategia: string;
  docente: string;
  area: string;
  modelo: string;
  modalidad: string;
  objetivo: string;
  fechaRegistro: string;
  estado: string;
  armonizacion: string;
  enfoqueCrese: string[];
  areasArticuladas: AreaArticulada[];
  matrizConvergencia: ConvergenciaPeiRow[];
  sostenibilidad: string;
  riesgos: string;
  avalInstitucional?: boolean;
  enlaceSoporte: string;
  grados?: string[];
  authorUid: string;
  authorEmail: string;
  createdAt: any;
  updatedAt: any;
}
