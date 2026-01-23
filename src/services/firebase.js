import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDni0cmwM_LmwrCR79zAYj_bM3RMBDAC9o",
  authDomain: "balajilodge-b4dc4.firebaseapp.com",
  projectId: "balajilodge-b4dc4",
  storageBucket: "balajilodge-b4dc4.firebasestorage.app",
  messagingSenderId: "383806923872",
  appId: "1:383806923872:web:9276916a8418e3d8da0f05",
  measurementId: "G-GFKNCWZBPD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services for other files to use
export const db = getFirestore(app);
export const auth = getAuth(app);