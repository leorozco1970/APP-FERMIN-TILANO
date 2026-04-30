import React, { useState, useEffect } from 'react';
import { Layout_Generic as Layout } from './components/Layout_Generic';
import { ProyectosPedagogicos } from './pages/ProyectosPedagogicos';
import { PlanFormacion } from './pages/PlanFormacion';
import { ArticulacionCurricular } from './pages/ArticulacionCurricular';
import { ConstruccionPFI } from './pages/ConstruccionPFI';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationProvider } from './context/NotificationContext';
import { validateInstitutionalConnection } from './lib/firestoreUtils';

export function App_Generic() {
  const [activeTab, setActiveTab] = useState('construccion-pfi');

  useEffect(() => {
    validateInstitutionalConnection();
  }, []);

  return (
    <ErrorBoundary>
      <NotificationProvider>
        <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
          {activeTab === 'proyectos' && <ProyectosPedagogicos />}
          {activeTab === 'articulacion-curricular' && <ArticulacionCurricular />}
          {activeTab === 'construccion-pfi' && <ConstruccionPFI />}
          {activeTab === 'plan-formacion' && <PlanFormacion />}
        </Layout>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App_Generic;
