import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCGOfjsJt6mFEcJI3WqL-qJVFKHuQsEpl0",
    authDomain: "kapespot-9df06.firebaseapp.com",
    projectId: "kapespot-9df06",
    storageBucket: "kapespot-9df06.firebasestorage.app",
    messagingSenderId: "1094184517309",
    appId: "1:1094184517309:web:c31cc85386775eb1eec1d4"
  };
  
// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);