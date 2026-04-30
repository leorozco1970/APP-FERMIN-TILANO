import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Error logging in with Google", error);
  }
};

export const loginWithPassword = async (password: string, teacherName?: string) => {
  let userCredential;
  try {
    // Authenticate silently first to gain read access to the database configuration
    userCredential = await signInAnonymously(auth);

    const docSnap = await getDoc(doc(db, 'settings', 'auth'));
    const actualPassword = docSnap.exists() && docSnap.data().appPassword ? docSnap.data().appPassword : (docSnap.exists() && docSnap.data().password ? docSnap.data().password : 'TILANO');
    
    let isValid = false;

    // Check Master Password
    if (password === actualPassword) {
      isValid = true;
    } else if (teacherName) {
      // Check individual PIN if master password doesn't match
      const pinsSnap = await getDoc(doc(db, 'settings', 'docentes_pins'));
      if (pinsSnap.exists()) {
         const pinsData = pinsSnap.data().pins || {};
         const sanitizedTeacher = teacherName.trim().toUpperCase();
         const targetPin = pinsData[sanitizedTeacher];
         
         if (targetPin && targetPin === password) {
            isValid = true;
         }
      }
    }

    if (!isValid) {
      throw new Error('Credenciales incorrectas. Verifique el PIN de su usuario o pruebe con la clave principal.');
    }
    
    // Auth was successful and valid, leave session open.
  } catch (error: any) {
    if (userCredential) {
      await auth.signOut(); // Revoke the anonymous session if validation above failed.
    }
    if (error.message.includes('Credenciales incorrectas')) {
      throw error;
    }
    console.error("Error logging in", error);
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error('El inicio de sesión anónimo no está habilitado en la base de datos. Por favor, contacta al administrador.');
    }
    throw new Error('Error al conectar con la base de datos.');
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error logging out", error);
  }
};

export { signInAnonymously };
