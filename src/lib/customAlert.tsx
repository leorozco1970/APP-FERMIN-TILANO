import React from 'react';
import { createRoot } from 'react-dom/client';
import { AlertModal } from '../components/AlertModal';

export const customAlert = (message: string) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  
  const handleClose = () => {
    root.unmount();
    container.remove();
  };

  root.render(<AlertModal isOpen={true} message={message} onClose={handleClose} />);
};
