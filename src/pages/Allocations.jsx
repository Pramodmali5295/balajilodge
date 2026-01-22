import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'; 
import { CalendarPlus, User, BedDouble, CheckCircle, Clock, Phone, FileText, Search, Users, Trash2, X, Plus, Eye, Edit3, LogOut, CreditCard } from 'lucide-react';

const Allocations = () => {
  const { rooms, employees, customers, allocations } = useAppContext();
  // --- Check-In / Allocation State ---
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  const [formData, setFormData] = useState({
    guestName: '',
    guestPhone: '',
    guestIdProofType: 'Aadhar Card',
    guestIdNumber: '',
    guestAddress: '',
    customerType: 'New',
    roomIds: [],
    checkIn: new Date().toISOString().slice(0, 16),
    checkOut: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    numberOfGuests: 1,
    employeeId: '',
    stayDuration: 1,
    bookingPlatform: 'Counter',
    advanceAmount: 0,
    paymentType: 'Cash',
    narration: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRoomType, setSelectedRoomType] = useState('');
  const categoryRef = useRef(null);
  const [allocationSearch, setAllocationSearch] = useState('');
  const [statusTab, setStatusTab] = useState('Live');
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
  const getCustomerName = (id) => customers.find(c => String(c.id) === String(id))?.name || 'Unknown';
  const getRoomNumber = (id) => rooms.find(r => String(r.id) === String(id))?.roomNumber || 'Unknown';
  const getRoomType = (id) => rooms.find(r => String(r.id) === String(id))?.type || 'Unknown';
  const getEmployeeName = (id) => employees.find(e => String(e.id) === String(id))?.name || 'Unknown';
  
  const getAssignedStaffForRoom = (roomNum) => {
    return employees.find(emp => emp.assignedRooms && emp.assignedRooms.includes(roomNum));
  };

  const getFloorLabel = (roomNum) => {
    const num = parseInt(roomNum);
    if (isNaN(num)) return 'Other';
    const series = Math.floor(num / 100);
    switch(series) {
      case 1: return 'Ground Floor';
      case 2: return 'First Floor';
      case 3: return 'Second Floor';
      case 4: return 'Third Floor';
      case 5: return 'Fourth Floor';
      default: return `${series}00 Series`;
    }
  };

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
    const availableCount = rooms.filter(r => {
       const isNotBooked = r.status !== 'Booked';
       const hasActiveAllocation = allocations.some(a => String(a.roomId) === String(r.id) && (a.status === 'Active' || !a.status));
       return isNotBooked && !hasActiveAllocation;
    }).length;
    return { activeCount, availableCount };
  }, [allocations, rooms]);

  const filteredAllocations = useMemo(() => {
    return allocations.filter(alloc => {
      const custName = getCustomerName(alloc.customerId).toLowerCase();
      const roomNum = getRoomNumber(alloc.roomId).toLowerCase();
      const search = allocationSearch.toLowerCase();
      
      const matchesSearch = custName.includes(search) || roomNum.includes(search);
      const matchesTab = statusTab === 'Live' ? (alloc.status === 'Active' || !alloc.status) : (alloc.status === 'Checked-Out');
      

      
      return matchesSearch && matchesTab;
    }).sort((a, b) => new Date(b.checkIn || 0) - new Date(a.checkIn || 0));
  }, [allocations, allocationSearch, statusTab, customers, rooms]);

  // --- Handlers ---
  const handleChange = (e) => {
    let { name, value } = e.target;

    // Sanitization
    if (name === 'guestPhone') {
        value = value.replace(/\D/g, '').slice(0, 10);
    } else if (name === 'guestName') {
        value = value.replace(/[^a-zA-Z\s.'-]/g, '');
    }

    setFormData(prev => {
       const newData = { ...prev, [name]: value };
       
       // Auto-lookup for returning guests
       if (name === 'guestPhone') {
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
                   newData.guestType = 'Returning';
                   newData.existingCustomerId = existing.id;
               } else if (prev.existingCustomerId) {
                   // Input is long enough but no match found -> Reset if previously matched
                   newData.existingCustomerId = null;
                   newData.guestType = 'New';
               }
           } else if (prev.existingCustomerId) {
               // Input became too short -> Reset match
               newData.existingCustomerId = null;
               newData.guestType = 'New';
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
      guestType: 'New',
      numberOfGuests: 1,
      roomIds: [],
      employeeId: '',
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
      paymentType: 'Cash',
      existingCustomerId: null
    });
    setShowCheckInModal(false);
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
              customerType: formData.guestType,
              visitHistory: newVisits,
              lastVisit: new Date().toISOString()
          });
      } else {
          // Create New Customer
          const customerData = {
              name: formData.guestName,
              phone: formData.guestPhone,
              idProof: `${formData.guestIdProofType} - ${formData.guestIdNumber}`,
              address: formData.guestAddress,
              customerType: formData.guestType,
              visitHistory: 1,
              createdAt: new Date().toISOString()
          };
          
          const customersCollection = collection(db, "customers");
          const custDocRef = await addDoc(customersCollection, customerData);
          customerId = custDocRef.id;
      }
      
      const newCustomerId = customerId;

      const allocationsCollection = collection(db, "allocations");
      
      if (editingAllocation) {
          // Update Existing Allocation
          const roomId = formData.roomIds[0]; // Assuming single room edit for now based on UI
          const room = rooms.find(r => r.id === roomId);
          const basePrice = room?.basePrice || room?.price || '0';
          const finalPrice = room?.price || basePrice;
          
          const advanceVal = parseFloat(formData.advanceAmount || 0);
          const remainingVal = Number(finalPrice || 0) - advanceVal;

          await updateDoc(doc(db, "allocations", editingAllocation.id), {
             customerId: newCustomerId,
             roomId: roomId,
             employeeId: formData.employeeId,
             checkIn: formData.checkIn,
             checkOut: formData.checkOut,
             numberOfGuests: parseInt(formData.numberOfGuests, 10) || 1,
             advanceAmount: advanceVal,
             remainingAmount: remainingVal,
             paymentType: formData.paymentType || 'Cash',
             narration: formData.narration || '',
             bookingPlatform: formData.bookingPlatform || 'Counter',
             stayDuration: parseInt(formData.stayDuration) || 1
             // Price and basePrice usually shouldn't change on simple edit unless room changes, 
             // but keeping them consistent with current room state if needed or preserving original could be better. 
             // For now, updating them to match current room potentially selected.
          });
          
          setEditingAllocation(null);
      } else {
          // Create New Allocation(s)
          // Use standard for loop to track index for advance amount assignment
          for (let i = 0; i < formData.roomIds.length; i++) {
             const roomId = formData.roomIds[i];
             const room = rooms.find(r => r.id === roomId);
             const basePrice = room?.basePrice || room?.price || '0';
             const gstRate = room?.gstRate || 0;
             // Calculate final price if not present (backward compatibility) or use saved price
             const finalPrice = room?.price || basePrice;
             const advanceVal = i === 0 ? parseFloat(formData.advanceAmount || 0) : 0;
             const remainingVal = Number(finalPrice || 0) - advanceVal;

             await addDoc(allocationsCollection, {
                customerId: newCustomerId,
                roomId: roomId,
                employeeId: formData.employeeId,
                checkIn: formData.checkIn,
                checkOut: formData.checkOut,
                numberOfGuests: parseInt(formData.numberOfGuests, 10) || 1,
                // Snapshot pricing for billing history
                basePrice: basePrice,
                gstRate: gstRate,
                price: finalPrice,
                status: 'Active',
                advanceAmount: advanceVal,
                remainingAmount: remainingVal,
                paymentType: formData.paymentType || 'Cash',
                narration: formData.narration || '',
                bookingPlatform: formData.bookingPlatform || 'Counter',
                stayDuration: parseInt(formData.stayDuration) || 1
             });
             const roomRef = doc(db, "rooms", roomId);
             await updateDoc(roomRef, { status: "Booked" });
          }
      }
      
      setFormData({
         guestName: '', guestPhone: '', guestIdProofType: '', guestIdNumber: '', guestAddress: '', guestType: 'New',
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
      setShowCheckInModal(false);
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

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-2">
      
      {/* Top Section (Fixed) */}
      <div className="flex-none space-y-3">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Front Desk</h1>
             <p className="text-gray-500 text-sm mt-1">Manage guest check-ins, allocations, and history</p>
          </div>
          <div className="flex items-center gap-2">
              <button 
                onClick={() => { resetForm(); setShowCheckInModal(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all"
              >
                <CalendarPlus size={16} /> New Booking
              </button>
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
           
           <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">Available Rooms</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.availableCount}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <CheckCircle size={24} className="text-white" />
               </div>
           </div>
           
           <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-amber-100 text-xs font-black uppercase tracking-wider">Duty Staff</p>
                  <div className="flex items-baseline gap-2 mt-1">
                     <span className="text-3xl font-black text-white">{employees.length}</span>
                     <span className="text-xs text-amber-100 font-bold opacity-80">Active</span>
                  </div>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Users size={24} className="text-white" />
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
            </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
         <div className="overflow-y-auto flex-1 custom-scrollbar">
           <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10 text-gray-400 text-[10px] uppercase tracking-wider font-bold">
                 <tr>
                    <th className="px-6 py-4 text-center">#</th>
                    <th className="px-6 py-4">Room No</th>
                    <th className="px-6 py-4">Guest Name</th>
                    <th className="px-6 py-4">Duration</th>
                    <th className="px-6 py-4">Duty Staff</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                 {filteredAllocations.map((alloc, index) => (
                   <tr key={alloc.id} className="group hover:bg-gray-50/80 transition-all">
                     <td className="px-6 py-4 text-center">
                        <span className="text-xs font-bold text-gray-400">{(index + 1).toString().padStart(2, '0')}</span>
                     </td>
                     <td className="px-6 py-4">
                        <span className="inline-flex items-center justify-center min-w-[3rem] text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                           {getRoomNumber(alloc.roomId)}
                        </span>
                     </td>
                     <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900">{getCustomerName(alloc.customerId)}</span>
                            <span className="text-[10px] text-gray-400 font-medium">Guest</span>
                        </div>
                     </td>
                     <td className="px-6 py-4">
                        <div className="space-y-1">
                           <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 w-fit">
                              In: {formatDate(alloc.checkIn)}
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 w-fit">
                              Out: {formatDate(alloc.actualCheckOut || alloc.checkOut) || '---'}
                           </div>
                        </div>
                     </td>
                     <td className="px-6 py-4">
                        <span className="text-xs font-semibold text-gray-700">{getEmployeeName(alloc.employeeId)}</span>
                     </td>
                     <td className="px-6 py-4 text-center">
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
                     <td className="px-6 py-4 text-center">
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
                                   guestType: cust?.customerType || 'New',
                                   roomIds: [alloc.roomId],
                                   employeeId: alloc.employeeId || '',
                                   checkIn: alloc.checkIn?.slice(0, 16) || '',
                                   checkOut: alloc.checkOut?.slice(0, 16) || '',
                                   advanceAmount: alloc.advanceAmount || 0,
                                   paymentType: alloc.paymentType || 'Cash',
                                   narration: alloc.narration || '',
                                   bookingPlatform: alloc.bookingPlatform || 'Counter',
                                   numberOfGuests: alloc.numberOfGuests || 1,
                                   stayDuration: alloc.stayDuration || 1,
                                   existingCustomerId: alloc.customerId
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
                     <td colSpan="7" className="py-20 text-center text-gray-400">
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

      {/* Check-In Drawer */}
      {showCheckInModal && createPortal(
         <div className="fixed inset-0 z-[60] md:left-64 bg-white animate-fade-in">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden animate-slide-up relative my-0">
               {/* Header */}
               <div className="px-6 py-4 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">New Booking</h2>
                     <p className="text-indigo-100 text-xs opacity-80 mt-1">Guest check-in & room allocation</p>
                  </div>
                  <button onClick={resetForm} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all text-white">
                     Close
                  </button>
               </div>
               
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                   <div className="pt-2">
                      <form id="checkin-form" onSubmit={handleCheckInSubmit} className="space-y-4">
                          
                          <div className="bg-white p-6 rounded-2xl border border-gray-200/60 shadow-sm space-y-6">
                              
                              {/* Section: Guest Information */}
                              <div className="space-y-4">
                                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                      <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><User size={16} /></span>
                                      <h3 className="text-sm font-bold text-gray-900">Guest Information</h3>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                      <div className="col-span-2 sm:col-span-1">
                                         <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Mobile Number</label>
                                         <div className="relative">
                                             <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                             <input type="tel" name="guestPhone" value={formData.guestPhone} onChange={handleChange} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-bold transition-all" placeholder="9876543210" required />
                                         </div>
                                      </div>
                                      <div className="col-span-2 sm:col-span-1">
                                         <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Guest Name</label>
                                         <div className="relative">
                                             <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                             <input type="text" name="guestName" value={formData.guestName} onChange={handleChange} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-bold transition-all" placeholder="Full Name" required />
                                         </div>
                                      </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                      <div className="col-span-2 sm:col-span-1">
                                         <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">ID Proof Type</label>
                                         <select name="guestIdProofType" value={formData.guestIdProofType} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all" required>
                                            <option value="">Select ID Type</option>
                                            <option value="Aadhar Card">Aadhar Card</option>
                                            <option value="Voter ID">Voter ID</option>
                                            <option value="PAN Card">PAN Card</option>
                                            <option value="Driving License">Driving License</option>
                                            <option value="Passport">Passport</option>
                                            <option value="Other">Other</option>
                                         </select>
                                      </div>
                                      <div className="col-span-2 sm:col-span-1">
                                         <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">ID Number</label>
                                         <input type="text" name="guestIdNumber" value={formData.guestIdNumber} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-bold transition-all" placeholder="ID Number" required />
                                      </div>
                                  </div>
                                  
                                  <div>
                                     <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Address</label>
                                     <textarea name="guestAddress" value={formData.guestAddress} onChange={handleChange} rows="2" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-medium transition-all resize-none" placeholder="Address"></textarea>
                                  </div>
                              </div>

                              <hr className="border-gray-100" />
                              
                              {/* Section: Stay Allocations */}
                              <div className="space-y-4">
                                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                      <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><BedDouble size={16} /></span>
                                      <h3 className="text-sm font-bold text-gray-900">Stay Details</h3>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                     <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Room Type</label>
                                        <select 
                                           value={selectedRoomType} 
                                           onChange={(e) => { setSelectedRoomType(e.target.value); setFormData(prev => ({...prev, roomIds: []})); }} 
                                           className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all"
                                        >
                                           <option value="">Select Room Type</option>
                                           {['AC', 'Non-AC'].map(type => <option key={type} value={type}>{type}</option>)}
                                        </select>
                                     </div>
                                     <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Select Rooms</label>
                                        <button type="button" onClick={() => setShowRoomSelector(true)} className="w-full px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-xs transition-all flex items-center justify-between group">
                                           <span>{formData.roomIds.length === 0 ? 'Pick Rooms' : `${formData.roomIds.length} Selected`}</span>
                                           <Plus size={14} className="group-hover:scale-110 transition-transform" />
                                        </button>
                                     </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                      <div className="col-span-2 sm:col-span-1">
                                         <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Booking Source</label>
                                         <div className="flex gap-2">
                                            <select 
                                               name="bookingPlatform" 
                                               value={formData.bookingPlatform} 
                                               onChange={handleChange} 
                                               className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all" 
                                               required
                                            >
                                               {bookingSources.map(source => (
                                                  <option key={source} value={source}>{source}</option>
                                               ))}
                                            </select>
                                            <button
                                               type="button"
                                               onClick={() => setShowAddSourceModal(true)}
                                               className="px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-xs transition-all flex items-center gap-1"
                                               title="Add New Source"
                                            >
                                               <Plus size={14} />
                                            </button>
                                         </div>
                                      </div>
                                      <div className="col-span-2 sm:col-span-1">
                                         <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Duration (Days)</label>
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
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all" 
                                            required 
                                         />
                                      </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Check In</label>
                                        <input type="datetime-local" name="checkIn" value={formData.checkIn} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-[10px] font-bold transition-all" required />
                                     </div>
                                     <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Expected Out</label>
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
                                           className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-[10px] font-bold transition-all" 
                                           required 
                                        />
                                     </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">No. of Guests</label>
                                        <input type="number" name="numberOfGuests" value={formData.numberOfGuests} onChange={handleChange} min="1" max="10" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all" placeholder="1" required />
                                     </div>
                                     <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Booking By</label>
                                        <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all" required>
                                           <option value="">Select Staff</option>
                                           {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                     </div>
                                  </div>
                              </div>
                              
                              <hr className="border-gray-100" />

                              {/* Billing & Narration Section */}
                              <div className="space-y-4">
                                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                      <span className="p-1.5 bg-green-50 text-green-600 rounded-lg"><FileText size={16} /></span>
                                      <h3 className="text-sm font-bold text-gray-900">Billing & Info</h3>
                                  </div>
                                  
                                  <div className="bg-gray-50 p-4 rounded-xl space-y-3 border border-gray-100">
                                      <div className="flex justify-between items-center text-xs">
                                         <span className="font-bold text-gray-500 uppercase">Total Base Price</span>
                                         <span className="font-black text-gray-900 text-sm">
                                            ₹{formData.roomIds.reduce((sum, id) => {
                                               const room = rooms.find(r => r.id === id);
                                               return sum + (Number(room?.price || room?.basePrice || 0) || 0);
                                            }, 0).toLocaleString('en-IN')}
                                         </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4 items-center">
                                          <label className="text-[11px] font-bold text-gray-600 uppercase">Advance Payment</label>
                                          <div className="relative">
                                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">₹</span>
                                              <input 
                                                 type="number" 
                                                 name="advanceAmount" 
                                                 value={formData.advanceAmount} 
                                                 onChange={handleChange} 
                                                 className="w-full pl-7 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold" 
                                                 placeholder="0.00" 
                                              />
                                          </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4 items-center">
                                          <label className="text-[11px] font-bold text-gray-600 uppercase">Payment Type</label>
                                          <div className="relative">
                                              <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                              <select 
                                                 name="paymentType" 
                                                 value={formData.paymentType} 
                                                 onChange={handleChange} 
                                                 className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold appearance-none" 
                                                 required
                                              >
                                                 <option value="Cash">Cash Payment</option>
                                                 <option value="Bank Deposit">Bank Deposit</option>
                                                 <option value="UPI">UPI</option>
                                                 <option value="Card">Card Payment</option>
                                              </select>
                                          </div>
                                      </div>
                                      <div className="flex justify-between items-center text-xs pt-3 border-t border-gray-200">
                                         <span className="font-bold text-gray-600 uppercase">Remaining Balance</span>
                                         <span className="font-black text-rose-600 text-base">
                                            ₹{(formData.roomIds.reduce((sum, id) => {
                                               const room = rooms.find(r => r.id === id);
                                               return sum + (Number(room?.price || room?.basePrice || 0) || 0);
                                            }, 0) - (parseFloat(formData.advanceAmount) || 0)).toLocaleString('en-IN')}
                                         </span>
                                      </div>
                                  </div>

                                  <div>
                                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Narration / Notes</label>
                                      <textarea 
                                         name="narration" 
                                         value={formData.narration} 
                                         onChange={handleChange} 
                                         rows="2" 
                                         className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold transition-all resize-none" 
                                         placeholder="Enter additional details..."
                                      ></textarea>
                                  </div>
                              </div>
                              
                               {formData.roomIds.length > 0 && (
                                  <div className="flex justify-end pt-2">
                                     <div className="text-right">
                                         <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Net Total</p>
                                         <p className="text-lg font-black text-indigo-600">
                                            ₹{formData.roomIds.reduce((sum, id) => {
                                               const room = rooms.find(r => r.id === id);
                                               return sum + (Number(room?.price || room?.basePrice || 0) || 0);
                                            }, 0).toLocaleString('en-IN')}
                                         </p>
                                     </div>
                                  </div>
                               )}
                          </div>

                          <div className="pt-2 sticky bottom-0 bg-white pb-2 z-10">
                             <button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 flex justify-center items-center gap-2 text-sm"
                             >
                                {isSubmitting ? 'Processing...' : editingAllocation ? <><CheckCircle size={18} /> Update Booking</> : <><CheckCircle size={18} /> Confirm Check-In</>}
                             </button>
                          </div>
                      </form>
                   </div>
                </div>
            </div>
         </div>,
         document.body
      )}

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
                  <button onClick={() => setViewingAllocation(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
               </div>
               
               {/* Content - Desktop Grid */}
               <div className="flex-1 p-0">
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
