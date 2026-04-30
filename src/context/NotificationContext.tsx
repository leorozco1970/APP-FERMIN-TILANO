import React, { createContext, useContext, useState, useCallback } from 'react';
import { MessageModal } from '../components/MessageModal';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationState {
  isOpen: boolean;
  type: NotificationType;
  message: string;
  title?: string;
}

interface NotificationContextType {
  notify: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NotificationState>({
    isOpen: false,
    type: 'info',
    message: ''
  });

  const notify = {
    success: useCallback((message: string, title?: string) => {
      setState({ isOpen: true, type: 'success', message, title });
    }, []),
    error: useCallback((message: string, title?: string) => {
      setState({ isOpen: true, type: 'error', message, title });
    }, []),
    warning: useCallback((message: string, title?: string) => {
      setState({ isOpen: true, type: 'warning', message, title });
    }, []),
    info: useCallback((message: string, title?: string) => {
      setState({ isOpen: true, type: 'info', message, title });
    }, [])
  };

  const closeNotification = () => setState(prev => ({ ...prev, isOpen: false }));

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <MessageModal
        isOpen={state.isOpen}
        type={state.type}
        title={state.title}
        message={state.message}
        onClose={closeNotification}
      />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
