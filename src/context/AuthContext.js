
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to create email from username
  const getEmailFromUsername = (username) => `${username.toLowerCase().replace(/\s+/g, '')}@balajilodge.app`;

  async function signup(username, password, mobile, lodgeName) {
    const email = getEmailFromUsername(username);
    // 1. Create Auth User
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // 2. Store additional details in Firestore 'users' collection
    await setDoc(doc(db, "users", userCredential.user.uid), {
      username,
      mobile,
      lodgeName,
      createdAt: new Date().toISOString()
    });

    return userCredential;
  }

  async function login(username, password) {
    const email = getEmailFromUsername(username);
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Optionally fetch extra user data here if needed globally
        // const userDoc = await getDoc(doc(db, "users", user.uid));
        // user.profile = userDoc.data();
      }
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
