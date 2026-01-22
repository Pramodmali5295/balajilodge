import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'; 
const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [rooms, setRooms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutAlerts, setCheckoutAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  useEffect(() => {
    const roomsCollection = collection(db, "rooms");
    const employeesCollection = collection(db, "employees");
    const customersCollection = collection(db, "customers");
    const allocationsCollection = collection(db, "allocations");

    let unsubscribeRooms = () => {};
    let unsubscribeEmployees = () => {};
    let unsubscribeCustomers = () => {};
    let unsubscribeAllocations = () => {};

    try {
      unsubscribeRooms = onSnapshot(roomsCollection, (snapshot) => {
        setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      
      unsubscribeEmployees = onSnapshot(employeesCollection, (snapshot) => {
        setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      unsubscribeCustomers = onSnapshot(customersCollection, (snapshot) => {
        setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      unsubscribeAllocations = onSnapshot(allocationsCollection, (snapshot) => {
        setAllocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      
      console.log("Firebase Real-time updates enabled.");
      setLoading(false);
    } catch (error) {
      console.error("Firebase connection failed:", error);
      setLoading(false);
    }

    return () => {
      unsubscribeRooms();
      unsubscribeEmployees();
      unsubscribeCustomers();
      unsubscribeAllocations();
    };
  }, []);

  // --- Background Auto Check-out Logic ---
  useEffect(() => {
    const checkAndProcessAutoCheckOut = async () => {
      // Don't run if still loading initial data
      if (loading || allocations.length === 0) return;

      const now = new Date();
      
      const toCheckOut = allocations.filter(alloc => {
         // Only check active allocations with a valid checkout time
         if (alloc.status !== 'Active' || !alloc.checkOut) return false;
         
         const checkoutDate = new Date(alloc.checkOut);
         // Return true if current time is equal to or past scheduled checkout
         return !isNaN(checkoutDate.getTime()) && now >= checkoutDate;
      });

      if (toCheckOut.length === 0) return;

      console.log(`[Auto-Checkout] Processing ${toCheckOut.length} bookings...`);

      for (const alloc of toCheckOut) {
         try {
            // 1. Update Allocation
            const allocRef = doc(db, "allocations", alloc.id);
            await updateDoc(allocRef, { 
               status: 'Checked-Out',
               autoCheckedOut: true // Flag to indicate system did this
            });

            // 2. Update Room status
            if (alloc.roomId) {
               const roomRef = doc(db, "rooms", alloc.roomId);
               await updateDoc(roomRef, { status: 'Available' });
            }
            
            console.log(`[Auto-Checkout] Room ${alloc.roomId} is now available.`);
         } catch (error) {
            console.error(`[Auto-Checkout] Error processing ${alloc.id}:`, error);
         }
      }
    };
    
    // Check for upcoming checkouts (5 mins before)
    const checkUpcomingCheckouts = () => {
      if (loading || allocations.length === 0) return;
      const now = new Date();
      const fiveMinsFromNow = new Date(now.getTime() + 5 * 60000);

      const toAlert = allocations.filter(alloc => {
        if (alloc.status !== 'Active' || !alloc.checkOut || dismissedAlerts.has(alloc.id)) return false;
        const checkoutDate = new Date(alloc.checkOut);
        return checkoutDate > now && checkoutDate <= fiveMinsFromNow;
      });

      if (toAlert.length > 0) {
        setCheckoutAlerts(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newOnes = toAlert.filter(a => !existingIds.has(a.id));
          return [...prev, ...newOnes];
        });
      }
    };

    // Run check immediately on mount/data change, then every 60 seconds
    checkAndProcessAutoCheckOut();
    checkUpcomingCheckouts();
    const interval = setInterval(() => {
      checkAndProcessAutoCheckOut();
      checkUpcomingCheckouts();
    }, 60000); 

    return () => clearInterval(interval);
  }, [allocations, loading]);

  const value = {
    rooms,
    employees,
    customers,
    allocations,
    setRooms,      // Exposed for local updates if firebase is off
    setEmployees,
    setCustomers,
    setAllocations,
    checkoutAlerts,
    dismissAlert: (id) => {
      setCheckoutAlerts(prev => prev.filter(a => a.id !== id));
      setDismissedAlerts(prev => new Set(prev).add(id));
    },
    loading
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  return useContext(AppContext);
};
