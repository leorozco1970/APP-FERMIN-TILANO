import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617] p-8 font-sans selection:bg-rose-500/30">
          <div className="absolute inset-x-0 top-0 h-[500px] bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
          
          <div className="max-w-2xl w-full bg-[#050B1A] rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] p-12 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:scale-110 transition-transform duration-700 text-rose-500">
               <AlertCircle size={180} />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 shadow-lg shadow-rose-900/20">
                  <AlertCircle size={32} />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Situación Inesperada</h2>
                  <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mt-1">Error de Sincronización o Ejecución</p>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <p className="text-slate-400 font-medium leading-relaxed">
                  La plataforma ha detectado una inconsistencia técnica irrecuperable. Esto puede deberse a una pérdida temporal de conectividad o a un conflicto en la estructura de datos.
                </p>
                
                <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-white/5 pb-2">Detalles Técnicos del Incidente</div>
                  <pre className="text-xs font-mono text-rose-400/80 overflow-auto max-h-40 break-words whitespace-pre-wrap leading-relaxed">
                    {this.state.error?.message || 'Error no especificado'}
                  </pre>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl transition-all uppercase text-[11px] tracking-widest shadow-xl shadow-blue-900/40 border border-white/10 active:scale-95"
                >
                  Reiniciar Plataforma
                </button>
                <button
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="px-8 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-black py-5 rounded-2xl transition-all uppercase text-[11px] tracking-widest border border-white/5"
                >
                  Intentar Recuperar
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
