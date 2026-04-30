import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { NuevoReporte } from './pages/NuevoReporte';
import { Registros } from './pages/Registros';
import { EnfoqueCritico } from './pages/EnfoqueCritico';
import { Informes } from './pages/Informes';
import { RegistroEstudiante } from './pages/RegistroEstudiante';
import { RegistroConvivencia } from './pages/RegistroConvivencia';
import { ProyectosPedagogicos } from './pages/ProyectosPedagogicos';
import { PlanFormacion } from './pages/PlanFormacion';
import { Matriculas } from './pages/Matriculas';
import { Inclusion } from './pages/Inclusion';
import { PlanillasInstitucionales } from './pages/PlanillasInstitucionales';
import { EvaluacionInstitucional } from './pages/EvaluacionInstitucional';
import { PlanesAreaAula } from './pages/PlanesAreaAula';
import { ProyectosTransversales } from './pages/ProyectosTransversales';
import { ArticulacionCurricular } from './pages/ArticulacionCurricular';
import { ConstruccionPFI } from './pages/ConstruccionPFI';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationProvider } from './context/NotificationContext';
import { validateInstitutionalConnection } from './lib/firestoreUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState('nuevo');

  useEffect(() => {
    validateInstitutionalConnection();
  }, []);

  return (
    <NotificationProvider>
      <ErrorBoundary>
        <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
          {activeTab === 'nuevo' && <NuevoReporte />}
          {activeTab === 'registros' && <Registros />}
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'registro-estudiante' && <RegistroEstudiante />}
          {activeTab === 'registro-convivencia' && <RegistroConvivencia />}
          {activeTab === 'enfoque' && <EnfoqueCritico />}
          {activeTab === 'proyectos' && <ProyectosPedagogicos />}
          {activeTab === 'articulacion-curricular' && <ArticulacionCurricular />}
          {activeTab === 'construccion-pfi' && <ConstruccionPFI />}
          {activeTab === 'plan-formacion' && <PlanFormacion />}
          {activeTab === 'informes' && <Informes />}
          {activeTab === 'matriculas-general' && <Matriculas key="matriculas-directorio" initialSubTab="directorio" />}
          {activeTab === 'matriculas-retirados' && <Matriculas key="matriculas-retirados" initialSubTab="retirados" />}
          {activeTab === 'inclusion' && <Inclusion />}
          {activeTab === 'planillas-institucionales' && <PlanillasInstitucionales />}
          {activeTab === 'evaluacion-institucional' && <EvaluacionInstitucional />}
          {activeTab === 'planes-area-aula' && <PlanesAreaAula />}
          {activeTab === 'proyectos-transversales' && <ProyectosTransversales />}
        </Layout>
      </ErrorBoundary>
    </NotificationProvider>
  );
}
