import { doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  const jsonError = JSON.stringify(errInfo);
  console.error('Firestore Error Details:', jsonError);
  
  // Create a new error with the JSON string as message for the system to parse
  const systemError = new Error(jsonError);
  throw systemError;
}

/**
 * Validates Firestore connectivity for mission-critical reliability
 */
export async function validateInstitutionalConnection() {
  try {
    const testDoc = doc(db, '_internal_', 'health');
    await getDocFromServer(testDoc).catch(() => getDocFromCache(testDoc));
    console.log('✅ Institutional Data Link: ACTIVE');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn("⚠️ Institutional Link: OFFLINE (Operating in limited mode)");
    }
    return false;
  }
}
