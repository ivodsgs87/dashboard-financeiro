import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCAyPVtpdIYSqx2JcLfCgIPbSKme68lQxM",
  authDomain: "dashboard-financas-f2b55.firebaseapp.com",
  projectId: "dashboard-financas-f2b55",
  storageBucket: "dashboard-financas-f2b55.firebasestorage.app",
  messagingSenderId: "1001287643592",
  appId: "1:1001287643592:web:1550e6bc9124bd63e250fd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

export const subscribeToAuth = (callback) => onAuthStateChanged(auth, callback);

// Firestore operations
export const getUserData = async (userId) => {
  const docRef = doc(db, 'users', userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
};

export const saveUserData = async (userId, data) => {
  const docRef = doc(db, 'users', userId);
  await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
};

export const subscribeToUserData = (userId, callback) => {
  const docRef = doc(db, 'users', userId);
  return onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data());
    }
  });
};
