import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore'; 
import { CalendarPlus, User, BedDouble, CheckCircle, Clock, Phone, FileText, Search, Users, Trash2, X, Plus, Eye, Edit3, LogOut, CreditCard, Printer, UserCheck, Download, ChevronDown } from 'lucide-react';
import logoImage from '../assets/logo.jpg';
import html2pdf from 'html2pdf.js';

// --- Date Formatting Helper ---
const formatBillDate = (dateStr) => {
   if (!dateStr) return "---";
   const d = new Date(dateStr);
   const day = String(d.getDate()).padStart(2, '0');
   const month = String(d.getMonth() + 1).padStart(2, '0');
   const year = d.getFullYear();
   const hrs = String(d.getHours()).padStart(2, '0');
   const mins = String(d.getMinutes()).padStart(2, '0');
   return `${day}-${month}-${year} ${hrs}${mins} HRS`;
};

// --- Number to Words Helper (Indian Format) ---
const numberToWords = (num) => {
   const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
   const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
   
   const g = (n) => {
      if (n === 0) return '';
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + g(n % 100) : '');
      if (n < 100000) return g(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + g(n % 1000) : '');
      if (n < 10000000) return g(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + g(n % 100000) : '');
      return g(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + g(n % 10000000) : '');
   };

   const whole = Math.floor(num);
   const fraction = Math.round((num - whole) * 100);
   let str = g(whole);
   if (str) str += ' Rupees';
   if (fraction > 0) {
      str += (str ? ' and ' : '') + g(fraction) + ' Paise';
   }
   return (str || 'Zero') + ' Only';
};

const Allocations = () => {
  const { rooms, employees, customers, allocations } = useAppContext();
  // --- Check-In / Allocation State ---
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  const [formData, setFormData] = useState({
    guestName: '',
    guestPhone: '',
    guestIdProofType: '',
    guestIdNumber: '',
    guestAddress: '',
    customerType: 'New', 
    employeeId: '',
    gstRate: '12',
    hsnSacNumber: '996311',
    advanceAmount: 0,
    paymentType: 'Cash',
    narration: '',
    registrationNumber: '',
    externalBookingId: '',
    guestGstin: '',
    companyName: '',
    checkIn: (() => {
       const now = new Date();
       const year = now.getFullYear();
       const month = String(now.getMonth() + 1).padStart(2, '0');
       const day = String(now.getDate()).padStart(2, '0');
       const hours = String(now.getHours()).padStart(2, '0');
       const minutes = String(now.getMinutes()).padStart(2, '0');
       return `${year}-${month}-${day}T${hours}:${minutes}`;
    })(),
    roomSelections: [
      {
        roomId: '',
        roomType: '',
        numberOfGuests: 1,
        stayDuration: 1,
        bookingPlatform: 'Counter',
        basePrice: ''
      }
    ]
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allocationSearch, setAllocationSearch] = useState('');
  const [statusTab, setStatusTab] = useState('Live');
  const location = useLocation();
  const navigate = useNavigate();
  const isAddBookingPage = location.pathname.includes('add-booking');

  useEffect(() => {
    // Reset all modals and overlays on route change
    setViewingAllocation(null);
    setEditingAllocation(null);
    setShowRoomSelector(false);
    setShowAddSourceModal(false);

    if (location.pathname.includes('completed')) {
      setStatusTab('History');
    } else if (location.pathname.includes('pending')) {
      setStatusTab('Live');
      setShowCheckInModal(false); // Ensure modal is closed when viewing pending list
    } else if (location.pathname.includes('add-booking') || location.pathname.includes('add-customer')) { // Backward compatibility
      setStatusTab('Live');
      setShowCheckInModal(true);
      // Ensure we start with a fresh form for new bookings
      setFormData(prev => ({
        ...prev,
        guestName: '', guestPhone: '', guestIdProofType: '', guestIdNumber: '', guestAddress: '',
        customerType: 'New', employeeId: '',
        advanceAmount: 0, paymentType: 'Cash', narration: '', guestGstin: '', companyName: '',
        registrationNumber: '', externalBookingId: '', existingCustomerId: null,
        gstRate: localStorage.getItem('defaultGstRate') || '12', hsnSacNumber: '',
        roomSelections: [
          {
            roomId: '',
            roomType: '',
            numberOfGuests: 1,
            stayDuration: 1,
            bookingPlatform: 'Counter',
            basePrice: ''
          }
        ]
      }));
    }
  }, [location.pathname]);

  const [viewingAllocation, setViewingAllocation] = useState(null);
  const [editingAllocation, setEditingAllocation] = useState(null);
  
  // Booking Sources State
  // Booking Sources State - Synced with DB
  const [bookingSources, setBookingSources] = useState([]);
  const [focusedFields, setFocusedFields] = useState({});

  // Fetch/Sync Booking Sources
  useEffect(() => {
    const defaultSources = [
      'Counter',
      'Agoda',
      'Booking.com',
      'ClearTrip',
      'Expedia',
      'MakeMyTrip',
      'Goibibo'
    ];

    const unsub = onSnapshot(doc(db, "configurations", "bookingSources"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.sources && Array.isArray(data.sources)) {
           setBookingSources(data.sources);
        }
      } else {
        // Initialize if not exists
        setBookingSources(defaultSources);
        setDoc(doc(db, "configurations", "bookingSources"), { sources: defaultSources })
          .catch(err => console.error("Failed to init booking sources", err));
      }
    });

    return () => unsub();
  }, []);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');


  // Multi-room Helpers
  const addRoomSelection = () => {
    setFormData(prev => ({
      ...prev,
      roomSelections: [
        ...prev.roomSelections,
        {
          roomId: '',
          roomType: '',
          numberOfGuests: 1,
          stayDuration: 1,
          bookingPlatform: 'Counter',
          basePrice: ''
        }
      ]
    }));
  };

  const removeRoomSelection = (index) => {
    if (formData.roomSelections.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      roomSelections: prev.roomSelections.filter((_, i) => i !== index)
    }));
  };

  const updateRoomSelection = (index, field, value) => {
    setFormData(prev => {
      const newSelections = [...prev.roomSelections];
      newSelections[index] = { ...newSelections[index], [field]: value };
      
      // If roomId changes, update roomType
      if (field === 'roomId') {
        const room = rooms.find(r => r.id === value);
        if (room) {
          newSelections[index].roomType = room.type;
        }
      }

      // If stayDuration changes, update CheckOut Date (Departure Date)
      if (field === 'stayDuration' && prev.checkIn) {
          const days = parseInt(value) || 1;
          const checkInDate = new Date(prev.checkIn);
          const checkOutDate = new Date(checkInDate.getTime() + days * 24 * 60 * 60 * 1000);
          
          const year = checkOutDate.getFullYear();
          const month = String(checkOutDate.getMonth() + 1).padStart(2, '0');
          const day = String(checkOutDate.getDate()).padStart(2, '0');
          const hours = String(checkOutDate.getHours()).padStart(2, '0');
          const minutes = String(checkOutDate.getMinutes()).padStart(2, '0');
          
          // Return new state with updated CheckOut Date
          return { 
              ...prev, 
              checkOut: `${year}-${month}-${day}T${hours}:${minutes}`,
              roomSelections: newSelections 
          };
      }
      
      return { ...prev, roomSelections: newSelections };
    });
  };

  // Filter available rooms (per row context)
  const getAvailableRoomsForRow = (currentIndex) => {
    const selectedOtherIds = formData.roomSelections
      .filter((_, i) => i !== currentIndex)
      .map(s => s.roomId)
      .filter(id => id !== '');

    return rooms.filter(r => {
      const isNotBooked = r.status !== 'Booked';
      const hasActiveAllocation = allocations.some(a => String(a.roomId) === String(r.id) && (a.status === 'Active' || !a.status));
      const notSelectedElsewhere = !selectedOtherIds.includes(r.id);
      
      const typeFilter = formData.roomSelections[currentIndex].roomType;
      const matchesType = !typeFilter || typeFilter === 'All' || r.type === typeFilter;

      return isNotBooked && !hasActiveAllocation && notSelectedElsewhere && matchesType;
    }).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  };
  // Helper Functions
  const getCustomerName = useCallback((id) => {
    return customers.find(c => String(c.id) === String(id))?.name || 'Unknown Guest';
  }, [customers]);

  const getRoomNumber = useCallback((id) => {
    return rooms.find(r => String(r.id) === String(id))?.roomNumber || '---';
  }, [rooms]);

  const getEmployeeName = useCallback((id) => {
    return employees.find(e => String(e.id) === String(id))?.name || '---';
  }, [employees]);

  const getCustomerPhone = useCallback((id) => {
    return customers.find(c => String(c.id) === String(id))?.phone || '---';
  }, [customers]);

  const availableRooms = useMemo(() => {
     return rooms.filter(r => {
        const isNotBooked = r.status !== 'Booked';
        const hasActiveAllocation = allocations.some(a => String(a.roomId) === String(r.id) && (a.status === 'Active' || !a.status));
        return isNotBooked && !hasActiveAllocation;
     });
  }, [rooms, allocations]);

  // Statistics
  const stats = useMemo(() => {
    const activeCount = allocations.filter(a => a.status === 'Active' || !a.status).length;
    const completedCount = allocations.filter(a => a.status === 'Checked-Out').length;
    
    // Calculate repeated customers
    const visitCounts = allocations.reduce((acc, curr) => {
       const id = String(curr.customerId);
       acc[id] = (acc[id] || 0) + 1;
       return acc;
    }, {});
    const repeatedCount = Object.values(visitCounts).filter(count => count > 1).length;

    const availableCount = rooms.filter(r => {
       const isNotBooked = r.status !== 'Booked';
       const hasActiveAllocation = allocations.some(a => String(a.roomId) === String(r.id) && (a.status === 'Active' || !a.status));
       return isNotBooked && !hasActiveAllocation;
    }).length;

    return { activeCount, completedCount, repeatedCount, availableCount };
  }, [allocations, rooms]);

  const filteredAllocations = useMemo(() => {
    return allocations.filter(alloc => {
      const custName = getCustomerName(alloc.customerId).toLowerCase();
      const allRoomNums = alloc.roomSelections 
        ? alloc.roomSelections.map(s => getRoomNumber(s.roomId)).join(' ').toLowerCase()
        : getRoomNumber(alloc.roomId).toLowerCase();
      const regNo = (alloc.registrationNumber || '').toLowerCase();
      const bookId = (alloc.externalBookingId || '').toLowerCase();
      const phone = getCustomerPhone(alloc.customerId).toLowerCase();
      const search = allocationSearch.toLowerCase();
      
      const matchesSearch = custName.includes(search) || allRoomNums.includes(search) || regNo.includes(search) || bookId.includes(search) || phone.includes(search);
      // Live tab: Show Active bookings (or bookings without status for backward compatibility)
      // History tab: Show ONLY Checked-Out bookings
      const matchesTab = statusTab === 'Live' 
        ? (alloc.status === 'Active' || alloc.status === undefined || alloc.status === null || alloc.status === '') 
        : (alloc.status === 'Checked-Out');
      

      
      return matchesSearch && matchesTab;
    }).sort((a, b) => new Date(b.checkIn || 0) - new Date(a.checkIn || 0));
  }, [allocations, allocationSearch, statusTab, getCustomerName, getRoomNumber, getCustomerPhone]);

  // --- Handlers ---
  const handleChange = (e) => {
    let { name, value } = e.target;

    // Sanitization
    if (name === 'guestPhone') {
        value = value.replace(/\D/g, '').slice(0, 10);
    } else if (name === 'registrationNumber') {
        value = value.replace(/\D/g, '');
    } else if (name === 'guestName') {
        value = value.replace(/[^a-zA-Z\s.'-]/g, '');
    } else if (name === 'guestGstin') {
        value = value.toUpperCase().slice(0, 15);
    } else if (name === 'companyName') {
        value = value.toUpperCase(); 
    } else if (name === 'guestIdNumber') {
        if (formData.guestIdProofType === 'Aadhar Card') {
             value = value.replace(/\D/g, '').slice(0, 12);
        } else if (formData.guestIdProofType === 'PAN Card') {
             value = value.toUpperCase().slice(0, 10);
        } else if (formData.guestIdProofType === 'Voter ID') {
             value = value.toUpperCase().slice(0, 10);
        } else if (formData.guestIdProofType === 'Driving License') {
             value = value.toUpperCase().slice(0, 16);
        }
    }

    setFormData(prev => {
       const newData = { ...prev, [name]: value };
       
       // Auto-calculate checkout when check-in changes (Keep Duration Constant)
       if (name === 'checkIn' && value) {
           const checkInDate = new Date(value);
           const duration = parseInt(prev.roomSelections[0]?.stayDuration) || 1;
           const checkOutDate = new Date(checkInDate.getTime() + duration * 24 * 60 * 60 * 1000);
           const year = checkOutDate.getFullYear();
           const month = String(checkOutDate.getMonth() + 1).padStart(2, '0');
           const day = String(checkOutDate.getDate()).padStart(2, '0');
           const hours = String(checkOutDate.getHours()).padStart(2, '0');
           const minutes = String(checkOutDate.getMinutes()).padStart(2, '0');
           newData.checkOut = `${year}-${month}-${day}T${hours}:${minutes}`;
       }
       
       // Auto-calculate duration when checkout changes
       if (name === 'checkOut' && value && prev.checkIn) {
           const checkInDate = new Date(prev.checkIn);
           const checkOutDate = new Date(value);
           const diffTime = checkOutDate - checkInDate;
           let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
           if (diffDays < 1) diffDays = 1;
           
           newData.roomSelections = prev.roomSelections.map(s => ({
               ...s,
               stayDuration: diffDays
           }));
       }
       
       // Auto-lookup for returning guests (only for new bookings)
       if (!editingAllocation && name === 'guestPhone') {
           // Value is already clean digits
           if (value.length >= 10) {
               const inputLast10 = value.slice(-10);
               const existing = customers.find(c => {
                   const dbPhone = String(c.phone || '').replace(/\D/g, '');
                   return dbPhone.length >= 10 && dbPhone.slice(-10) === inputLast10;
               });

               if (existing) {
                   // Try to parse ID Proof "Type - Number"
                   let type = '', num = '';
                   if (existing.idProof && existing.idProof.includes(' - ')) {
                       [type, num] = existing.idProof.split(' - ');
                   } else {
                       num = existing.idProof || '';
                   }

                   newData.guestName = existing.name || '';
                   newData.guestAddress = existing.address || '';
                   newData.guestIdProofType = type;
                   newData.guestIdNumber = num;
                   newData.guestGstin = existing.gstin || '';
                   newData.companyName = existing.companyName || '';
                   newData.customerType = 'Returning';
                   newData.existingCustomerId = existing.id;
               } else if (prev.existingCustomerId) {
                   // Input is long enough but no match found -> Reset if previously matched
                   newData.existingCustomerId = null;
                   newData.customerType = 'New';
               }
           } else if (prev.existingCustomerId) {
               // Input became too short -> Reset match
               newData.existingCustomerId = null;
               newData.customerType = 'New';
           }
       }
       return newData;
    });
  };

  const handleAddBookingSource = async () => {
    const trimmedName = newSourceName.trim();
    if (!trimmedName) {
      alert('Please enter a booking source name');
      return;
    }
    // Case-insensitive check
    if (bookingSources.some(s => s.toLowerCase() === trimmedName.toLowerCase())) {
      alert('This booking source already exists');
      return;
    }

    try {
      const newSources = [...bookingSources, trimmedName];
      // Optimistic update
      setBookingSources(newSources); 
      setFormData(prev => ({ ...prev, bookingPlatform: trimmedName }));
      
      // Persist to DB
      await updateDoc(doc(db, "configurations", "bookingSources"), {
        sources: newSources
      });
      
      setNewSourceName('');
      setShowAddSourceModal(false);
    } catch (error) {
      console.error("Failed to add booking source", error);
      alert("Failed to save booking source to database.");
    }
  };

  const resetForm = () => {
    setFormData({
      guestName: '',
      guestPhone: '',
      guestIdProofType: '',
      guestIdNumber: '',
      guestAddress: '',
      guestGstin: '',
      companyName: '',
      registrationNumber: '',
      externalBookingId: '',
      customerType: 'New',
      employeeId: '',
      checkIn: (() => {
         const now = new Date();
         const year = now.getFullYear();
         const month = String(now.getMonth() + 1).padStart(2, '0');
         const day = String(now.getDate()).padStart(2, '0');
         const hours = String(now.getHours()).padStart(2, '0');
         const minutes = String(now.getMinutes()).padStart(2, '0');
         return `${year}-${month}-${day}T${hours}:${minutes}`;
      })(),
      checkOut: (() => {
         const now = new Date();
         now.setDate(now.getDate() + 1);
         const year = now.getFullYear();
         const month = String(now.getMonth() + 1).padStart(2, '0');
         const day = String(now.getDate()).padStart(2, '0');
         const hours = String(now.getHours()).padStart(2, '0');
         const minutes = String(now.getMinutes()).padStart(2, '0');
         return `${year}-${month}-${day}T${hours}:${minutes}`;
      })(),
      paymentType: 'Cash',
      advanceAmount: 0,
      narration: '',
      existingCustomerId: null,
      gstRate: localStorage.getItem('defaultGstRate') || '12',
      hsnSacNumber: '996311',
      roomSelections: [
        {
          roomId: '',
          roomType: '',
          numberOfGuests: 1,
          stayDuration: 1,
          bookingPlatform: 'Counter',
          basePrice: ''
        }
      ]
    });
    if (isAddBookingPage) {
      navigate('/pending');
    } else {
      setShowCheckInModal(false);
    }
  };

  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    
    // --- Validations ---
    if (!/^[6-9]\d{9}$/.test(formData.guestPhone)) {
        alert("Invalid Phone Number. Please enter a valid 10-digit Indian mobile number.");
        return;
    }
    if (formData.guestName.trim().length < 3) {
        alert("Customer Name must be at least 3 characters.");
        return;
    }
    if (!formData.guestIdNumber.trim()) {
        alert("ID Number is required.");
        return;
    }

    // Specific ID Validation
    const idType = formData.guestIdProofType;
    const idNum = formData.guestIdNumber.trim();

    if (idType === 'Aadhar Card' && !/^\d{12}$/.test(idNum)) {
         alert("Aadhar Number must be exactly 12 digits.");
         return;
    }
    if (idType === 'PAN Card' && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(idNum)) {
         alert("Invalid PAN Card Number format.");
         return;
    }
    if (formData.guestAddress.trim().length < 5) {
        alert("Please enter a valid, complete address.");
        return;
    }
    if (!formData.employeeId) {
        alert("Please select the staff member who did the booking.");
        return;
    }
    if (formData.roomSelections.some(s => !s.roomId)) {
        alert("Please select a room for all rows.");
        return;
    }
    // Check if any room has invalid duration or guests
    if (formData.roomSelections.some(s => parseInt(s.stayDuration) < 1 || parseInt(s.numberOfGuests) < 1)) {
        alert("Number of persons and days must be at least 1.");
        return;
    }
    // -------------------

    setIsSubmitting(true);
    try {
      let customerId = formData.existingCustomerId;

      if (customerId) {
          // Update Existing Customer
          const existingCust = customers.find(c => c.id === customerId);
          const newVisits = (existingCust?.visitHistory || 0) + 1;
          
          await updateDoc(doc(db, "customers", customerId), {
              name: formData.guestName,
              phone: formData.guestPhone, // Ensure phone is updated if slightly changed but matched? Or keep original? Safe to update.
              idProof: `${formData.guestIdProofType} - ${formData.guestIdNumber}`,
              address: formData.guestAddress,
              customerType: formData.customerType,
              visitHistory: newVisits,
              lastVisit: new Date().toISOString(),
              gstin: formData.guestGstin || '',
              companyName: formData.companyName || ''
          });
      } else {
          // Create New Customer
          const customerData = {
              name: formData.guestName,
              phone: formData.guestPhone,
              idProof: `${formData.guestIdProofType} - ${formData.guestIdNumber}`,
              address: formData.guestAddress,
              customerType: formData.customerType,
              visitHistory: 1,
              createdAt: new Date().toISOString(),
              gstin: formData.guestGstin || '',
              companyName: formData.companyName || ''
          };
          
          const customersCollection = collection(db, "customers");
          const custDocRef = await addDoc(customersCollection, customerData);
          customerId = custDocRef.id;
      }
      
      const newCustomerId = customerId;

      const allocationsCollection = collection(db, "allocations");
      
      // Calculate Aggregated Data
      const gstRate = parseFloat(formData.gstRate) || 0;
      let totalBasePrice = 0;
      let totalGuests = 0;
      let maxDuration = 0;
      
      const selectionsForDb = formData.roomSelections.map(s => {
         const bp = parseFloat(s.basePrice) || 0;
         const dur = parseInt(s.stayDuration) || 1;
         totalBasePrice += (bp * dur);
         totalGuests += (parseInt(s.numberOfGuests) || 1);
         if (dur > maxDuration) maxDuration = dur;
         
         return {
            roomId: s.roomId,
            roomType: s.roomType || '',
            numberOfGuests: parseInt(s.numberOfGuests) || 1,
            stayDuration: dur,
            bookingPlatform: s.bookingPlatform || 'Counter',
            basePrice: bp
         };
      });

      const finalPrice = totalBasePrice * (1 + (gstRate / 100));
      const advanceVal = parseFloat(formData.advanceAmount || 0);
      const remainingVal = finalPrice - advanceVal;

      const checkInDate = new Date(formData.checkIn);
      const checkOutDate = new Date(checkInDate.getTime() + maxDuration * 24 * 60 * 60 * 1000);

      if (editingAllocation) {
          // Update Existing Group Allocation
          // Release old rooms associated with this allocation first
          const oldRooms = editingAllocation.roomSelections || [{ roomId: editingAllocation.roomId }];
          for (const s of oldRooms) {
             if (s.roomId) {
                await updateDoc(doc(db, "rooms", s.roomId), { status: "Available" });
             }
          }
          
          await updateDoc(doc(db, "allocations", editingAllocation.id), {
             customerId: newCustomerId,
             roomSelections: selectionsForDb,
             roomId: selectionsForDb[0].roomId, // Backward compatibility
             employeeId: formData.employeeId,
             checkIn: formData.checkIn,
             checkOut: checkOutDate.toISOString(),
             numberOfGuests: totalGuests,
             advanceAmount: advanceVal,
             remainingAmount: remainingVal,
             paymentType: formData.paymentType || 'Cash',
             narration: formData.narration || '',
             bookingPlatform: selectionsForDb[0].bookingPlatform || 'Counter',
             registrationNumber: formData.registrationNumber || '',
             externalBookingId: formData.externalBookingId || '',
             stayDuration: maxDuration,
             hsnSacNumber: formData.hsnSacNumber || '',
             basePrice: totalBasePrice / maxDuration, // Legacy average
             gstRate: gstRate,
             price: finalPrice
          });
          
          // Re-mark new rooms as booked
          for (const s of selectionsForDb) {
             await updateDoc(doc(db, "rooms", s.roomId), { status: "Booked" });
          }

          setEditingAllocation(null);
      } else {
          // Create New Consolidated Allocation
          await addDoc(allocationsCollection, {
             customerId: newCustomerId,
             roomSelections: selectionsForDb,
             roomId: selectionsForDb[0].roomId, // Legacy compatibility
             employeeId: formData.employeeId,
             checkIn: formData.checkIn,
             checkOut: checkOutDate.toISOString(),
             numberOfGuests: totalGuests,
             basePrice: totalBasePrice / maxDuration, 
             gstRate: gstRate,
             price: finalPrice,
             status: 'Active',
             advanceAmount: advanceVal,
             remainingAmount: remainingVal,
             paymentType: formData.paymentType || 'Cash',
             narration: formData.narration || '',
             bookingPlatform: selectionsForDb[0].bookingPlatform || 'Counter',
             registrationNumber: formData.registrationNumber || '',
             externalBookingId: formData.externalBookingId || '',
             stayDuration: maxDuration,
             hsnSacNumber: formData.hsnSacNumber || ''
          });

          // Mark all selected rooms as Booked
          for (const s of selectionsForDb) {
             const roomRef = doc(db, "rooms", s.roomId);
             await updateDoc(roomRef, { status: "Booked" });
          }
      }
      
      if(formData.gstRate) localStorage.setItem('defaultGstRate', formData.gstRate);

      setFormData({
         guestName: '', guestPhone: '', guestIdProofType: 'PAN Card', guestIdNumber: '', guestAddress: '', guestGstin: '', companyName: '', registrationNumber: '', externalBookingId: '', customerType: 'New',
         employeeId: '', gstRate: localStorage.getItem('defaultGstRate') || '12', hsnSacNumber: '', advanceAmount: 0, paymentType: 'Cash', narration: '', 
         checkIn: (() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
         })(),
         roomSelections: [
           {
             roomId: '',
             roomType: '',
             numberOfGuests: 1,
             stayDuration: 1,
             bookingPlatform: 'Counter',
             basePrice: ''
           }
         ],
         existingCustomerId: null
      });

      if (isAddBookingPage) {
        navigate('/pending');
      } else {
        setShowCheckInModal(false);
      }
    } catch (error) {
       console.error("Allocation failed", error);
       alert(`Failed to process booking: ${error.message}`);
    }
    setIsSubmitting(false);
  };

  const handleCheckOut = async (allocationId) => {
    if(window.confirm("Confirm guest check-out?")) {
        try {
            setIsSubmitting(true);
            const alloc = allocations.find(a => a.id === allocationId);
            if (!alloc) return;

            await updateDoc(doc(db, "allocations", allocationId), { 
                status: 'Checked-Out',
                actualCheckOut: new Date().toISOString()
            });

            // Release all rooms
            const roomsToRelease = alloc.roomSelections || [{ roomId: alloc.roomId }];
            for (const s of roomsToRelease) {
               if (s.roomId) {
                  await updateDoc(doc(db, "rooms", s.roomId), { status: 'Available' });
               }
            }
        } catch (error) {
            console.error("Check-out failed", error);
        } finally {
            setIsSubmitting(false);
        }
    }
  };

  const handleDeleteAllocation = async (id) => {
     if(window.confirm("Permenently delete this record?")) {
        try {
           await deleteDoc(doc(db, "allocations", id));
        } catch (error) {
           console.error("Delete failed", error);
        }
     }
  };

  const handlePrintBill = async (allocation, action = 'print') => {
     const cust = customers.find(c => String(c.id) === String(allocation.customerId));
     const employee = employees.find(e => String(e.id) === String(allocation.employeeId));
     
     // Calculations
     const gstRate = Number(allocation.gstRate || 0);
     const selections = allocation.roomSelections || [{ 
         roomId: allocation.roomId, 
         numberOfGuests: allocation.numberOfGuests || 1, 
         stayDuration: allocation.stayDuration || 1, 
         bookingPlatform: allocation.bookingPlatform || 'Counter',
         basePrice: allocation.basePrice,
         roomType: rooms.find(r => String(r.id) === String(allocation.roomId))?.type || ''
     }];

     let taxableValue = 0;
     let totalTax = 0;
     
     const roomWiseGst = selections.map(s => {
         const bp = parseFloat(s.basePrice) || 0;
         const dur = parseInt(s.stayDuration) || 1;
         const lineTaxable = bp * dur;
         const lineGst = lineTaxable * (gstRate / 100);
         taxableValue += lineTaxable;
         totalTax += lineGst;
         return {
             ...s,
             lineTaxable,
             lineCgst: lineGst / 2,
             lineSgst: lineGst / 2,
             lineTotalTax: lineGst
         };
     });

     const totalInclusivePrice = taxableValue + totalTax;
     const cgstAmount = totalTax / 2;
     const sgstAmount = totalTax / 2;

     let invoiceNumber = allocation.invoiceNumber;
     if (!invoiceNumber) {
        try {
           const q = query(collection(db, "invoices"), where("allocationId", "==", allocation.id));
           const querySnapshot = await getDocs(q);
           if (!querySnapshot.empty) {
              invoiceNumber = querySnapshot.docs[0].data().invoiceNumber;
           } else {
              let nextNum = 1;
              try {
                  const lastInvQuery = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1));
                  const lastInvSnap = await getDocs(lastInvQuery);
                  if (!lastInvSnap.empty) {
                     const lastId = String(lastInvSnap.docs[0].data().invoiceNumber);
                     const match = lastId.match(/(\d+)/);
                     if (match) nextNum = parseInt(match[0], 10) + 1;
                  }
              } catch (err) { console.warn("Sequence fetch failed", err); }
              invoiceNumber = String(nextNum).padStart(4, '0');
              await addDoc(collection(db, "invoices"), {
                 invoiceNumber: invoiceNumber,
                 allocationId: allocation.id,
                 customerId: allocation.customerId,
                 customerName: cust?.name || 'Guest',
                 amount: totalInclusivePrice,
                 createdAt: new Date().toISOString()
              });
              await updateDoc(doc(db, "allocations", allocation.id), { invoiceNumber: invoiceNumber });
           }
        } catch (error) { invoiceNumber = `INV-${Date.now().toString().slice(-4)}`; }
     }

     const invoiceHTML = `
       <html>
         <head>
           <title>Invoice #${invoiceNumber}</title>
           <style>
             @page { size: A4; margin: 15mm; }
             body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; line-height: 1.4; }
             .invoice-box { width: 100%; margin: auto; padding: 0 30px; box-sizing: border-box; }
             


             /* Customer Section */
             .customer-info { margin-bottom: 15px; }
             .info-row { display: flex; margin-bottom: 2px; }
             .info-label { width: 110px; font-weight: bold; flex-shrink: 0; }
             .info-value { flex-grow: 1; }

             /* Table Styles */
             table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
             table, th, td { border: 1px solid #000; }
             th { background-color: #f2f2f2; padding: 8px 4px; text-align: center; font-size: 10px; font-weight: bold; text-transform: uppercase; }
             td { padding: 8px 4px; vertical-align: middle; font-size: 11px; }
             .text-center { text-align: center; }
             .text-right { text-align: right; }

             /* GST Summary */
             .gst-analysis th { background-color: #f9f9f9; }
             
             /* Calculation Section */
             .total-section { display: flex; justify-content: space-between; margin-top: 10px; }
             .words-section { width: 65%; font-style: italic; }
             .calc-box { width: 30%; }
             .calc-row { display: flex; justify-content: space-between; padding: 2px 0; }
             .calc-label { font-weight: bold; }

             /* Footer Section */
             .footer { margin-top: 40px; }
             .sig-area { display: flex; justify-content: space-between; margin-top: 50px; }
             .sig-box { text-align: center; width: 220px; }
             .sig-line { border-top: 1px solid #000; margin-bottom: 4px; }
             .jurisdiction { font-weight: bold; text-align: center; margin-top: 20px; font-size: 10px; text-transform: uppercase; }
             .computer-gen { text-align: center; font-size: 8px; color: #666; margin-top: 5px; }
           </style>
         </head>
         <body>
           <div class="invoice-box">
             <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px;">
               <div style="text-align: left;">
                  <img src="${logoImage}" alt="Logo" style="height: 90px; width: 180px;" />
               </div>

               <div style="text-align: right;">
                 <div style="font-size: 22px; font-weight: bold; margin-bottom: 4px;">Balaji Lodging</div>
                 <div style="font-size: 10px; line-height: 1.4;">
                   Opp. Railway Station, Near Shriyash Hospital, Pandharpur 413304.<br>
                   Phone : +91 9284793956 / 8080248271<br>
                   GSTIN/UIN: 27AAPFB9198M1ZE<br>
                   Email: balajilodgingpandharpur@gmail.com
                 </div>
               </div>
             </div>

             <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px;">
                <div style="flex: 1;">
                   <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 2px;">CUSTOMER DETAILS</div>
                   <div class="info-row"><span class="info-label">Booked By :</span> <span class="info-value" style="font-weight:bold;">${employee?.name || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Name :</span> <span class="info-value" style="font-weight:bold;">${cust?.name || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Address :</span> <span class="info-value">${cust?.address || '---'}</span></div>
                   <div class="info-row"><span class="info-label">GSTIN :</span> <span class="info-value">${cust?.gstin || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Company :</span> <span class="info-value">${cust?.companyName || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Phone :</span> <span class="info-value">${cust?.phone || '---'}</span></div>
                </div>

                <div style="flex: 0.8;">
                   <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 2px;">INVOICE DETAILS</div>
                   <div style="display: grid; grid-template-columns: auto auto; gap: 4px 10px; font-size: 11px;">
                      <span style="font-weight: bold;">Invoice No :</span> <span style="font-weight:bold;">${invoiceNumber}</span>
                      <span style="font-weight: bold;">Invoice Date :</span> <span>${(() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}</span>
                      <span style="font-weight: bold;">Arrival :</span> <span>${formatBillDate(allocation.checkIn)}</span>
                      <span style="font-weight: bold;">Departure :</span> <span>${formatBillDate(allocation.checkOut)}</span>
                      <span style="font-weight: bold;">Reg. No :</span> <span>${allocation.registrationNumber || '---'}</span>
                      <span style="font-weight: bold;">Booking ID :</span> <span>${allocation.externalBookingId || '0'}</span>
                   </div>
                </div>
             </div>

             <table>
               <thead>
                 <tr>
                   <th style="width: 30px;">Sr.No</th>
                   <th style="width: 60px;">Room No</th>
                   <th style="width: 40px;">GST</th>
                   <th style="width: 60px;">Guests</th>
                   <th style="width: 40px;">Days</th>
                   <th>Booking Type</th>
                   <th>Room Type</th>
                   <th style="width: 80px;">Rate</th>
                   <th style="width: 90px;">Total</th>
                 </tr>
               </thead>
                <tbody>
                  ${selections.map((s, i) => {
                    const rNum = getRoomNumber(s.roomId);
                    const lineTotal = (parseFloat(s.basePrice) || 0) * (parseInt(s.stayDuration) || 1);
                    return `
                      <tr>
                        <td class="text-center">${i + 1}</td>
                        <td class="text-center">${rNum}</td>
                        <td class="text-center">${gstRate.toFixed(2)}%</td>
                        <td class="text-center">${String(s.numberOfGuests).padStart(2, '0')}</td>
                        <td class="text-center">${s.stayDuration}</td>
                        <td class="text-center">${s.bookingPlatform || allocation.bookingPlatform}</td>
                        <td class="text-center">${s.roomType || '---'}</td>
                        <td class="text-center">${(parseFloat(s.basePrice) || 0).toFixed(2)}</td>
                        <td class="text-right">${lineTotal.toFixed(2)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
             </table>

             <div class="total-section">
               <div class="words-section">
                 <div style="margin-bottom: 10px;"><strong>In Words:</strong> ${numberToWords(totalInclusivePrice)}</div>
                 <div><strong>Narration :</strong> ${allocation.narration || allocation.paymentType || '---'}</div>
               </div>
               <div class="calc-box">
                 <div class="calc-row"><span>Other Rs.</span> <span>0.00</span></div>
                 <div class="calc-row"><span>Subtotal Rs.</span> <span>${taxableValue.toFixed(2)}</span></div>
                 <div class="calc-row"><span>SGST Rs.</span> <span>${sgstAmount.toFixed(2)}</span></div>
                 <div class="calc-row"><span>CGST Rs.</span> <span>${cgstAmount.toFixed(2)}</span></div>
                 <div class="calc-row" style="border-top: 1px solid #000; margin-top:2px; padding-top:2px; font-weight:bold; font-size:13px;">
                   <span>Total Rs.</span> <span>${totalInclusivePrice.toFixed(2)}</span>
                 </div>
               </div>
             </div>

             <div style="margin-top: 25px; font-weight:bold; text-decoration: underline; margin-bottom: 5px;">GST Breakdown</div>
             <table class="gst-analysis">
               <thead>
                 <tr>
                   <th rowspan="2">Sr.No</th>
                   <th rowspan="2">HSN/SAC</th>
                   <th rowspan="2">Taxable Value</th>
                   <th colspan="2">CGST</th>
                   <th colspan="2">SGST</th>
                   <th rowspan="2">Total Tax</th>
                 </tr>
                 <tr>
                   <th>Tax</th>
                   <th>Amount</th>
                   <th>Tax</th>
                   <th>Amount</th>
                 </tr>
               </thead>
               <tbody>
                 ${roomWiseGst.map((s, i) => `
                   <tr>
                     <td class="text-center">${i + 1}</td>
                     <td class="text-center">${allocation.hsnSacNumber || '996311'}</td>
                     <td class="text-right">${s.lineTaxable.toFixed(2)}</td>
                     <td class="text-center">${(gstRate / 2).toFixed(2)}%</td>
                     <td class="text-right">${s.lineCgst.toFixed(2)}</td>
                     <td class="text-center">${(gstRate / 2).toFixed(2)}%</td>
                     <td class="text-right">${s.lineSgst.toFixed(2)}</td>
                     <td class="text-right">${s.lineTotalTax.toFixed(2)}</td>
                   </tr>
                 `).join('')}
                 <tr style="font-weight:bold; background-color: #f9f9f9;">
                   <td colspan="2" class="text-center">Total</td>
                   <td class="text-right">${taxableValue.toFixed(2)}</td>
                   <td></td>
                   <td class="text-right">${cgstAmount.toFixed(2)}</td>
                   <td></td>
                   <td class="text-right">${sgstAmount.toFixed(2)}</td>
                   <td class="text-right">${totalTax.toFixed(2)}</td>
                 </tr>
               </tbody>
             </table>
             
             <div style="margin-bottom: 20px;"><strong>Tax Amount (In Words):</strong> ${numberToWords(totalTax).replace('Rupees', 'Rupees')}</div>

             <div class="info-row"><span class="info-label" style="width: 80px;">Pay Details :</span> <span class="info-value" style="font-weight:bold; font-size: 14px; text-decoration: underline;">₹${totalInclusivePrice.toFixed(2)} ${allocation.paymentType}</span></div>

             <div class="sig-area">
               <div class="sig-box">
                 <div class="sig-line"></div>
                 <div style="font-size: 10px; font-weight:bold;">Customer's Signature</div>
               </div>
               <div class="sig-box">
                 <div class="sig-line"></div>
                 <div style="font-size: 10px; font-weight:bold;">For Balaji Lodging<br>(Authorized Signatory)</div>
               </div>
             </div>

             <div class="jurisdiction">SUBJECT TO PANDHARPUR JURISDICTION</div>
             <div class="computer-gen">It is computer generated invoice,  hence does not require stamp and signature.</div>
           </div>
         </body>
       </html>
     `;

     if (action === 'print') {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(invoiceHTML);
        printWindow.document.close();
        // Wait for images to load before printing
        printWindow.onload = function() {
           setTimeout(() => {
             printWindow.print();
           }, 500); 
        };
     } else {
        const element = document.createElement('div');
        element.innerHTML = invoiceHTML;
        const opt = {
           margin: 0,
           filename: `Invoice_${invoiceNumber}.pdf`,
           image: { type: 'jpeg', quality: 0.98 },
           html2canvas: { scale: 2, useCORS: true },
           jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
     }
  };

  return (
    <div className={`flex flex-col space-y-2 ${isAddBookingPage ? 'h-[calc(100vh-2rem)]' : 'h-[calc(100vh-6rem)]'}`}>
      
      {/* Top Section (Fixed) */}
      {!isAddBookingPage && (
      <div className="flex-none space-y-3">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {statusTab === 'History' 
                ? 'Completed Bookings' 
                : location.pathname.includes('pending') 
                  ? 'Pending' 
                  : 'Add Booking'}
            </h1>
             <p className="text-gray-500 text-sm mt-1">{statusTab === 'Live' ? 'New check-ins & active customers' : 'View past booking history'}</p>
          </div>
          <div className="flex items-center gap-2">
              {statusTab === 'Live' && !location.pathname.includes('pending') && (
                  <button 
                    onClick={() => { resetForm(); setShowCheckInModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all"
                  >
                    <CalendarPlus size={16} /> New Booking
                  </button>
              )}
          </div>
        </div>

         {/* Stats Cards */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div 
               onClick={() => navigate('/pending')}
               className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02] cursor-pointer"
            >
                <div>
                   <p className="text-indigo-100 text-xs font-black uppercase tracking-wider">Active Bookings</p>
                   <p className="text-3xl font-black text-white mt-1">{stats.activeCount}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                   <BedDouble size={24} className="text-white" />
                </div>
            </div>
            
            <div 
               onClick={() => navigate(statusTab === 'History' ? '/completed' : '/rooms')}
               className={`bg-gradient-to-br ${statusTab === 'History' ? 'from-emerald-500 to-emerald-600' : 'from-emerald-500 to-emerald-600'} p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02] cursor-pointer`}
            >
                <div>
                   <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">
                      {statusTab === 'History' ? 'Total Completed' : 'Available Rooms'}
                   </p>
                   <p className="text-3xl font-black text-white mt-1">
                      {statusTab === 'History' ? stats.completedCount : stats.availableCount}
                   </p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                   {statusTab === 'History' ? <CheckCircle size={24} className="text-white" /> : <CheckCircle size={24} className="text-white" />}
                </div>
            </div>
            
            <div 
               onClick={() => navigate(statusTab === 'History' ? '/customers' : '/employees')}
               className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02] cursor-pointer"
            >
                <div>
                   <p className="text-amber-100 text-xs font-black uppercase tracking-wider">
                      {statusTab === 'History' ? 'Repeat Customers' : 'Duty Staff'}
                   </p>
                   <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-white">
                         {statusTab === 'History' ? stats.repeatedCount : employees.filter(e => e.status !== 'Inactive').length}
                      </span>
                      <span className="text-xs text-amber-100 font-bold opacity-80">
                         {statusTab === 'History' ? 'Loyal' : 'Active'}
                      </span>
                   </div>
                </div>
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                   {statusTab === 'History' ? <UserCheck size={24} className="text-white" /> : <Users size={24} className="text-white" />}
                </div>
            </div>
         </div>

        {/* Controls Bar */}
        <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-center">
            {/* Search */}
            <div className="relative w-full lg:w-96 group">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
              <input 
                type="text" 
                placeholder="Search Customer or Room..." 
                value={allocationSearch}
                onChange={(e) => setAllocationSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-indigo-500 rounded-lg text-sm font-medium outline-none transition-all" 
              />
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
                 {/* Status Filters - Segmented Control Style */}
                 {(!location.pathname.includes('add-customer') && !location.pathname.includes('completed')) && (
                     <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100 shrink-0">
                        <button
                            onClick={() => setStatusTab('Live')}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                              statusTab === 'Live' ? 'bg-white text-indigo-600 shadow-sm border border-indigo-50' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            LIVE STAY
                          </button>
                          <button
                            onClick={() => setStatusTab('History')}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                              statusTab === 'History' ? 'bg-white text-indigo-600 shadow-sm border border-indigo-50' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            HISTORY
                          </button>
                     </div>
                 )}
            </div>
        </div>
      </div>
      )}

      {/* Table Container */}
      {!isAddBookingPage && (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
         <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
           <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10 text-gray-400 text-[10px] uppercase tracking-wider font-bold">
                 <tr>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Sr.No</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Room No</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Customer Name</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Contact No</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Duration</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Duty Staff</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Pending Amount</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Actions</th>
                 </tr>
              </thead> 
              <tbody className="divide-y divide-gray-100">
                 {filteredAllocations.map((alloc, index) => (
                   <tr key={alloc.id} className="group hover:bg-gray-50/80 transition-all">
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-400">{(index + 1).toString().padStart(2, '0')}</span>
                     </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                         <span className="inline-flex items-center justify-center min-w-[3rem] text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                            {alloc.roomSelections 
                               ? alloc.roomSelections.map(s => getRoomNumber(s.roomId)).join(', ') 
                               : getRoomNumber(alloc.roomId)}
                         </span>
                      </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-bold text-gray-900">{getCustomerName(alloc.customerId)}</span>
                            <span className="text-[10px] text-gray-400 font-medium">Guest</span>
                        </div>
                     </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-700">{getCustomerPhone(alloc.customerId)}</span>
                     </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="space-y-1 flex flex-col items-center">
                           <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 w-fit">
                              In: {(() => {
                                 const d = new Date(alloc.checkIn);
                                 return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                              })()}
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 w-fit">
                              Out: {(() => {
                                 const d = alloc.actualCheckOut ? new Date(alloc.actualCheckOut) : new Date(alloc.checkOut);
                                 return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                              })()}
                           </div>
                        </div>
                     </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-700">{getEmployeeName(alloc.employeeId)}</span>
                     </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                           ₹{(() => {
                              const gstRate = Number(alloc.gstRate || 0);
                              const selections = alloc.roomSelections || [{ 
                                  basePrice: alloc.basePrice, 
                                  stayDuration: alloc.stayDuration 
                              }];
                              const totalBase = selections.reduce((sum, s) => sum + ((Number(s.basePrice)||0) * (Number(s.stayDuration)||1)), 0);
                              const total = totalBase * (1 + gstRate/100);
                              const paid = Number(alloc.advanceAmount || 0);
                              const pending = total - paid;
                              return Math.max(0, Math.round(pending)).toLocaleString('en-IN');
                           })()}
                        </span>
                     </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        {alloc.status === 'Checked-Out' ? (
                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 border border-gray-200">
                              Checked Out
                           </span>
                        ) : (
                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             Active
                           </span>
                        )}
                     </td>
                     <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2 transition-opacity">
                           <button 
                             onClick={() => setViewingAllocation(alloc)}
                             className="p-1.5 bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-100 rounded-lg transition-all shadow-sm"
                             title="View Booking Details"
                           >
                              <Eye size={16} />
                           </button>
                           
                           <button 
                             onClick={() => {
                                setEditingAllocation(alloc);
                                const cust = customers.find(c => String(c.id) === String(alloc.customerId));
                                setFormData({
                                   guestName: cust?.name || '',
                                   guestPhone: cust?.phone || '',
                                   guestIdProofType: cust?.idProof?.split(' - ')[0] || '',
                                   guestIdNumber: cust?.idProof?.split(' - ')[1] || '',
                                   guestAddress: cust?.address || '',
                                   customerType: cust?.customerType || 'New',
                                   guestGstin: cust?.gstin || '',
                                   companyName: cust?.companyName || '',
                                   roomIds: [alloc.roomId],
                                   employeeId: alloc.employeeId || '',
                                   checkIn: alloc.checkIn?.slice(0, 16) || '',
                                   checkOut: alloc.checkOut?.slice(0, 16) || '',
                                   advanceAmount: alloc.advanceAmount || 0,
                                   paymentType: alloc.paymentType || 'Cash',
                                   narration: alloc.narration || '',
                                   registrationNumber: alloc.registrationNumber || '',
                                   externalBookingId: alloc.externalBookingId || '',
                                   bookingPlatform: alloc.bookingPlatform || 'Counter',
                                   numberOfGuests: alloc.numberOfGuests || 1,
                                   stayDuration: alloc.stayDuration || 1,
                                   existingCustomerId: alloc.customerId,
                                   hsnSacNumber: alloc.hsnSacNumber || '',
                                   gstRate: alloc.gstRate || '0',
                                   roomSelections: alloc.roomSelections || [
                                     {
                                       roomId: alloc.roomId,
                                       roomType: rooms.find(r => String(r.id) === String(alloc.roomId))?.type || '',
                                       numberOfGuests: alloc.numberOfGuests || 1,
                                       stayDuration: alloc.stayDuration || 1,
                                       bookingPlatform: alloc.bookingPlatform || 'Counter',
                                       basePrice: alloc.basePrice || ''
                                     }
                                   ]
                                });
                                setShowCheckInModal(true);
                             }}
                             className="p-1.5 bg-white text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-100 rounded-lg transition-all shadow-sm"
                             title="Edit Booking"
                           >
                              <Edit3 size={16} />
                           </button>

                           {statusTab === 'Live' ? (
                              <button 
                                 onClick={() => handleCheckOut(alloc.id)}
                                className="p-1.5 bg-white text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-100 rounded-lg transition-all shadow-sm"
                                title="Check Out Guest"
                              >
                                 <LogOut size={16} />
                              </button>
                           ) : (
                              <button 
                                onClick={() => handleDeleteAllocation(alloc.id)}
                                className="p-1.5 bg-white text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-100 rounded-lg transition-all shadow-sm"
                                title="Delete Record"
                              >
                                 <Trash2 size={16} />
                              </button>
                           )}
                        </div>
                     </td>
                   </tr>
                 ))}
                 {filteredAllocations.length === 0 && (
                   <tr>
                     <td colSpan="8" className="py-20 text-center text-gray-400">
                        <div className="flex flex-col items-center justify-center">
                           <Search size={32} className="mb-3 opacity-20" />
                           <p className="text-sm font-medium">No bookings found matching your criteria.</p>
                        </div>
                     </td>
                   </tr>
                 )}
              </tbody>
           </table>
         </div>
      </div>
      )}

      {(() => {
        if (!showCheckInModal && !isAddBookingPage) return null;
        const content = (
            <div className={`bg-white w-full h-full flex flex-col overflow-hidden ${isAddBookingPage ? '' : 'animate-slide-up relative my-0'}`}>
               {/* Header - Only show in modal mode, not on add booking page */}
               {!isAddBookingPage && (
                  <div className="px-6 py-4 flex justify-between items-center shrink-0 bg-indigo-600 text-white">
                     <div>
                       <h2 className="text-xl font-bold tracking-tight text-white">{editingAllocation ? 'Update Booking' : 'New Booking'}</h2>
                       <p className="text-indigo-100 text-xs opacity-80 mt-1">Guest check-in & room allocation</p>
                     </div>
                     <button onClick={resetForm} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all text-white">
                        Close
                     </button>
                  </div>
               )}
               
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <form id="checkin-form" onSubmit={handleCheckInSubmit} className="">
                          
                           {/* Form Header - Only show on standalone page to avoid double headers in modal */}
                           {isAddBookingPage && (
                              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-8 py-6 flex justify-between items-start">
                                  <div>
                                      <h2 className="text-2xl font-bold text-white">{editingAllocation ? 'Update Booking' : 'Booking Information'}</h2>
                                      <p className="text-indigo-100 text-sm mt-1">Please fill in all required fields.</p>
                                  </div>
                                  <button 
                                      type="button"
                                      onClick={() => navigate('/')} 
                                      className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white transition-colors"
                                      title="Close"
                                  >
                                      <X size={24} />
                                  </button>
                              </div>
                           )}

                          {/* Form Body */}
                          <div className="flex-1 overflow-y-auto p-8 space-y-8">
                              
                              {/* Section 1: Guest Information */}
                              <div className="space-y-5">
                                  <div className="flex items-center gap-3 pb-3 border-b-2 border-indigo-100">
                                      <div className="p-2 bg-indigo-100 rounded-lg">
                                          <User size={20} className="text-indigo-600" />
                                      </div>
                                      <h3 className="text-lg font-bold text-gray-900">Customer Information</h3>
                                  </div>

                                  {/* Row 1: Register Number, Customer Name */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Registration Number</label>
                                         <input type="text" name="registrationNumber" value={formData.registrationNumber} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Reg No" />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name <span className="text-red-500">*</span></label>
                                         <div className="relative">
                                             <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                             <input type="text" name="guestName" value={formData.guestName} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Full Name (e.g. John Doe)" required />
                                         </div>
                                      </div>
                                  </div>

                                  {/* Row 2: Address (Full Width) */}
                                  <div>
                                     <label className="block text-sm font-semibold text-gray-700 mb-2">Address <span className="text-red-500">*</span></label>
                                     <textarea name="guestAddress" value={formData.guestAddress} onChange={handleChange} rows="3" className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all resize-none" placeholder="Address" required></textarea>
                                  </div>

                                  {/* Row 3: Company Name, Contact Number */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Company Name</label>
                                         <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Company (Optional)" />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Number <span className="text-red-500">*</span></label>
                                         <div className="relative">
                                             <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                             <input type="tel" name="guestPhone" value={formData.guestPhone} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="9876543210" required />
                                         </div>
                                      </div>
                                  </div>

                                  {/* Row 4: GSTIN, ID Proof Type */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN / UIN Number</label>
                                         <input type="text" name="guestGstin" value={formData.guestGstin} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="GSTIN (Optional)" />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">ID Proof Type <span className="text-red-500">*</span></label>
                                         <select name="guestIdProofType" value={formData.guestIdProofType} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" required>
                                            <option value="">Select ID Type</option>
                                            <option value="Aadhar Card">Aadhar Card</option>
                                            <option value="Voter ID">Voter ID</option>
                                            <option value="PAN Card">PAN Card</option>
                                            <option value="Driving License">Driving License</option>
                                            <option value="Passport">Passport</option>
                                            <option value="Other">Other</option>
                                         </select>
                                      </div>
                                  </div>

                                  {/* Row 5: ID Number */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Enter ID Proof Number <span className="text-red-500">*</span></label>
                                         <input 
                                           type="text" 
                                           name="guestIdNumber" 
                                           value={formData.guestIdNumber} 
                                           onChange={handleChange} 
                                           disabled={!formData.guestIdProofType}
                                           className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100" 
                                           placeholder={formData.guestIdProofType ? `Enter ${formData.guestIdProofType}` : "Select ID Type first"} 
                                           required 
                                         />
                                      </div>
                                  </div>
                              </div>

                              {/* Section 2: Stay Details */}
                              <div className="space-y-6">
                                  <div className="flex items-center justify-between pb-3 border-b-2 border-emerald-100">
                                      <div className="flex items-center gap-3">
                                         <div className="p-2 bg-emerald-100 rounded-lg">
                                             <BedDouble size={20} className="text-emerald-600" />
                                         </div>
                                         <h3 className="text-lg font-bold text-gray-900">Stay Details</h3>
                                      </div>
                                  </div>


                                  {/* Row 1: Arrival & Departure */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Arrival Date<span className="text-red-500">*</span></label>
                                         <input 
                                            type={focusedFields.checkIn ? "datetime-local" : "text"}
                                            name="checkIn" 
                                            value={focusedFields.checkIn ? formData.checkIn : (formData.checkIn ? formatBillDate(formData.checkIn) : '')} 
                                            onChange={handleChange}
                                            onFocus={() => setFocusedFields(prev => ({ ...prev, checkIn: true }))}
                                            onBlur={() => setFocusedFields(prev => ({ ...prev, checkIn: false }))}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" 
                                            placeholder="Select Arrival Date"
                                         />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Departure Date <span className="text-red-500">*</span></label>
                                         <input 
                                            type={focusedFields.checkOut ? "datetime-local" : "text"}
                                            name="checkOut" 
                                            value={focusedFields.checkOut ? formData.checkOut : (formData.checkOut ? formatBillDate(formData.checkOut) : '')} 
                                            onChange={handleChange}
                                            onFocus={() => setFocusedFields(prev => ({ ...prev, checkOut: true }))}
                                            onBlur={() => setFocusedFields(prev => ({ ...prev, checkOut: false }))}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" 
                                            placeholder="Select Departure Date"
                                         />
                                      </div>
                                  </div>


                                  {/* Rows Table Header */}
                                  <div className="overflow-x-auto custom-scrollbar pb-2">
                                     <div className="min-w-[1000px]">
                                        <div className="grid grid-cols-12 gap-4 mb-3 px-3 py-2 bg-gray-50/50 rounded-lg border border-gray-100">
                                           <div className="col-span-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Room Type</div>
                                           <div className="col-span-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Room No</div>
                                           <div className="col-span-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Booking Type</div>
                                           <div className="col-span-1 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Persons</div>
                                           <div className="col-span-1 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Days</div>
                                           <div className="col-span-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Price / Day</div>
                                           <div className="col-span-1 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Total</div>
                                           <div className="col-span-1"></div>
                                        </div>

                                        <div className="space-y-3">
                                           {formData.roomSelections.map((selection, idx) => (
                                              <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group">
                                                 
                                                 {/* Room Type */}
                                                 <div className="col-span-2">
                                                    <div className="relative">
                                                       <select 
                                                          value={selection.roomType} 
                                                          onChange={(e) => updateRoomSelection(idx, 'roomType', e.target.value)}
                                                          className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer transition-all"
                                                       >
                                                          <option value="">Select Room Type</option>
                                                          <option value="AC">AC</option>
                                                          <option value="Non-AC">Non-AC</option>
                                                       </select>
                                                       <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                    </div>
                                                 </div>

                                                 {/* Room Select */}
                                                 <div className="col-span-2">
                                                    <div className="relative">
                                                       <select 
                                                          value={selection.roomId} 
                                                          onChange={(e) => updateRoomSelection(idx, 'roomId', e.target.value)}
                                                          className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer transition-all"
                                                       >
                                                          <option value="">Select Room</option>
                                                          {selection.roomId && rooms.find(r => r.id === selection.roomId) && (
                                                             <option value={selection.roomId}>
                                                                {rooms.find(r => r.id === selection.roomId).roomNumber}
                                                             </option>
                                                          )}
                                                          {getAvailableRoomsForRow(idx).filter(r => r.id !== selection.roomId).map(r => (
                                                             <option key={r.id} value={r.id}>{r.roomNumber}</option>
                                                          ))}
                                                       </select>
                                                       <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                    </div>
                                                 </div>

                                                 {/* Booking Type */}
                                                 <div className="col-span-2">
                                                    <div className="relative">
                                                         <select 
                                                            value={selection.bookingPlatform} 
                                                            onChange={(e) => {
                                                               if (e.target.value === '__ADD_NEW__') {
                                                                  setShowAddSourceModal(true);
                                                               } else {
                                                                  updateRoomSelection(idx, 'bookingPlatform', e.target.value);
                                                               }
                                                            }}
                                                            className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer transition-all"
                                                         >
                                                            {bookingSources.map(source => (
                                                               <option key={source} value={source}>{source}</option>
                                                            ))}
                                                            <option value="__ADD_NEW__" className="text-indigo-600 font-bold">+ Add New Source</option>
                                                         </select>
                                                         <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                      </div>
                                                 </div>

                                                 {/* Number of Persons */}
                                                 <div className="col-span-1">
                                                    <input 
                                                       type="number" 
                                                       min="1"
                                                       value={selection.numberOfGuests} 
                                                       onChange={(e) => {
                                                          const val = e.target.value;
                                                          updateRoomSelection(idx, 'numberOfGuests', val === '' ? '' : parseInt(val));
                                                       }}
                                                       onBlur={(e) => {
                                                          const val = parseInt(e.target.value);
                                                          if (!val || val < 1) updateRoomSelection(idx, 'numberOfGuests', 1);
                                                       }}
                                                       className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-center focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none no-spinners transition-all"
                                                       placeholder="Guests"
                                                    />
                                                 </div>

                                                 {/* Number of Days */}
                                                 <div className="col-span-1">
                                                    <input 
                                                       type="number" 
                                                       min="1"
                                                       value={selection.stayDuration} 
                                                       onChange={(e) => {
                                                          const val = e.target.value;
                                                          updateRoomSelection(idx, 'stayDuration', val === '' ? '' : parseInt(val));
                                                       }}
                                                       onBlur={(e) => {
                                                          const val = parseInt(e.target.value);
                                                          if (!val || val < 1) updateRoomSelection(idx, 'stayDuration', 1);
                                                       }}
                                                       className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-center focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none no-spinners transition-all"
                                                       placeholder="Days"
                                                    />
                                                 </div>

                                                 {/* Price / Day Input */}
                                                 <div className="col-span-2 relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">₹</span>
                                                    <input 
                                                       type="number" 
                                                       min="0"
                                                       value={selection.basePrice} 
                                                       onChange={(e) => updateRoomSelection(idx, 'basePrice', Math.max(0, parseInt(e.target.value) || 0))}
                                                       className="w-full pl-6 pr-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 no-spinners transition-all"
                                                       placeholder="Price"
                                                    />
                                                 </div>

                                                 {/* Line Total */}
                                                 <div className="col-span-1 text-right">
                                                    <p className="text-sm font-black text-indigo-600 truncate">
                                                       ₹{( (parseFloat(selection.basePrice) || 0) * (parseInt(selection.stayDuration) || 1) ).toLocaleString('en-IN')}
                                                    </p>
                                                 </div>

                                                 {/* Actions */}
                                                 <div className="col-span-1 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                       type="button" 
                                                       onClick={() => removeRoomSelection(idx)}
                                                       className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                       title="Remove Room"
                                                    >
                                                       <Trash2 size={18} />
                                                    </button>
                                                 </div>
                                              </div>
                                           ))}

                                           {/* Add Room Button Area */}
                                           <div className="pt-3">
                                              <button 
                                                 type="button" 
                                                 onClick={addRoomSelection}
                                                 className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                                              >
                                                 <Plus size={18} />
                                                 Add Another Room
                                              </button>
                                           </div>
                                        </div>
                                     </div>
                                  </div>

                                  {/* Secondary Info Rows (Original fields) */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Booking Done By (Staff) <span className="text-red-500">*</span></label>
                                         <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" required>
                                            <option value="">Select Staff</option>
                                            {employees.filter(e => e.status !== 'Inactive' || e.id === formData.employeeId).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                         </select>
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Primary Booking Ref ID</label>
                                         <input type="text" name="externalBookingId" value={formData.externalBookingId} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Optional identifier" />
                                      </div>

                                  </div>
                              </div>

                              {/* Section 3: Billing & Payment */}
                              <div className="space-y-5">
                                  <div className="flex items-center gap-3 pb-3 border-b-2 border-green-100">
                                      <div className="p-2 bg-green-100 rounded-lg">
                                          <FileText size={20} className="text-green-600" />
                                      </div>
                                      <h3 className="text-lg font-bold text-gray-900">Billing & Payment</h3>
                                  </div>
                                  
                                  <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 rounded-xl space-y-5 border border-gray-200">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          <div>
                                              <label className="block text-sm font-semibold text-gray-700 mb-2">Primary GST % (Statutory)</label>
                                              <select name="gstRate" value={formData.gstRate} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all">
                                                 <option value="0">0%</option>
                                                 <option value="5">5%</option>
                                                 <option value="12">12%</option>
                                                 <option value="18">18%</option>
                                                 <option value="28">28%</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-sm font-semibold text-gray-700 mb-2">HSN/SAC Number</label>
                                              <input type="text" name="hsnSacNumber" value={formData.hsnSacNumber} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="HSN/SAC Code (Optional)" />
                                          </div>
                                      </div>

                                      {/* Total Amount Display */}
                                      <div className="flex justify-between items-center text-xs pt-3 pb-3 border-t border-b border-gray-200">
                                        <span className="text-sm font-semibold text-gray-700">Total Amount</span>
                                         <span className="font-black text-indigo-600 text-base">
                                            ₹{((() => {
                                               const gst = parseFloat(formData.gstRate) || 0;
                                               const totalRoomPrice = formData.roomSelections.reduce((sum, s) => {
                                                  return sum + ((parseFloat(s.basePrice) || 0) * (parseInt(s.stayDuration) || 1));
                                               }, 0);
                                               return totalRoomPrice * (1 + gst/100);
                                            })()).toLocaleString('en-IN')}
                                         </span>
                                     </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                                          <label className="text-sm font-semibold text-gray-700">Advance Amount</label>
                                          <div className="relative">
                                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-base font-bold">₹</span>
                                              <input 
                                                 type="number" 
                                                 name="advanceAmount" 
                                                 value={formData.advanceAmount} 
                                                 onChange={handleChange} 
                                                 className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-base font-bold" 
                                                 placeholder="0.00" 
                                              />
                                          </div>
                                      </div>

                                      <div className="flex justify-between items-center text-xs pt-3 border-t border-gray-200">
                                         <span className="text-sm font-semibold text-gray-700">Remaining Amount</span>
                                          <span className="font-black text-rose-600 text-base">
                                             ₹{((() => {
                                                const gst = parseFloat(formData.gstRate) || 0;
                                                const totalRoomPriceInclusive = formData.roomSelections.reduce((sum, s) => {
                                                   return sum + ((parseFloat(s.basePrice) || 0) * (parseInt(s.stayDuration) || 1));
                                                }, 0) * (1 + gst/100);
                                                return totalRoomPriceInclusive - (parseFloat(formData.advanceAmount) || 0);
                                             })()).toLocaleString('en-IN')}
                                          </span>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-3 border-t border-gray-200">
                                          <label className="text-sm font-semibold text-gray-700">Payment Type</label>
                                          <div className="relative">
                                              <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                              <select 
                                                 name="paymentType" 
                                                 value={formData.paymentType} 
                                                 onChange={handleChange} 
                                                 className="w-full pl-12 pr-10 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all appearance-none cursor-pointer" 
                                              >
                                                 <option value="Cash">Cash Payment</option>
                                                 <option value="Bank Deposit">Bank Deposit</option>
                                                 <option value="UPI">UPI</option>
                                                 <option value="Card">Card Payment</option>
                                              </select>
                                              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                          </div>
                                      </div>
                                  </div>

                                  {/* Narration */}
                                  <div>
                                      <label className="block text-sm font-semibold text-gray-700 mb-2">Narration / Notes</label>
                                      <textarea 
                                         name="narration" 
                                         value={formData.narration} 
                                         onChange={handleChange} 
                                         rows="3" 
                                         className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all resize-none" 
                                         placeholder="Enter additional details or special requirements..."
                                      ></textarea>
                                  </div>
                              </div>

                          </div>

                          {/* Form Footer - Submit Button */}
                          <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
                             <button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 flex justify-center items-center gap-3 text-base"
                             >
                                {isSubmitting ? (
                                   <>
                                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                      Processing...
                                   </>
                                ) : editingAllocation ? (
                                   <>
                                      <CheckCircle size={20} />
                                      Update Booking
                                   </>
                                ) : (
                                   <>
                                      <CheckCircle size={20} />
                                      Confirm Check-In
                                   </>
                                )}
                             </button>
                          </div>
                      </form>
                </div>
            </div>
         );

         if (isAddBookingPage) {
            return <div className="flex-1 h-full rounded-xl border border-gray-200 shadow-sm overflow-hidden">{content}</div>;
         }
         return createPortal(<div className="fixed inset-0 z-[60] bg-white animate-fade-in">{content}</div>, document.body);
      })()}

      {/* View Booking Details Drawer */}
      {viewingAllocation && createPortal(
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setViewingAllocation(null)} />
            
            <div className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in">
               {/* Header */}
               <div className="px-8 py-6 bg-gradient-to-r from-indigo-700 to-indigo-600 text-white flex justify-between items-center shrink-0">
                  <div>
                     <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-black tracking-tight">Booking Details</h2>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${viewingAllocation.status === 'Active' ? 'bg-emerald-400 text-emerald-900' : 'bg-gray-200 text-gray-800'}`}>
                           {viewingAllocation.status}
                        </span>
                     </div>
                     <p className="text-indigo-100 text-sm font-medium opacity-80">Reference ID: #{viewingAllocation.id.slice(0,8).toUpperCase()}</p>
                  </div>
                   <div className="flex items-center gap-2">
                      <button 
                         onClick={() => handlePrintBill(viewingAllocation)}
                         className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
                         title="Print Bill"
                      >
                         <Printer size={20} />
                      </button>
                      <button 
                         onClick={() => handlePrintBill(viewingAllocation, 'download')}
                         className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
                         title="Download PDF"
                      >
                         <Download size={20} />
                      </button>
                      <button onClick={() => setViewingAllocation(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
                   </div>
               </div>
               
               {/* Content - Desktop Grid */}
               <div className="flex-1 p-0">
                  <div className="p-5 flex flex-col gap-4">
                     
                     {/* Row 1: Guest & ID (Compact) */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-100/50 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                                 <User size={20} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-black text-gray-900 truncate">{getCustomerName(viewingAllocation.customerId)}</h3>
                                <p className="text-xs font-bold text-gray-500 flex items-center gap-2">
                                    <Phone size={10} /> {customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.phone || 'N/A'}
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">ID Proof</p>
                            <p className="text-xs font-bold text-gray-800 truncate">{customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.idProof || 'Not Provided'}</p>
                            {customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.companyName && (
                                <p className="text-[10px] font-bold text-gray-700 truncate mt-0.5">{customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.companyName}</p>
                            )}
                            {customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.gstin && (
                                <p className="text-[10px] font-bold text-indigo-600 truncate mt-0.5">GST: {customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.gstin}</p>
                            )}
                            <p className="text-[10px] font-medium text-gray-400 truncate mt-0.5">{customers.find(c => String(c.id) === String(viewingAllocation.customerId))?.address || 'N/A'}</p>
                        </div>
                     </div>

                     {/* Row 2: Stay Information (Ultra Compact) */}
                     <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                           <Clock size={12} className="text-indigo-500" />
                           <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Stay Details</span>
                        </div>
                        <div className="p-3 grid grid-cols-2 sm:grid-cols-6 gap-3">
                           <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Room(s)</p>
                              <p className="text-sm font-black text-gray-900">
                                 {viewingAllocation.roomSelections 
                                    ? viewingAllocation.roomSelections.map(s => getRoomNumber(s.roomId)).join(', ') 
                                    : getRoomNumber(viewingAllocation.roomId)}
                              </p>
                           </div>
                           <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Guests</p>
                              <p className="text-sm font-black text-gray-900">{viewingAllocation.numberOfGuests || 1}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Staff</p>
                              <p className="text-xs font-bold text-gray-800 truncate" title={getEmployeeName(viewingAllocation.employeeId)}>{getEmployeeName(viewingAllocation.employeeId).split(' ')[0]}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Source</p>
                              <p className="text-xs font-bold text-gray-800 truncate">{viewingAllocation.bookingPlatform || 'Counter'}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase">Check-In</p>
                              <p className="text-xs font-bold text-gray-800">{(() => {
                                 const d = new Date(viewingAllocation.checkIn);
                                 return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                              })()}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-rose-600 font-bold uppercase">Check-Out</p>
                              <p className="text-xs font-bold text-gray-800">{(() => {
                                 const d = viewingAllocation.actualCheckOut ? new Date(viewingAllocation.actualCheckOut) : new Date(viewingAllocation.checkOut);
                                 return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                              })()}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Reg Type/No</p>
                              <p className="text-xs font-bold text-gray-800 truncate">{viewingAllocation.registrationNumber || '---'}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Booking ID</p>
                              <p className="text-xs font-bold text-gray-800 truncate">{viewingAllocation.externalBookingId || '---'}</p>
                           </div>
                        </div>
                     </div>
                     
                     {/* Row 3: Financials (Compact Table) */}
                     <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                           <CreditCard size={12} className="text-indigo-500" />
                           <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Billing</span>
                        </div>
                        <table className="w-full text-xs text-left">
                            <tbody className="divide-y divide-gray-100">
                                <tr>
                                    <td className="px-4 py-2 font-bold text-gray-600">Total Amount</td>
                                    <td className="px-4 py-2 text-right font-bold text-gray-900">₹{(Number(viewingAllocation.price) || 0).toLocaleString('en-IN')}</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 font-bold text-gray-600">Advance</td>
                                    <td className="px-4 py-2 text-right font-bold text-emerald-600">- ₹{(Number(viewingAllocation.advanceAmount) || 0).toLocaleString('en-IN')}</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 font-bold text-gray-600">Payment Type</td>
                                    <td className="px-4 py-2 text-right font-bold text-indigo-600">{viewingAllocation.paymentType || 'Cash'}</td>
                                </tr>
                                <tr className="bg-gray-50/50">
                                    <td className="px-4 py-2 font-black text-gray-800">Balance Due</td>
                                    <td className="px-4 py-2 text-right font-black text-base text-rose-600">₹{(Number(viewingAllocation.remainingAmount) || (Number(viewingAllocation.price) - Number(viewingAllocation.advanceAmount)) || 0).toLocaleString('en-IN')}</td>
                                </tr>
                            </tbody>
                        </table>
                     </div>



                  </div>
               </div>

               
               {/* Footer Removed */}
            </div>
         </div>,
         document.body
      )}

      {showRoomSelector && createPortal(
         <div className="fixed inset-0 z-[60] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
               <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                  <h3 className="text-xl font-bold">Select Available Rooms</h3>
                  <button onClick={() => setShowRoomSelector(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
               </div>
               <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                     {availableRooms.map(r => {
                        const isSelected = formData.roomIds.includes(r.id);
                        return (
                           <button key={r.id} type="button" onClick={() => setFormData(prev => ({ ...prev, roomIds: isSelected ? prev.roomIds.filter(id => id !== r.id) : [...prev.roomIds, r.id] }))} className={`p-4 rounded-2xl border transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-gray-50 border-gray-100 text-gray-700 hover:border-indigo-200'}`}>
                              <span className="text-sm font-black block">{r.roomNumber}</span>
                              <span className="text-[8px] font-bold uppercase opacity-60">{r.type}</span>
                           </button>
                        );
                     })}
                  </div>
               </div>
               <div className="p-6 bg-gray-50 border-t flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-500">{formData.roomIds.length} rooms selected</span>
                  <button onClick={() => setShowRoomSelector(false)} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-black">Done</button>
               </div>
            </div>
         </div>,
         document.body
      )}

      {/* Add Booking Source Modal */}
      {showAddSourceModal && createPortal(
         <div className="fixed inset-0 z-[70] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
               <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
                  <h3 className="text-lg font-bold">Add Booking Source</h3>
                  <button onClick={() => { setShowAddSourceModal(false); setNewSourceName(''); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
               </div>
               <div className="p-6">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Source Name</label>
                  <input 
                     type="text" 
                     value={newSourceName}
                     onChange={(e) => setNewSourceName(e.target.value)}
                     onKeyPress={(e) => e.key === 'Enter' && handleAddBookingSource()}
                     placeholder="e.g., Airbnb, OYO, Direct"
                     className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold transition-all"
                     autoFocus
                  />
               </div>
               <div className="p-5 bg-gray-50 border-t flex justify-end gap-3">
                  <button 
                     onClick={() => { setShowAddSourceModal(false); setNewSourceName(''); }} 
                     className="px-5 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-50 transition-all"
                  >
                     Cancel
                  </button>
                  <button 
                     onClick={handleAddBookingSource}
                     className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-all"
                  >
                     Add Source
                  </button>
               </div>
            </div>
         </div>,
         document.body
      )}
    </div>
  );
};

export default Allocations;

