
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Helper to create email from username
  const getEmailFromUsername = (username) => {
      const cleanName = username.toLowerCase().replace(/\s+/g, '');
      if (cleanName === 'balajilodge' || cleanName === 'pramod' || cleanName === 'pramodmali') return 'balajilodgingpandharpur@gmail.com';
      return `${cleanName}@balajilodge.app`;
  };

  async function signup(username, password, mobile, lodgeName) {
    setIsSigningUp(true); // Set flag before signup
    try {
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

      // 3. Sign out immediately to prevent auto-login
      await signOut(auth);
      
      return userCredential;
    } finally {
      setIsSigningUp(false); // Clear flag after signup completes
    }
  }

  async function login(username, password) {
    const email = getEmailFromUsername(username);
    try {
        return await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        // If login fails, try to create the account (Lazy Provisioning)
        // This handles the "Static User" case where the user expects "balajilodge" to just work
        // regardless of whether the backend account exists yet.
        if (email === 'balajilodgingpandharpur@gmail.com') {
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                // Create user doc if successful
                await setDoc(doc(db, "users", cred.user.uid), {
                    username,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });
                return cred;
            } catch (createError) {
                // If creation failed because email exists, it means the original login error was likely 'Wrong Password'
                if (createError.code === 'auth/email-already-in-use') {
                   throw error; // Throw the original login error
                }
                throw createError; // Throw the creation error (e.g. weak password)
            }
        }
        throw error;
    }
  }

  async function resetPassword(username) {
    const email = getEmailFromUsername(username);
    console.log("Attempting password reset for:", email);
    try {
        await sendPasswordResetEmail(auth, email);
        console.log("Reset email sent successfully to:", email);
    } catch (error) {
        console.error("Reset email failed:", error);
        throw error;
    }
  }

  async function changePassword(username, oldPassword, newPassword) {
    const email = getEmailFromUsername(username);
    // 1. Sign in to verify old credentials and get user
    const userCredential = await signInWithEmailAndPassword(auth, email, oldPassword);
    const user = userCredential.user;
    
    // 2. Update password
    await updatePassword(user, newPassword);
    
    // 3. Sign out so they can log in with new password
    await signOut(auth);
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Don't update currentUser if we're in the middle of signup
      if (!isSigningUp) {
        if (user) {
          // Optionally fetch extra user data here if needed globally
          // const userDoc = await getDoc(doc(db, "users", user.uid));
          // user.profile = userDoc.data();
        }
        setCurrentUser(user);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [isSigningUp]);

  const value = {
    currentUser,
    signup,
    login,
    logout,
    resetPassword,
    changePassword,
    isSigningUp
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
