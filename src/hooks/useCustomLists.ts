import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { DOCENTES as DEFAULT_DOCENTES, AREAS as DEFAULT_AREAS } from '../lib/constants';

export function useCustomLists() {
  const [docentes, setDocentes] = useState<string[]>([...DEFAULT_DOCENTES] as string[]);
  const [areas, setAreas] = useState<string[]>([...DEFAULT_AREAS] as string[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const docRef = doc(db, 'config', 'lists');
    
    const fetchLists = async () => {
      try {
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.docentes) setDocentes(data.docentes.sort());
          if (data.areas) setAreas(data.areas.sort());
        } else {
          // Initialize if it doesn't exist
          await setDoc(docRef, {
            docentes: DEFAULT_DOCENTES,
            areas: DEFAULT_AREAS
          });
          setDocentes([...DEFAULT_DOCENTES].sort());
          setAreas([...DEFAULT_AREAS].sort());
        }
      } catch (error) {
        console.error("Error loading custom lists:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLists();
  }, []);

  const addDocente = async (nombre: string) => {
    const newNombre = nombre.trim().toUpperCase();
    if (!newNombre || docentes.includes(newNombre)) return;
    const newList = [...docentes, newNombre].sort();
    setDocentes(newList);
    await setDoc(doc(db, 'config', 'lists'), { docentes: newList }, { merge: true });
  };

  const removeDocente = async (nombre: string) => {
    const newList = docentes.filter(d => d !== nombre);
    setDocentes(newList);
    await setDoc(doc(db, 'config', 'lists'), { docentes: newList }, { merge: true });
  };

  const addArea = async (nombre: string) => {
    const newNombre = nombre.trim().toUpperCase();
    if (!newNombre || areas.includes(newNombre)) return;
    const newList = [...areas, newNombre].sort();
    setAreas(newList);
    await setDoc(doc(db, 'config', 'lists'), { areas: newList }, { merge: true });
  };

  const removeArea = async (nombre: string) => {
    const newList = areas.filter(a => a !== nombre);
    setAreas(newList);
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
