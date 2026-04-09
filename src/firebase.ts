import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyChyM3VfoGJUCIzuhrZfo7L_ogg_RYezPI",
  authDomain: "gen-lang-client-0362724363.firebaseapp.com",
  projectId: "gen-lang-client-0362724363",
  storageBucket: "gen-lang-client-0362724363.firebasestorage.app",
  messagingSenderId: "931507064074",
  appId: "1:931507064074:web:7062540279a48dadf97ef3",
  measurementId: "G-5FP532Z42Y"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
