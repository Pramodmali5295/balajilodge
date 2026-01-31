import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Search,  BedDouble, PieChart, CheckCircle2, Edit3, Trash2, Shield, Filter, X, User } from 'lucide-react';

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
    basePrice: '',
    gstRate: 12,
    price: '',
    status: 'Available'
  });
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const updatedData = { ...formData, [name]: value };
    
    // Auto-calculate final price when basePrice or gstRate changes
    if (name === 'basePrice' || name === 'gstRate') {
      const base = parseFloat(name === 'basePrice' ? value : updatedData.basePrice) || 0;
      const gst = parseFloat(name === 'gstRate' ? value : updatedData.gstRate) || 0;
      const gstAmount = (base * gst) / 100;
      updatedData.price = Math.round(base + gstAmount).toString();
    }
    
    setFormData(updatedData);
  };

  const resetForm = () => {
    setFormData({ roomNumber: '', type: 'AC', basePrice: '', gstRate: 12, price: '', status: 'Available' });
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
    if ((parseFloat(formData.price) || 0) <= 0 && (parseFloat(formData.basePrice) || 0) <= 0) {
        alert("Please enter a valid price.");
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
      basePrice: room.basePrice || room.price || '',
      gstRate: room.gstRate || 12,
      price: room.price,
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
                  <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">Available</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.available}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <CheckCircle2 size={24} className="text-white" />
               </div>
           </div>
           
           <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-rose-100 text-xs font-black uppercase tracking-wider">Occupancy</p>
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
        <div className="fixed inset-0 z-50 bg-white animate-fade-in">
          <div className="bg-white w-full h-full flex flex-col overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 p-6 text-white flex justify-between items-center shrink-0">
               <div>
                 <h2 className="text-xl font-bold">{editingId ? 'Edit Room' : 'Add New Room'}</h2>
                 <p className="text-indigo-200 text-sm mt-1">{editingId ? 'Update room details' : 'Enter room details to update inventory'}</p>
               </div>
               <button onClick={resetForm} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold transition-all">
                  Close
               </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6 flex-1 overflow-y-auto">
              <div className="space-y-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-bold text-gray-700 mb-1">Room Number</label>
                       <input type="text" name="roomNumber" value={formData.roomNumber} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-lg transition-all" placeholder="101" required />
                    </div>
                    <div>
                       <label className="block text-sm font-bold text-gray-700 mb-1">Type</label>
                       <select name="type" value={formData.type} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-all appearance-none">
                         <option value="AC">AC</option>
                         <option value="Non-AC">Non-AC</option>
                       </select>
                    </div>
                 </div>


                
              </div>

              <div className="pt-2">
                 <button 
                   type="submit" 
                   disabled={isSubmitting} 
                   className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-70 flex justify-center items-center gap-2"
                 >
                   {isSubmitting ? 'Saving...' : (
                     <span className="flex items-center gap-2">
                       {editingId ? <Edit3 size={20} /> : <Plus size={20} />}
                       <span>{editingId ? 'Update Room' : 'Add Room'}</span>
                     </span>
                   )}
                 </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Room Details Modal - Styled like Allocations */}
      {selectedRoom && createPortal(
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             {/* Backdrop */}
             <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedRoom(null)} />
             
             {/* Modal */}
             <div className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-fade-in-up">
                
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-indigo-700 to-indigo-600 text-white flex justify-between items-center shrink-0">
                   <div>
                      <h2 className="text-2xl font-black tracking-tight">Room {selectedRoom.roomNumber}</h2>
                      <div className="flex items-center gap-2 mt-1">
                          <span className="bg-white/20 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border border-white/20">
                             {selectedRoom.type}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${selectedRoom.status === 'Available' ? 'bg-emerald-400 text-emerald-900 border-white/20' : 'bg-rose-400 text-rose-900 border-white/20'}`}>
                             {selectedRoom.status}
                          </span>
                      </div>
                   </div>
                   <button onClick={() => setSelectedRoom(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                   <div className="p-5 flex flex-col gap-4">
                   
                   {/* Row 1: Allocation Status (If Booked) */}
                   {selectedRoom.status === 'Booked' && (() => {
                      const activeAlloc = getActiveAllocation(selectedRoom.id);
                      return activeAlloc ? (
                        <div className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
                             <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
                             
                             <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center">
                                <div className="flex items-center gap-4">
                                   <div className="p-3 bg-rose-100 text-rose-600 rounded-full shrink-0">
                                      <User size={24} />
                                   </div>
                                   <div>
                                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Occupied By</p>
                                      <p className="text-lg font-black text-gray-800">{getGuestName(activeAlloc.customerId)}</p>
                                   </div>
                                </div>

                                <div className="h-full w-px bg-gray-100 hidden md:block"></div>

                                <div className="flex gap-8">
                                   <div>
                                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check In</p>
                                      <p className="text-sm font-bold text-gray-700">{new Date(activeAlloc.checkIn).toLocaleString()}</p>
                                   </div>
                                   <div>
                                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Expected Out</p>
                                      <p className="text-sm font-bold text-gray-700">{new Date(activeAlloc.checkOut).toLocaleString()}</p>
                                   </div>
                                </div>
                             </div>
                        </div>
                      ) : null;
                   })()}

                    {/* Row 2: Pricing Details */}
                    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 relative overflow-hidden">
                       <BedDouble size={100} className="absolute -right-4 -bottom-4 text-indigo-100 opacity-50 rotate-12" />
                       
                       <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 relative z-10">Rate Configuration</h3>
                       
                       <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-indigo-50">
                               <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Base Price</p>
                               <p className="text-2xl font-black text-gray-900">₹{selectedRoom.basePrice || 0}</p>
                           </div>
                           
                           <div className="p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-indigo-50">
                               <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">GST ({selectedRoom.gstRate}%)</p>
                               <p className="text-2xl font-black text-indigo-500">+ ₹{Math.round((selectedRoom.basePrice || 0) * (selectedRoom.gstRate || 0) / 100)}</p>
                           </div>
                           
                           <div className="p-4 bg-white rounded-xl border-2 border-indigo-100 shadow-sm flex flex-col justify-center">
                               <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-0.5">Total / Night</p>
                               <p className="text-3xl font-black text-indigo-700">₹{selectedRoom.price}</p>
                           </div>
                       </div>
                    </div>


                 </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex gap-4 justify-end">
                    <button 
                         onClick={(e) => { 
                             const roomToEdit = selectedRoom;
                             setSelectedRoom(null); 
                             handleEditRoom(e, roomToEdit); 
                         }}
                         className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                      >
                         <Edit3 size={18} /> Edit Configuration
                    </button>
                    <button 
                        onClick={(e) => {
                            const roomId = selectedRoom.id; 
                            setSelectedRoom(null); 
                            handleDeleteRoom(e, roomId); 
                        }} 
                        className="px-6 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2"
                    >
                       <Trash2 size={18} /> Delete Room
                    </button>
                </div>

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
      `}</style>
    </div>
  );
};

export default Rooms;
