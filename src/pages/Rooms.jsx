import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Search,  BedDouble, PieChart, CheckCircle2, Edit3, Trash2, Shield, Filter, X, User, ChevronDown } from 'lucide-react';

const Rooms = () => {
  const { rooms, setRooms, allocations, customers } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [selectedRoom, setSelectedRoom] = useState(null);
  
  const [formData, setFormData] = useState({
    roomNumber: '',
    type: 'AC',
    status: 'Available'
  });
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Statistics
  const stats = useMemo(() => {
    const total = rooms.length;
    const booked = rooms.filter(r => r.status === 'Booked').length;
    const available = total - booked;
    const occupancy = total > 0 ? Math.round((booked / total) * 100) : 0;
    return { total, booked, available, occupancy };
  }, [rooms]);

  const getActiveAllocation = (roomId) => {
    return allocations.find(a => a.roomId === roomId && (!a.checkOut || new Date(a.checkOut) >= new Date()));
  };

  const getGuestName = (customerId) => {
    const cust = customers.find(c => c.id === customerId);
    return cust ? cust.name.split(' ')[0] : 'Guest';
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData({ roomNumber: '', type: 'AC', status: 'Available' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // --- Validation ---
    if (!formData.roomNumber.trim()) {
        alert("Room Number is required.");
        return;
    }

    // Check for duplicate Room Number
    const isDuplicate = rooms.some(r => 
        r.roomNumber.toString().trim().toLowerCase() === formData.roomNumber.toString().trim().toLowerCase() && 
        r.id !== editingId
    );

    if (isDuplicate) {
        alert("Room Number already exists! Please use a different number.");
        return;
    }

    // ------------------

    setIsSubmitting(true);
    try {
      if (editingId) {
        const roomRef = doc(db, "rooms", editingId);
        await updateDoc(roomRef, formData);
        setRooms(prev => prev.map(room => room.id === editingId ? { ...room, ...formData } : room));
      } else {
        const roomsCollection = collection(db, "rooms");
        await addDoc(roomsCollection, formData);
      }
      setSuccessMsg(editingId ? 'Room updated successfully!' : 'Room added successfully!');
      setTimeout(() => resetForm(), 500); // Slight delay to show success on form? No, better close form and show global toast.
      resetForm();
    } catch (error) {
      console.error("Firestore operation failed:", error);
      alert("Operation failed. Please try again.");
    }
    setIsSubmitting(false);
  };

  const handleEditRoom = (e, room) => {
    e.stopPropagation();
    setFormData({
      roomNumber: room.roomNumber,
      type: room.type,
      status: room.status
    });
    setEditingId(room.id);
    setShowForm(true);
  };

  const handleDeleteRoom = async (e, roomId) => {
    e.stopPropagation();
    if(window.confirm('Are you sure you want to delete this room?')) {
       try {
         const roomRef = doc(db, "rooms", roomId);
         await deleteDoc(roomRef);
         setRooms(prev => prev.filter(r => r.id !== roomId));
       } catch (error) {
         console.error("Delete failed:", error);
         setRooms(prev => prev.filter(r => r.id !== roomId)); // Optimistic delete
       }
    }
  };



  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.roomNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || room.status === statusFilter;
    const matchesType = typeFilter === 'All' || room.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  }).sort((a,b) => a.roomNumber.localeCompare(b.roomNumber, undefined, {numeric: true}));

  return (
    <div className="flex flex-col space-y-4 pb-8">
      
      {/* Top Section (Fixed) */}
      <div className="flex-none space-y-3">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Room Operations</h1>
             <p className="text-gray-500 text-sm mt-1">Manage inventory, prices, and maintenance statuses</p>
          </div>
          <div className="flex items-center gap-2">
              <button 
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all"
              >
                <Plus size={16} /> Add Room
              </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
           <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-blue-100 text-xs font-black uppercase tracking-wider">Total Rooms</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.total}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <BedDouble size={24} className="text-white" />
               </div>
           </div>
           
           <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">Available Rooms</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.available}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <CheckCircle2 size={24} className="text-white" />
               </div>
           </div>
           
           <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-rose-100 text-xs font-black uppercase tracking-wider">Booked Rooms</p>
                  <div className="flex items-baseline gap-2 mt-1">
                     <span className="text-3xl font-black text-white">{stats.booked}</span>
                     <span className="text-xs text-rose-100 font-bold opacity-80">/ {stats.total}</span>
                  </div>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <PieChart size={24} className="text-white" />
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
                placeholder="Search by room number..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-indigo-500 rounded-lg text-sm font-medium outline-none transition-all" 
              />
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
                {/* Status Filter */}
                <div className="relative w-full lg:w-40">
                   <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                   <select 
                     value={statusFilter}
                     onChange={(e) => setStatusFilter(e.target.value)}
                     className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer appearance-none transition-all"
                   >
                     <option value="All">All Status</option>
                     <option value="Available">Available</option>
                     <option value="Booked">Booked</option>
                   </select>
                   <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown size={14} />
                   </div>
                </div>

                {/* Type Filter */}
                <div className="relative w-full lg:w-40">
                   <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                   <select 
                     value={typeFilter}
                     onChange={(e) => setTypeFilter(e.target.value)}
                     className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer appearance-none transition-all"
                   >
                     <option value="All">All Types</option>
                     <option value="AC">AC</option>
                     <option value="Non-AC">Non-AC</option>
                   </select>
                   <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown size={14} />
                   </div>
                </div>
            </div>
        </div>
      </div>

      {/* Room Inventory Grid (Static) */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
         <div>
              {(() => {
                 const groups = filteredRooms.reduce((acc, room) => {
                    const key = getFloorLabel(room.roomNumber);
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(room);
                    return acc;
                 }, {});

                 const floorOrder = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Fourth Floor'];
                 const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
                    const idxA = floorOrder.indexOf(a);
                    const idxB = floorOrder.indexOf(b);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return a.localeCompare(b);  
                 });
                 
                 if (sortedGroups.length === 0) {
                     return (
                         <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Search size={32} className="mb-2 opacity-20" />
                            <p className="text-sm font-medium">No rooms found.</p>
                         </div>
                     );
                 }

                 return sortedGroups.map(([floor, floorRooms]) => (
                    <div key={floor} className="mb-8 last:mb-0">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 sticky top-0 bg-white z-10 py-1">
                         <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                         {floor}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {floorRooms.map((room) => {
                           const isAvailable = room.status === 'Available';
         
                           return (
                             <div 
                               key={room.id} 
                               onClick={() => setSelectedRoom(room)}
                               className={`group cursor-pointer rounded-lg w-12 h-12 transition-all hover:scale-110 shadow-sm flex flex-col items-center justify-center border ${
                                  isAvailable 
                                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-100' 
                                    : 'bg-rose-500 border-rose-600 text-white shadow-rose-100'
                               }`}
                             >
                                <h3 className="text-xs font-black leading-none">{room.roomNumber}</h3>
                             </div>
                           );
                        })}
                      </div>
                    </div>
                 ));
              })()}
         </div>
      </div>

      {/* Add/Edit Room Modal */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
           {/* Card Container */}
           <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-slide-up transform transition-all">
             
             {/* Header */}
             <div className="bg-indigo-600 p-5 text-white flex justify-between items-center shrink-0">
               <div>
                 <h2 className="text-lg font-bold">{editingId ? 'Edit Room' : 'New Room'}</h2>
                 <p className="text-indigo-200 text-xs mt-0.5">{editingId ? 'Update details' : 'Add to inventory'}</p>
               </div>
               <button onClick={resetForm} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all">
                  <X size={18} />
               </button>
             </div>
            
            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="space-y-5">
                 <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Room Number</label>
                    <div className="relative">
                       <input 
                         type="text" 
                         name="roomNumber" 
                         value={formData.roomNumber} 
                         onChange={handleChange} 
                         className="w-full pl-4 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg text-gray-800 transition-all placeholder:text-gray-300" 
                         placeholder="101" 
                         autoFocus
                         required 
                       />
                       <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
                          <BedDouble size={20} />
                       </div>
                    </div>
                 </div>
                 
                 <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Room Type</label>
                    <div className="grid grid-cols-2 gap-3">
                       <label className={`cursor-pointer group relative overflow-hidden rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 transition-all ${formData.type === 'AC' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200 hover:bg-gray-100'}`}>
                          <input type="radio" name="type" value="AC" checked={formData.type === 'AC'} onChange={handleChange} className="hidden" />
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${formData.type === 'AC' ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                              <span className="font-black text-xs">AC</span>
                          </span>
                          <span className="text-xs font-bold">Air Conditioned</span>
                          {formData.type === 'AC' && <div className="absolute inset-0 border-2 border-indigo-500 rounded-xl pointer-events-none" />}
                       </label>
                       
                       <label className={`cursor-pointer group relative overflow-hidden rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 transition-all ${formData.type === 'Non-AC' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200 hover:bg-gray-100'}`}>
                          <input type="radio" name="type" value="Non-AC" checked={formData.type === 'Non-AC'} onChange={handleChange} className="hidden" />
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${formData.type === 'Non-AC' ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                              <span className="font-black text-xs">NA</span>
                          </span>
                          <span className="text-xs font-bold">Non-AC</span>
                          {formData.type === 'Non-AC' && <div className="absolute inset-0 border-2 border-indigo-500 rounded-xl pointer-events-none" />}
                       </label>
                    </div>
                 </div>
              </div>

              <div className="pt-2">
                 <button 
                   type="submit" 
                   disabled={isSubmitting} 
                   className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-70 flex justify-center items-center gap-2"
                 >
                   {isSubmitting ? 'Saving...' : (
                     <span className="flex items-center gap-2">
                       {editingId ? <Edit3 size={18} /> : <Plus size={18} />}
                       <span>{editingId ? 'Update Room' : 'Create Room'}</span>
                     </span>
                   )}
                 </button>
              </div>
            </form>
           </div>
        </div>,
        document.body
      )}

      {/* Room Details Modal - Styled like Ad Card */}
      {selectedRoom && createPortal(
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
             
             {/* Card Container */ }
             <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-slide-up transform transition-all">
                
                {/* Header */}
                <div className="bg-indigo-600 p-5 text-white flex justify-between items-center shrink-0">
                   <div>
                      <h2 className="text-lg font-bold">Room {selectedRoom.roomNumber}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-indigo-200 text-xs">Room Details</span>
                      </div>
                   </div>
                   <button onClick={() => setSelectedRoom(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                   
                   {/* Status & Type Badges */}
                   <div className="flex gap-3">
                       <div className={`flex-1 rounded-xl p-3 border-2 flex flex-col items-center justify-center gap-1 ${selectedRoom.type === 'AC' ? 'border-indigo-100 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Type</span>
                          <span className="font-bold text-sm">{selectedRoom.type}</span>
                       </div>
                       <div className={`flex-1 rounded-xl p-3 border-2 flex flex-col items-center justify-center gap-1 ${selectedRoom.status === 'Available' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Status</span>
                          <span className="font-bold text-sm">{selectedRoom.status}</span>
                       </div>
                   </div>

                   {/* Occupancy Details (If Booked) */}
                   {selectedRoom.status === 'Booked' && (() => {
                      const activeAlloc = getActiveAllocation(selectedRoom.id);
                      return activeAlloc ? (
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-3">
                             <div className="flex items-center gap-3 border-b border-rose-200/50 pb-3">
                                <div className="bg-rose-200 p-2 rounded-full text-rose-700">
                                   <User size={16} />
                                </div>
                                <div>
                                   <p className="text-[10px] uppercase font-bold text-rose-400">Guest</p>
                                   <p className="font-bold text-rose-900 text-sm">{getGuestName(activeAlloc.customerId)}</p>
                                </div>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                   <p className="text-rose-400 font-bold mb-0.5">Check In</p>
                                   <p className="text-rose-800 font-medium">{(() => {
                                      const d = new Date(activeAlloc.checkIn);
                                      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                                   })()}</p>
                                </div>
                                <div>
                                   <p className="text-rose-400 font-bold mb-0.5">Check Out</p>
                                   <p className="text-rose-800 font-medium">{(() => {
                                      const d = new Date(activeAlloc.checkOut);
                                      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                                   })()}</p>
                                </div>
                             </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-400 text-xs italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                           Checking allocation details...
                        </div>
                      );
                   })()}

                </div>

                {/* Footer Buttons */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button 
                         onClick={(e) => { 
                             const roomToEdit = selectedRoom;
                             setSelectedRoom(null); 
                             handleEditRoom(e, roomToEdit); 
                         }}
                         className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all text-sm flex justify-center items-center gap-2"
                      >
                         <Edit3 size={16} /> Edit
                    </button>
                    <button 
                        onClick={(e) => {
                            const roomId = selectedRoom.id; 
                            setSelectedRoom(null); 
                            handleDeleteRoom(e, roomId); 
                        }} 
                        className="flex-1 py-3 bg-white border border-gray-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 font-bold rounded-xl transition-all shadow-sm text-sm flex justify-center items-center gap-2"
                    >
                       <Trash2 size={16} /> Delete
                    </button>
                </div>

             </div>
         </div>,
         document.body
      )}

      {/* Success Toast */}
      {successMsg && createPortal(
        <div className="fixed top-6 right-6 z-[100] animate-slide-in-down">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
             <div className="bg-white/20 p-2 rounded-full">
               <CheckCircle2 size={24} />
             </div>
             <div>
               <h4 className="font-bold text-sm">Success</h4>
               <p className="text-emerald-100 text-xs">{successMsg}</p>
             </div>
             <button onClick={() => setSuccessMsg('')} className="ml-2 text-emerald-200 hover:text-white"><X size={18} /></button>
          </div>
        </div>,
        document.body
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideInDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-in-down {
          animation: slideInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default Rooms;
