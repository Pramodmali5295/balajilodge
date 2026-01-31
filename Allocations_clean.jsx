import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore'; 
import { CalendarPlus, User, BedDouble, CheckCircle, Clock, Phone, FileText, Search, Users, Trash2, X, Plus, Eye, Edit3, LogOut, CreditCard, Printer, UserCheck, Layers } from 'lucide-react';

const Allocations = () => { // Multi-room test
  const { rooms, employees, customers, allocations } = useAppContext();
  // --- Check-In / Allocation State ---
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  const [formData, setFormData] = useState({
    guestName: '',
    guestPhone: '',
    guestIdProofType: 'PAN Card',
    guestIdNumber: '',
    guestAddress: '',
    customerType: 'New',
    roomIds: [],
    checkIn: (() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    })(),
    checkOut: '',
    numberOfGuests: 1, // test replacement
    employeeId: '',
    stayDuration: 1,
    bookingPlatform: 'Counter',
    advanceAmount: 0,
    paymentType: 'Cash',
    narration: '',
    guestGstin: '',
    companyName: '',
    registrationNumber: '',
    externalBookingId: '',
    basePrice: '',
    gstRate: '12',
    hsnSacNumber: '',
    roomSelections: [
      {
        roomId: '',
        numberOfGuests: 1,
        stayDuration: 1,
        bookingPlatform: 'Counter',
        roomType: '',
        basePrice: ''
      }
    ]
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRoomType, setSelectedRoomType] = useState('');
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
        guestName: '', guestPhone: '', guestIdProofType: 'PAN Card', guestIdNumber: '', guestAddress: '',
        customerType: 'New', roomIds: [], employeeId: '', bookingPlatform: 'Counter',
        advanceAmount: 0, paymentType: 'Cash', narration: '', guestGstin: '', companyName: '',
        registrationNumber: '', externalBookingId: '', existingCustomerId: null,
        basePrice: '', gstRate: '12', hsnSacNumber: ''
      }));
    }
  }, [location.pathname]);

  const [viewingAllocation, setViewingAllocation] = useState(null);
  const [editingAllocation, setEditingAllocation] = useState(null);
  
  // Booking Sources State
  // Booking Sources State - Synced with DB
  const [bookingSources, setBookingSources] = useState([]);

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


  // Helpers
  const getCustomerName = useCallback((id) => customers.find(c => String(c.id) === String(id))?.name || 'Unknown', [customers]);
  const getRoomNumber = useCallback((id) => rooms.find(r => String(r.id) === String(id))?.roomNumber || 'Unknown', [rooms]);
  const getEmployeeName = (id) => employees.find(e => String(e.id) === String(id))?.name || 'Unknown';

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Filter available rooms
  const availableRooms = rooms.filter(r => {
    const isNotBooked = r.status !== 'Booked';
    const hasActiveAllocation = allocations.some(a => String(a.roomId) === String(r.id) && (a.status === 'Active' || !a.status));
    const typeMatches = selectedRoomType === 'All' || !selectedRoomType || r.type === selectedRoomType;
    return isNotBooked && !hasActiveAllocation && typeMatches;
  });

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
      const roomNum = getRoomNumber(alloc.roomId).toLowerCase();
      const regNo = (alloc.registrationNumber || '').toLowerCase();
      const bookId = (alloc.externalBookingId || '').toLowerCase();
      const search = allocationSearch.toLowerCase();
      
      const matchesSearch = custName.includes(search) || roomNum.includes(search) || regNo.includes(search) || bookId.includes(search);
      // Live tab: Show Active bookings (or bookings without status for backward compatibility)
      // History tab: Show ONLY Checked-Out bookings
      const matchesTab = statusTab === 'Live' 
        ? (alloc.status === 'Active' || alloc.status === undefined || alloc.status === null || alloc.status === '') 
        : (alloc.status === 'Checked-Out');
      

      
      return matchesSearch && matchesTab;
    }).sort((a, b) => new Date(b.checkIn || 0) - new Date(a.checkIn || 0));
  }, [allocations, allocationSearch, statusTab, getCustomerName, getRoomNumber]);

  // --- Handlers ---
  const handleChange = (e) => {
    let { name, value } = e.target;

    // Sanitization
    if (name === 'guestPhone') {
        value = value.replace(/\D/g, '').slice(0, 10);
    } else if (name === 'guestName') {
        value = value.replace(/[^a-zA-Z\s.'-]/g, '');
    } else if (name === 'guestGstin') {
        value = value.toUpperCase().slice(0, 15);
    } else if (name === 'companyName') {
        value = value.toUpperCase(); // Optional, but usually company names are proper case or specific format. Strict uppercase might be too much, but let's keep it simple or remove if user prefers raw. removing uppercase enforcement to be safe.
    }

    setFormData(prev => {
       const newData = { ...prev, [name]: value };
       
       // Auto-calculate checkout when check-in changes
       if (name === 'checkIn' && value && prev.stayDuration) {
           const checkInDate = new Date(value);
           const days = parseInt(prev.stayDuration) || 1;
           const checkOutDate = new Date(checkInDate.getTime() + days * 24 * 60 * 60 * 1000);
           const year = checkOutDate.getFullYear();
           const month = String(checkOutDate.getMonth() + 1).padStart(2, '0');
           const day = String(checkOutDate.getDate()).padStart(2, '0');
           const hours = String(checkOutDate.getHours()).padStart(2, '0');
           const minutes = String(checkOutDate.getMinutes()).padStart(2, '0');
           newData.checkOut = `${year}-${month}-${day}T${hours}:${minutes}`;
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
      guestIdProofType: 'PAN Card',
      guestIdNumber: '',
      guestAddress: '',
      guestGstin: '',
      companyName: '',
      registrationNumber: '',
      externalBookingId: '',
      customerType: 'New',
      numberOfGuests: 1,
      roomIds: [],
      employeeId: '',
      stayDuration: 1,
      checkIn: (() => {
         const now = new Date();
         const year = now.getFullYear();
         const month = String(now.getMonth() + 1).padStart(2, '0');
         const day = String(now.getDate()).padStart(2, '0');
         const hours = String(now.getHours()).padStart(2, '0');
         const minutes = String(now.getMinutes()).padStart(2, '0');
         return `${year}-${month}-${day}T${hours}:${minutes}`;
      })(),
      checkOut: '',
      paymentType: 'Cash',
      bookingPlatform: 'Counter',
      advanceAmount: 0,
      narration: '',
      existingCustomerId: null,
      basePrice: '',
      gstRate: '12',
      hsnSacNumber: ''
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
        alert("Guest Name must be at least 3 characters.");
        return;
    }
    if (!formData.guestIdNumber.trim()) {
        alert("ID Number is required.");
        return;
    }
    if (formData.guestAddress.trim().length < 5) {
        alert("Please enter a valid, complete address.");
        return;
    }
    if (formData.roomIds.length === 0) {
        alert("Please select at least one room.");
        return;
    }
    if (new Date(formData.checkOut) <= new Date(formData.checkIn)) {
        alert("Check-out time must be AFTER Check-in time.");
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
      
      if (editingAllocation) {
          // Update Existing Allocation (Single update behavior)
          const selection = formData.roomSelections[0];
          const roomId = selection.roomId;
          const basePrice = parseFloat(selection.basePrice) || 0;
          const gstRate = parseFloat(formData.gstRate) || 0;
          const duration = parseInt(selection.stayDuration) || 1;
          const oneDayInclusive = basePrice * (1 + (gstRate / 100));
          const finalPrice = oneDayInclusive * duration;
          
          const advanceVal = parseFloat(formData.advanceAmount || 0);
          const remainingVal = finalPrice - advanceVal;

          await updateDoc(doc(db, "allocations", editingAllocation.id), {
             customerId: newCustomerId,
             roomId: roomId,
             employeeId: formData.employeeId,
             checkIn: formData.checkIn,
             checkOut: formData.checkOut,
             numberOfGuests: parseInt(selection.numberOfGuests, 10) || 1,
             advanceAmount: advanceVal,
             remainingAmount: remainingVal,
             paymentType: formData.paymentType || 'Cash',
             narration: formData.narration || '',
             bookingPlatform: selection.bookingPlatform || 'Counter',
             registrationNumber: formData.registrationNumber || '',
             externalBookingId: formData.externalBookingId || '',
             stayDuration: parseInt(selection.stayDuration) || 1,
             hsnSacNumber: formData.hsnSacNumber || '',
             basePrice: basePrice,
             gstRate: gstRate,
             price: finalPrice
          });
          
          setEditingAllocation(null);
      } else {
          // Create New Allocation(s)
          for (let i = 0; i < formData.roomSelections.length; i++) {
             const selection = formData.roomSelections[i];
             const roomId = selection.roomId;
             if (!roomId) continue;

             const roomBasePrice = parseFloat(selection.basePrice) || 0;
             const gstRate = parseFloat(formData.gstRate) || 0;
             const duration = parseInt(selection.stayDuration) || 1;
             const oneDayInclusive = roomBasePrice * (1 + (gstRate / 100));
             const finalPrice = oneDayInclusive * duration;
             
             // Advance is usually applied only to the first room in a group booking for internal balance, 
             // or split. Here we apply it to the first room to stay consistent.
             const advanceVal = i === 0 ? parseFloat(formData.advanceAmount || 0) : 0;
             const remainingVal = finalPrice - advanceVal;

             await addDoc(allocationsCollection, {
                customerId: newCustomerId,
                roomId: roomId,
                employeeId: formData.employeeId,
                checkIn: formData.checkIn,
                checkOut: formData.checkOut,
                numberOfGuests: parseInt(selection.numberOfGuests, 10) || 1,
                basePrice: roomBasePrice,
                gstRate: gstRate,
                price: finalPrice,
                status: 'Active',
                advanceAmount: advanceVal,
                remainingAmount: remainingVal,
                paymentType: formData.paymentType || 'Cash',
                narration: formData.narration || '',
                bookingPlatform: selection.bookingPlatform || 'Counter',
                registrationNumber: formData.registrationNumber || '',
                externalBookingId: formData.externalBookingId || '',
                stayDuration: parseInt(selection.stayDuration) || 1,
                hsnSacNumber: formData.hsnSacNumber || ''
             });
             const roomRef = doc(db, "rooms", roomId);
             await updateDoc(roomRef, { status: "Booked" });
          }
      }
      
      setFormData({
         guestName: '', guestPhone: '', guestIdProofType: '', guestIdNumber: '', guestAddress: '', guestGstin: '', companyName: '', registrationNumber: '', externalBookingId: '', customerType: 'New',
         roomIds: [], employeeId: '', 
         stayDuration: 1, bookingPlatform: 'Counter', advanceAmount: 0, paymentType: 'Cash', narration: '', 
         checkIn: (() => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            return now.toISOString().slice(0,16);
         })(),
         checkOut: (() => {
            const tmr = new Date(Date.now() + 86400000);
            tmr.setMinutes(tmr.getMinutes() - tmr.getTimezoneOffset());
            return tmr.toISOString().slice(0,16);
         })(),
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

  const handleCheckOut = async (allocationId, roomId) => {
    if(window.confirm("Confirm guest check-out?")) {
        try {
            setIsSubmitting(true);
            await updateDoc(doc(db, "allocations", allocationId), { 
                status: 'Checked-Out',
                actualCheckOut: new Date().toISOString()
            });
            if (roomId) {
               await updateDoc(doc(db, "rooms", roomId), { status: 'Available' });
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

  const handlePrintBill = async (allocation) => {
     const cust = customers.find(c => String(c.id) === String(allocation.customerId));
     const room = rooms.find(r => String(r.id) === String(allocation.roomId));
     const employee = employees.find(e => String(e.id) === String(allocation.employeeId));
     
     // Calculations
     const duration = parseInt(allocation.stayDuration) || 1;
     const totalInclusivePrice = Number(allocation.price) || 0;
     const gstRate = Number(allocation.gstRate || room?.gstRate || 0);
     const basePricePerDay = Number(allocation.basePrice) || (totalInclusivePrice / (1 + (gstRate/100)) / duration) || 0;
     
     const taxableValue = basePricePerDay * duration;
     const totalTax = totalInclusivePrice - taxableValue;
     const cgstAmount = totalTax / 2;
     const sgstAmount = totalTax / 2;
     
     const advanceAmount = Number(allocation.advanceAmount) || 0;

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

     // --- Invoice Generation / Retrieval ---
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

     const printWindow = window.open('', '_blank');
     printWindow.document.write(`
       <html>
         <head>
           <title>Invoice #${invoiceNumber}</title>
           <style>
             @page { size: A4; margin: 15mm; }
             body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #000; font-size: 11px; line-height: 1.3; }
             .invoice-box { width: 100%; margin: auto; }
             
             /* Header Section */
             .header-table { width: 100%; border-bottom: 1px solid #000; margin-bottom: 10px; }
             .company-title { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 2px; }
             .company-address { text-align: center; font-size: 10px; margin-bottom: 5px; }
             
             .meta-grid { width: 100%; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
             .meta-item { display: flex; justify-content: space-between; margin-bottom: 2px; }
             .meta-label { font-weight: bold; }

             /* Customer Section */
             .customer-info { margin-bottom: 15px; }
             .info-row { display: flex; margin-bottom: 2px; }
             .info-label { width: 110px; font-weight: bold; flex-shrink: 0; }
             .info-value { border-bottom: 1px dotted #ccc; flex-grow: 1; }

             /* Table Styles */
             table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
             table, th, td { border: 1px solid #000; }
             th { background-color: #f2f2f2; padding: 5px; text-align: center; font-size: 10px; text-transform: uppercase; }
             td { padding: 4px; vertical-align: middle; }
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
             <div class="company-title">Balaji Lodging INVOICE</div>
             <div class="company-address">
               Opp. Railway Station, Near Shriyash Hospital, Pandharpur 413304.<br>
               Phone : +91 9284793956 / 8080248271<br>
               GSTIN/UIN: 27AAPFB9198M1ZE | Email: balajilodgingpandharpur@gmail.com
             </div>

             <div class="meta-grid">
               <div style="border-right: 1px solid #000; padding-right: 20px;">
                 <div class="meta-item"><span class="meta-label">Arrival Date</span> <span>${formatBillDate(allocation.checkIn)}</span></div>
                 <div class="meta-item"><span class="meta-label">Departure Date</span> <span>${formatBillDate(allocation.checkOut)}</span></div>
               </div>
               <div>
                 <div class="meta-item"><span class="meta-label">Register No.</span> <span>${allocation.registrationNumber || '---'}</span></div>
                 <div class="meta-item"><span class="meta-label">Invoice No.</span> <span style="font-weight:bold;">${invoiceNumber}</span></div>
               </div>
             </div>

             <div class="customer-info shadow-sm">
               <div style="font-weight:bold; text-decoration: underline; margin-bottom: 5px; font-size: 12px;">Customer</div>
               <div class="info-row"><span class="info-label">Name :</span> <span class="info-value" style="font-weight:bold;">${cust?.name || '---'}</span></div>
               <div class="info-row"><span class="info-label">Address :</span> <span class="info-value">${cust?.address || '---'}</span></div>
               <div class="info-row">
                 <span class="info-label">GSTIN/UIN :</span> <span class="info-value" style="width: 250px;">${cust?.gstin || '---'}</span>
                 <span class="info-label" style="width: 60px; margin-left:20px;">PAN :</span> <span class="info-value">${(cust?.idProof?.includes('PAN') ? cust.idProof.split(' - ')[1] : '') || '---'}</span>
               </div>
               <div class="info-row"><span class="info-label">Company Name :</span> <span class="info-value">${cust?.companyName || '---'}</span></div>
               <div class="info-row">
                 <span class="info-label">Booking Done By :</span> <span class="info-value" style="width: 250px;">${employee?.name || '---'}</span>
                 <span class="info-label" style="width: 90px; margin-left:20px;">Contact No. :</span> <span class="info-value">${cust?.phone || '---'}</span>
               </div>
               <div class="info-row"><span class="info-label">Booking ID :</span> <span class="info-value">${allocation.externalBookingId || '0'}</span></div>
             </div>

             <table>
               <thead>
                 <tr>
                   <th style="width: 30px;">No</th>
                   <th>Room Number</th>
                   <th>GST</th>
                   <th>No. of Persons</th>
                   <th>No. Of. Days</th>
                   <th>Booking Type</th>
                   <th>Room Type</th>
                   <th>Rate Per Day</th>
                   <th>Total Amount</th>
                 </tr>
               </thead>
               <tbody>
                 <tr>
                   <td class="text-center">1</td>
                   <td class="text-center">${room?.roomNumber || '---'}</td>
                   <td class="text-center">${gstRate.toFixed(2)}%</td>
                   <td class="text-center">${String(allocation.numberOfGuests).padStart(2, '0')}</td>
                   <td class="text-center">${duration}</td>
                   <td class="text-center">${allocation.bookingPlatform}</td>
                   <td class="text-center">${room?.type || '---'}</td>
                   <td class="text-right">${basePricePerDay.toFixed(2)}</td>
                   <td class="text-right">${taxableValue.toFixed(2)}</td>
                 </tr>
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

             <div style="margin-top: 25px; font-weight:bold; text-decoration: underline; margin-bottom: 5px;">GST Breakdown (HSN Analysis)</div>
             <table class="gst-analysis">
               <thead>
                 <tr>
                   <th rowspan="2">No</th>
                   <th rowspan="2">HSN/SAC</th>
                   <th rowspan="2">Taxable Value</th>
                   <th colspan="2">CGST</th>
                   <th colspan="2">SGST</th>
                   <th rowspan="2">Total Tax</th>
                 </tr>
                 <tr>
                   <th>Rate</th>
                   <th>Amount</th>
                   <th>Rate</th>
                   <th>Amount</th>
                 </tr>
               </thead>
               <tbody>
                 <tr>
                   <td class="text-center">1</td>
                   <td class="text-center">${allocation.hsnSacNumber || '996311'}</td>
                   <td class="text-right">${taxableValue.toFixed(2)}</td>
                   <td class="text-center">${(gstRate / 2).toFixed(2)}%</td>
                   <td class="text-right">${cgstAmount.toFixed(2)}</td>
                   <td class="text-center">${(gstRate / 2).toFixed(2)}%</td>
                   <td class="text-right">${sgstAmount.toFixed(2)}</td>
                   <td class="text-right">${totalTax.toFixed(2)}</td>
                 </tr>
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

             <div class="info-row"><span class="info-label" style="width: 80px;">Pay Details :</span> <span class="info-value" style="font-weight:bold; font-size: 14px; text-decoration: underline;">₹${totalInclusivePrice.toFixed(2)} via ${allocation.paymentType}</span></div>

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
             <div class="computer-gen">This is Computer Generated Invoice</div>
           </div>
         </body>
       </html>
     `);
     printWindow.document.close();
     printWindow.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-2">
      
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
             <p className="text-gray-500 text-sm mt-1">{statusTab === 'Live' ? 'New check-ins & active guests' : 'View past booking history'}</p>
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
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
                <div>
                   <p className="text-indigo-100 text-xs font-black uppercase tracking-wider">Active Bookings</p>
                   <p className="text-3xl font-black text-white mt-1">{stats.activeCount}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                   <BedDouble size={24} className="text-white" />
                </div>
            </div>
            
            <div className={`bg-gradient-to-br ${statusTab === 'History' ? 'from-emerald-500 to-emerald-600' : 'from-emerald-500 to-emerald-600'} p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]`}>
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
            
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
                <div>
                   <p className="text-amber-100 text-xs font-black uppercase tracking-wider">
                      {statusTab === 'History' ? 'Repeat Guests' : 'Duty Staff'}
                   </p>
                   <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-white">
                         {statusTab === 'History' ? stats.repeatedCount : employees.length}
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
                placeholder="Search guest or room..." 
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
                    <th className="px-4 py-3 text-center whitespace-nowrap">#</th>
                    <th className="px-4 py-3 whitespace-nowrap">Room No</th>
                    <th className="px-4 py-3 whitespace-nowrap">Customer Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Reg No</th>
                    <th className="px-4 py-3 whitespace-nowrap">Booking ID</th>
                    <th className="px-4 py-3 whitespace-nowrap">Duration</th>
                    <th className="px-4 py-3 whitespace-nowrap">Duty Staff</th>
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
                     <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center justify-center min-w-[3rem] text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                           {getRoomNumber(alloc.roomId)}
                        </span>
                     </td>
                     <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900">{getCustomerName(alloc.customerId)}</span>
                            <span className="text-[10px] text-gray-400 font-medium">Guest</span>
                        </div>
                     </td>
                     <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-700">{alloc.registrationNumber || '---'}</span>
                     </td>
                     <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-gray-500">{alloc.externalBookingId || '---'}</span>
                     </td>
                     <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                           <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 w-fit">
                              In: {formatDate(alloc.checkIn)}
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 w-fit">
                              Out: {formatDate(alloc.actualCheckOut || alloc.checkOut) || '---'}
                           </div>
                        </div>
                     </td>
                     <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-700">{getEmployeeName(alloc.employeeId)}</span>
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
                                   hsnSacNumber: alloc.hsnSacNumber || ''
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
                                onClick={() => handleCheckOut(alloc.id, alloc.roomId)}
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
                     <td colSpan="9" className="py-20 text-center text-gray-400">
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
                              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-8 py-6">
                                  <h2 className="text-2xl font-bold text-white">{editingAllocation ? 'Update Booking' : 'Booking Information'}</h2>
                                  <p className="text-indigo-100 text-sm mt-1">Please fill in all required fields marked with *</p>
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
                                      <h3 className="text-lg font-bold text-gray-900">Guest Information</h3>
                                  </div>

                                  {/* Row 1: Register Number, Customer Name */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Register No</label>
                                         <input type="text" name="registrationNumber" value={formData.registrationNumber} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Reg. No" />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name</label>
                                         <div className="relative">
                                             <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                             <input type="text" name="guestName" value={formData.guestName} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Full Name (e.g. John Doe)" required />
                                         </div>
                                      </div>
                                  </div>

                                  {/* Row 2: Address (Full Width) */}
                                  <div>
                                     <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                                     <textarea name="guestAddress" value={formData.guestAddress} onChange={handleChange} rows="3" className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all resize-none" placeholder="Address"></textarea>
                                  </div>

                                  {/* Row 3: Company Name, Contact Number */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Company Name</label>
                                         <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Company (Optional)" />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Number</label>
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
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">ID Proof Type</label>
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
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">ID Number</label>
                                         <input type="text" name="guestIdNumber" value={formData.guestIdNumber} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="ID Number" required />
                                      </div>
                                  </div>
                              </div>

                              {/* Section 2: Stay Details */}
                              <div className="space-y-5">
                                  <div className="flex items-center gap-3 pb-3 border-b-2 border-emerald-100">
                                      <div className="p-2 bg-emerald-100 rounded-lg">
                                          <BedDouble size={20} className="text-emerald-600" />
                                      </div>
                                      <h3 className="text-lg font-bold text-gray-900">Stay Details</h3>
                                  </div>

                                  {/* Row 1: Arrival Date, Departure Date */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Arrival Date</label>
                                        <input type="datetime-local" name="checkIn" value={formData.checkIn} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all" required />
                                     </div>
                                     <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Departure Date</label>
                                        <input 
                                           type="datetime-local" 
                                           name="checkOut" 
                                           value={formData.checkOut} 
                                           onChange={(e) => {
                                              const newCheckOut = e.target.value;
                                              const diffTime = Math.abs(new Date(newCheckOut) - new Date(formData.checkIn));
                                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                                              setFormData(prev => ({ ...prev, checkOut: newCheckOut, stayDuration: diffDays || 1 }));
                                           }}
                                           className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" 
                                        />
                                     </div>
                                  </div>

                                  {/* Row 2: Booking Done By, Booking ID */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Booking Done By</label>
                                         <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" required>
                                            <option value="">Select Staff</option>
                                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                         </select>
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Booking ID</label>
                                         <input type="text" name="externalBookingId" value={formData.externalBookingId} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="Optional" />
                                      </div>
                                  </div>

                                  {/* Row 3: Select Rooms, Number of Persons */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Rooms</label>
                                        <select 
                                           value={formData.roomIds[0] || ''} 
                                           onChange={(e) => {
                                              const selectedId = e.target.value;
                                              if (selectedId) {
                                                 // Find the selected room and set its type
                                                 const selectedRoom = rooms.find(r => r.id === selectedId);
                                                 if (selectedRoom) {
                                                    setSelectedRoomType(selectedRoom.type);
                                                 }
                                                 setFormData(prev => ({ ...prev, roomIds: [selectedId] }));
                                              } else {
                                                 setFormData(prev => ({ ...prev, roomIds: [] }));
                                              }
                                           }}
                                           className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all"
                                        >
                                           <option value="">Select a Room</option>
                                           {rooms
                                              .filter(r => {
                                                 // Filter out booked rooms
                                                 const isBooked = r.status === 'Booked';
                                                 const hasActiveAllocation = allocations.some(a => 
                                                    String(a.roomId) === String(r.id) && 
                                                    (a.status === 'Active' || !a.status)
                                                 );
                                                 return !isBooked && !hasActiveAllocation;
                                              })
                                              .map(r => (
                                                 <option key={r.id} value={r.id}>
                                                    {r.roomNumber} - {r.type}
                                                 </option>
                                              ))
                                           }
                                        </select>
                                     </div>
                                     <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Persons</label>
                                        <input type="number" name="numberOfGuests" value={formData.numberOfGuests} onChange={handleChange} min="1" max="10" className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="1" required />
                                     </div>
                                  </div>

                                  {/* Row 4: Number of Days, Booking Type */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Days</label>
                                         <input 
                                            type="number" 
                                            name="stayDuration" 
                                            value={formData.stayDuration} 
                                            onChange={(e) => {
                                               const val = e.target.value;
                                               if (val === '') { setFormData(prev => ({ ...prev, stayDuration: '' })); return; }
                                               const days = parseInt(val) || 0;
                                               if (days < 1) return;
                                               const checkInDate = new Date(formData.checkIn);
                                               const newCheckOut = new Date(checkInDate.getTime() + days * 24 * 60 * 60 * 1000);
                                               const tzOffset = newCheckOut.getTimezoneOffset() * 60000;
                                               setFormData(prev => ({ ...prev, stayDuration: days, checkOut: new Date(newCheckOut.getTime() - tzOffset).toISOString().slice(0, 16) }));
                                            }} 
                                            min="1" 
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" 
                                         />
                                      </div>
                                      <div>
                                         <label className="block text-sm font-semibold text-gray-700 mb-2">Booking Type</label>
                                         <div className="flex gap-2">
                                            <select 
                                               name="bookingPlatform" 
                                               value={formData.bookingPlatform} 
                                               onChange={handleChange} 
                                               className="flex-1 px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" 
                                            >
                                               {bookingSources.map(source => (
                                                  <option key={source} value={source}>{source}</option>
                                               ))}
                                            </select>
                                            <button
                                               type="button"
                                               onClick={() => setShowAddSourceModal(true)}
                                               className="px-4 py-3 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-base transition-all flex items-center gap-2"
                                               title="Add New Source"
                                            >
                                               <Plus size={18} />
                                            </button>
                                         </div>
                                      </div>
                                  </div>

                                  {/* Row 5: Room Type */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Room Type</label>
                                        <select 
                                           value={selectedRoomType} 
                                           onChange={(e) => { setSelectedRoomType(e.target.value); setFormData(prev => ({...prev, roomIds: []})); }} 
                                           className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all"
                                        >
                                           <option value="">Select Room Type</option>
                                           {['AC', 'Non-AC'].map(type => <option key={type} value={type}>{type}</option>)}
                                        </select>
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
                                              <label className="block text-sm font-semibold text-gray-700 mb-2">GST %</label>
                                              <input type="number" name="gstRate" value={formData.gstRate} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all" placeholder="12" />
                                          </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
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
                                                const totalRoomPrice = formData.roomSelections.reduce((sum, sel) => {
                                                   return sum + ((parseFloat(sel.basePrice) || 0) * (parseInt(sel.stayDuration) || 0));
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
                                                const totalRoomPrice = formData.roomSelections.reduce((sum, sel) => {
                                                   return sum + ((parseFloat(sel.basePrice) || 0) * (parseInt(sel.stayDuration) || 0));
                                                }, 0);
                                                const totalInclusive = totalRoomPrice * (1 + gst/100);
                                                return totalInclusive - (parseFloat(formData.advanceAmount) || 0);
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
                                                 className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-base transition-all appearance-none" 
                                              >
                                                 <option value="Cash">Cash Payment</option>
                                                 <option value="Bank Deposit">Bank Deposit</option>
                                                 <option value="UPI">UPI</option>
                                                 <option value="Card">Card Payment</option>
                                              </select>
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
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Room</p>
                              <p className="text-sm font-black text-gray-900">{getRoomNumber(viewingAllocation.roomId)}</p>
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
                              <p className="text-xs font-bold text-gray-800">{formatDate(viewingAllocation.checkIn)}</p>
                           </div>
                           <div>
                              <p className="text-[10px] text-rose-600 font-bold uppercase">Check-Out</p>
                              <p className="text-xs font-bold text-gray-800">{formatDate(viewingAllocation.checkOut)}</p>
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
                                    <td className="px-4 py-2 font-bold text-gray-600">Room Rate</td>
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

                     {viewingAllocation.narration && (
                        <div className="px-3 py-2 bg-amber-50 rounded-lg border border-amber-100 text-[10px] text-amber-900/80">
                           <span className="font-bold text-amber-900 uppercase tracking-wide mr-1">Note:</span>
                           {viewingAllocation.narration}
                        </div>
                     )}

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

