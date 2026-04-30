import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { DOCENTES as DEFAULT_DOCENTES, AREAS as DEFAULT_AREAS } from '../lib/constants';

export function useCustomLists() {
  const [docentes, setDocentes] = useState<string[]>([...DEFAULT_DOCENTES] as string[]);
  const [areas, setAreas] = useState<string[]>([...DEFAULT_AREAS] as string[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const docRef = doc(db, 'config', 'lists');
    
    // Initialize if it doesn't exist
    getDoc(docRef).then((snapshot) => {
      if (!snapshot.exists()) {
        setDoc(docRef, {
          docentes: DEFAULT_DOCENTES,
          areas: DEFAULT_AREAS
        }).catch(console.error);
      }
    });

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.docentes) setDocentes(data.docentes.sort());
        if (data.areas) setAreas(data.areas.sort());
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addDocente = async (nombre: string) => {
    const newNombre = nombre.trim().toUpperCase();
    if (!newNombre || docentes.includes(newNombre)) return;
    const newList = [...docentes, newNombre].sort();
    await setDoc(doc(db, 'config', 'lists'), { docentes: newList }, { merge: true });
  };

  const removeDocente = async (nombre: string) => {
    const newList = docentes.filter(d => d !== nombre);
    await setDoc(doc(db, 'config', 'lists'), { docentes: newList }, { merge: true });
  };

  const addArea = async (nombre: string) => {
    const newNombre = nombre.trim().toUpperCase();
    if (!newNombre || areas.includes(newNombre)) return;
    const newList = [...areas, newNombre].sort();
    await setDoc(doc(db, 'config', 'lists'), { areas: newList }, { merge: true });
  };

  const removeArea = async (nombre: string) => {
    const newList = areas.filter(a => a !== nombre);
    await setDoc(doc(db, 'config', 'lists'), { areas: newList }, { merge: true });
  };

  return {
    docentes,
    areas,
    loading,
    addDocente,
    removeDocente,
    addArea,
    removeArea
  };
}
