import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAdzZqATJXSl5WgRxD6jLh2ZhIB8-z3wog",
  authDomain: "crypto-money-talk.firebaseapp.com",
  projectId: "crypto-money-talk",
  storageBucket: "crypto-money-talk.firebasestorage.app",
  messagingSenderId: "183021719346",
  appId: "1:183021719346:web:8a1f90c59793cd8cc5d12b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const initializeAuth = async () => {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    console.error('Auth error:', error);
  }
};