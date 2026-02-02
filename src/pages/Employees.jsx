import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { 
  UserPlus, User, Phone, Shield, Search, Briefcase, X, Plus, 
  CheckCircle2, Edit3, Trash2, Eye, Download, FileText, MapPin, Calendar, CreditCard, ChevronDown 
} from 'lucide-react';

const Employees = () => {
  const { employees, setEmployees, rooms } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [joiningDateFocused, setJoiningDateFocused] = useState(false);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };
  
  const [formData, setFormData] = useState({
    name: '',
    role: 'Room Assistant',
    phone: '',
    idProofType: '',
    aadharNumber: '',
    address: '',
    status: 'Active',
    assignedRooms: [],
    joiningDate: new Date().toISOString().split('T')[0]
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

  const roles = ['Room Assistant'];

  // Stats text
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter(e => e.status !== 'Inactive').length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [employees]);

  // Track rooms assigned to other employees to prevent double assignment
  const takenRoomsMap = useMemo(() => {
    const map = new Map();
    employees.forEach(emp => {
      if (emp.id !== editingId && emp.assignedRooms) {
        emp.assignedRooms.forEach(roomNum => {
          map.set(String(roomNum), emp.name); // Normalize to string
        });
      }
    });
    return map;
  }, [employees, editingId]);

  const handleChange = (e) => {
    let { name, value } = e.target;
    
    // Sanitization & Input Masking
    if (name === 'phone') {
        value = value.replace(/\D/g, '').slice(0, 10);
    } else if (name === 'name') {
        value = value.replace(/[^a-zA-Z\s.'-]/g, '');
    } else if (name === 'aadharNumber') {
        if (formData.idProofType === 'Aadhar') {
             // Aadhar: Digits only, max 12
             value = value.replace(/\D/g, '').slice(0, 12);
        } else if (formData.idProofType === 'PAN') {
             // PAN: Alphanumeric, max 10, uppercase
             value = value.toUpperCase().slice(0, 10);
        }
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({ name: '', role: 'Room Assistant', phone: '', idProofType: '', aadharNumber: '', address: '', status: 'Active', assignedRooms: [], joiningDate: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setShowForm(false);
  };

  const handleRoomToggle = (roomNumber) => {
    setFormData(prev => {
      const assigned = prev.assignedRooms.includes(roomNumber)
        ? prev.assignedRooms.filter(r => r !== roomNumber)
        : [...prev.assignedRooms, roomNumber];
      return { ...prev, assignedRooms: assigned };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // --- Validation ---
    if (!/^[6-9]\d{9}$/.test(formData.phone)) {
        alert("Invalid Phone number. Format: 10 digits.");
        return;
    }
    // Conditional ID Validation (Only if provided)
    if (formData.idProofType && formData.aadharNumber.trim()) {
        const idType = formData.idProofType;
        const idNum = formData.aadharNumber.trim().toUpperCase();

        if (idType === 'Aadhar' && !/^\d{12}$/.test(idNum)) {
             alert("Aadhar Number must be exactly 12 digits.");
             return;
        }
        if (idType === 'PAN' && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(idNum)) {
             alert("Invalid PAN Card Number format.");
             return;
        }
    }
    if (formData.name.trim().length < 3) {
        alert("Name must be at least 3 characters.");
        return;
    }
    // ------------------

    setIsSubmitting(true);
    
    // Auto-clear assigned rooms if status is Inactive
    let submissionData = { ...formData };
    if (submissionData.status === 'Inactive') {
        submissionData.assignedRooms = [];
    }

    try {
      const selectedRooms = submissionData.assignedRooms || [];
      
      // 1. Find other employees who currently have these rooms
      const otherEmpsWithRooms = employees.filter(emp => 
        emp.id !== editingId && 
        emp.assignedRooms && 
        emp.assignedRooms.some(r => selectedRooms.includes(r))
      );

      // 2. Remove these rooms from those employees in Firestore
      for (const otherEmp of otherEmpsWithRooms) {
        const updatedRooms = otherEmp.assignedRooms.filter(r => !selectedRooms.includes(r));
        const otherEmpRef = doc(db, "employees", otherEmp.id);
        await updateDoc(otherEmpRef, { assignedRooms: updatedRooms });
      }

      // 3. Save the current employee
      if (editingId) {
        const employeeRef = doc(db, "employees", editingId);
        await updateDoc(employeeRef, submissionData);
      } else {
        const employeesCollection = collection(db, "employees");
        await addDoc(employeesCollection, {
          ...submissionData,
          createdAt: new Date().toISOString()
        });
      }
      
      setSuccessMsg(editingId ? 'Staff updated successfully!' : 'Staff adding successfully!');
      setShowForm(false);
      resetForm();
    } catch (error) {
       console.error("Firestore operation failed:", error);
       alert("Operation failed. Please try again.");
    }
    setIsSubmitting(false);
  };

  const handleEditEmp = (e, emp) => {
    e.stopPropagation();
    setFormData({
      name: emp.name,
      role: emp.role,
      phone: emp.phone,
      idProofType: emp.idProofType || 'Aadhar',
      aadharNumber: emp.aadharNumber || '',
      address: emp.address || '',
      status: emp.status || 'Active',
      assignedRooms: emp.assignedRooms || [],
      joiningDate: emp.joiningDate || new Date().toISOString().split('T')[0]
    });
    setEditingId(emp.id);
    setShowForm(true);
  };

  const handleDeleteEmp = async (e, empId) => {
    e.stopPropagation();
    if(window.confirm('Delete this staff?')) {
       try {
         const employeeRef = doc(db, "employees", empId);
         await deleteDoc(employeeRef);
         setEmployees(prev => prev.filter(e => e.id !== empId));
       } catch (error) {
         console.error("Delete failed:", error);
         setEmployees(prev => prev.filter(e => e.id !== empId)); // Optimistic
       }
    }
  };

  const filteredEmployees = useMemo(() => {
    let list = employees.filter(emp => {
       const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.phone.includes(searchTerm);
       const currentStatus = emp.status || 'Active';
       const matchesStatus = statusFilter === 'All' || currentStatus === statusFilter;
       return matchesSearch && matchesStatus;
    });

    return list.sort((a, b) => {
      // Primary: Use createdAt if available
      if (a.createdAt || b.createdAt) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      // Secondary: Alphabetical fallback if no timestamp
      return a.name.localeCompare(b.name);
    });
  }, [employees, searchTerm, statusFilter]);

  const downloadCSV = () => {
    const headers = ['Sr. No', 'Name', 'Role', 'Status', 'Phone', 'ID Proof Type', 'Aadhar Number', 'Address', 'Assigned Rooms'];
    const rows = filteredEmployees.map((emp, index) => [
      (index + 1).toString().padStart(2, '0'),
      emp.name,
      emp.role,
       emp.status || 'Active',
       emp.phone,
       emp.idProofType || 'Aadhar',
       emp.aadharNumber || '',
       emp.address || '',
       emp.assignedRooms ? emp.assignedRooms.join('; ') : ''
     ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'staff_list.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-2">
      
      {/* Top Section (Fixed) */}
      <div className="flex-none space-y-3">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Staff Directory</h1>
             <p className="text-gray-500 text-sm mt-1">Manage staff roles and assignments</p>
          </div>
          <div className="flex items-center gap-2">
              <button 
                onClick={downloadCSV}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all"
              >
                <Download size={16} /> Export CSV
              </button>
              <button 
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all"
              >
                <UserPlus size={16} /> Add Staff
              </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
           <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-blue-100 text-xs font-black uppercase tracking-wider">Total Staff</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.total}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Briefcase size={24} className="text-white" />
               </div>
           </div>
           
           <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">Active Staff</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.active}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <CheckCircle2 size={24} className="text-white" />
               </div>
           </div>
           
           <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
               <div>
                  <p className="text-rose-100 text-xs font-black uppercase tracking-wider">Inactive Staff</p>
                  <p className="text-3xl font-black text-white mt-1">{stats.inactive}</p>
               </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <X size={24} className="text-white" />
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
                placeholder="Search staff by name or phone..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-indigo-500 rounded-lg text-sm font-medium outline-none transition-all" 
              />
            </div>

            {/* Status Filter */}
            <div className="relative w-full lg:w-48">
               <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
               <select 
                 value={statusFilter}
                 onChange={(e) => setStatusFilter(e.target.value)}
                 className="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer appearance-none transition-all"
               >
                 <option value="All">All Status</option>
                 <option value="Active">Active Only</option>
                 <option value="Inactive">Inactive Only</option>
               </select>
               <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown size={14} />
               </div>
            </div>
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200 shadow-sm">
               <tr>
                   <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-16 text-center whitespace-nowrap">Sr.No</th>
                   <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">Staff Name</th>
                   <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">Status</th>
                   <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">Contact</th>
                   <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">Assigned Rooms</th>
                   <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
               {filteredEmployees.map((emp, index) => {
                  const isInactive = emp.status === 'Inactive';
                  return (
                    <tr 
                        key={emp.id} 
                        className={`group hover:bg-indigo-50/20 transition-colors even:bg-gray-50/50`}
                     >
                        <td className="px-5 py-2.5 text-center text-xs font-bold text-gray-400 whitespace-nowrap">{(index + 1).toString().padStart(2, '0')}</td>
                        <td className="px-5 py-2.5 text-center whitespace-nowrap">
                              <div className="flex flex-col items-center">
                                 <span className="text-sm font-bold text-gray-900">{emp.name}</span>
                              </div>
                        </td>
                         <td className="px-5 py-2.5 text-center whitespace-nowrap">
                             <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${isInactive ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                {emp.status || 'Active'}
                             </span>
                         </td>
                        <td className="px-5 py-2.5 text-center whitespace-nowrap">
                           <div className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-700">
                              <Phone size={12} className="text-gray-400" />
                              {emp.phone}
                           </div>
                        </td>
                       <td className="px-5 py-2.5 text-center whitespace-nowrap">
                          <div className="flex flex-wrap gap-1 max-w-[200px] justify-center mx-auto">
                             {emp.assignedRooms?.length > 0 ? (
                                emp.assignedRooms.slice(0, 3).map(r => (
                                   <span key={r} className="text-[10px] font-bold bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600 shadow-sm">{r}</span>
                                ))
                             ) : <span className="text-gray-400 text-[10px] italic">No Rooms</span>}
                             {emp.assignedRooms?.length > 3 && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-bold">+{emp.assignedRooms.length - 3}</span>}
                          </div>
                       </td>
                       <td className="px-5 py-2.5 text-center whitespace-nowrap">
                           <div className="flex justify-center gap-2">
                                 <button onClick={() => setSelectedEmp(emp)} className="p-1.5 bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-100 rounded-lg transition-all shadow-sm group-hover:border-indigo-200" title="View Details"><Eye size={16} /></button>
                                 <button onClick={(e) => handleEditEmp(e, emp)} className="p-1.5 bg-white text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-100 rounded-lg transition-all shadow-sm group-hover:border-amber-200" title="Edit Staff"><Edit3 size={16} /></button>
                                 <button onClick={(e) => handleDeleteEmp(e, emp.id)} className="p-1.5 bg-white text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-100 rounded-lg transition-all shadow-sm group-hover:border-rose-200" title="Remove Staff"><Trash2 size={16} /></button>
                           </div>
                       </td>
                    </tr>
                  );
               })}
            </tbody>
          </table>
           {filteredEmployees.length === 0 && (
               <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <Search size={32} className="mb-2 opacity-20" />
                  <p className="text-xs font-medium">No employees found.</p>
               </div>
            )}
        </div>
      </div>

      {/* Employee Details Modal - Redesigned */}
      {selectedEmp && createPortal(
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedEmp(null)} />
             
             <div className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in max-h-[90vh]">
                
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-blue-700 to-blue-600 text-white flex justify-between items-center shrink-0">
                   <div>
                      <div className="flex items-center gap-3 mb-1">
                         <h2 className="text-2xl font-black tracking-tight">Employee Details</h2>
                         <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${selectedEmp.status === 'Active' ? 'bg-emerald-400 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                            {selectedEmp.status}
                         </span>
                      </div>
                   </div>
                   <button onClick={() => setSelectedEmp(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
                </div>

                {/* Content Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                   <div className="flex flex-col md:grid md:grid-cols-12 min-h-full">
                      
                      {/* LEFT SIDEBAR: Contact & Key Info */}
                      <div className="md:col-span-4 bg-gray-50 border-r border-gray-200 p-6 space-y-6">
                         
                         <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm text-center">
                            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600">
                               <Briefcase size={32} />
                            </div>
                            
                            <div className="pb-4 border-b border-gray-100 mb-4">
                               <h3 className="text-lg font-black text-gray-900">{selectedEmp.name}</h3>
                               <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-1">{selectedEmp.role}</p>
                            </div>

                            <div className="space-y-4">
                               <div className="flex items-center gap-3 text-sm text-gray-700 font-medium bg-gray-50 p-3 rounded-xl border border-gray-100">
                                  <Phone size={16} className="text-blue-500 shrink-0" />
                                  <span className="truncate">{selectedEmp.phone}</span>
                               </div>
                               <div className="flex items-center gap-3 text-sm text-gray-700 font-medium bg-gray-50 p-3 rounded-xl border border-gray-100">
                                  <Calendar size={16} className="text-blue-500 shrink-0" />
                                  <div className="text-left">
                                     <p className="text-[10px] uppercase text-gray-400 font-bold leading-none mb-1">Joined On</p>
                                     <span className="leading-none">
                                        {selectedEmp.joiningDate && !isNaN(new Date(selectedEmp.joiningDate)) 
                                          ? (() => {
                                             const d = new Date(selectedEmp.joiningDate);
                                             return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                                            })()
                                          : 'N/A'}
                                     </span>
                                  </div>
                               </div>
                            </div>
                         </div>

                      </div>

                      {/* RIGHT MAIN: Details & Assignments */}
                      <div className="md:col-span-8 p-8 space-y-8 bg-white">
                         
                         {/* Personal Information */}
                         <section>
                            <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2 mb-5 flex items-center gap-2">
                               <User size={14} /> Personal Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{selectedEmp.idProofType || 'ID Proof'}</p>
                                  <p className="text-sm font-bold text-gray-900">{selectedEmp.aadharNumber || 'Not Provided'}</p>
                               </div>
                               <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Address</p>
                                  <p className="text-sm font-medium text-gray-700 leading-snug">{selectedEmp.address || 'Address not provided'}</p>
                               </div>
                            </div>
                         </section>

                         {/* Room Assignments */}
                         <section>
                            <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2 mb-5 flex items-center gap-2">
                               <Briefcase size={14} /> Room Responsibility
                            </h3>
                            
                            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                               <div className="flex justify-between items-center mb-4">
                                  <span className="text-xs font-bold text-gray-500 uppercase">Assigned Rooms</span>
                                  <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{selectedEmp.assignedRooms?.length || 0} Total</span>
                               </div>
                               
                               <div className="flex flex-wrap gap-2">
                                  {selectedEmp.assignedRooms && selectedEmp.assignedRooms.length > 0 ? (
                                     selectedEmp.assignedRooms.map(roomNum => (
                                        <span key={roomNum} className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 text-sm font-black rounded-lg">
                                           {roomNum}
                                        </span>
                                     ))
                                  ) : (
                                     <p className="text-sm text-gray-400 italic font-medium">No rooms currently assigned.</p>
                                  )}
                               </div>
                            </div>
                         </section>

                      </div>
                   </div>
                </div>

                {/* Footer Removed */}

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
      {/* Add Employee Modal */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-50 bg-white animate-fade-in">
          <div className="bg-white w-full h-full flex flex-col overflow-hidden animate-slide-up relative my-0">
            <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
               <div>
                  <h2 className="text-xl font-bold">{editingId ? 'Edit Staff Profile' : 'New Staff Registration'}</h2>
                  <p className="text-blue-100 text-xs opacity-90">{editingId ? 'Update employee details' : 'Onboard new staff member'}</p>
               </div>
               <button onClick={resetForm} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all text-white">
                  Close
               </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                     <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
                        
                        {/* Top Section: Personal Info */}
                        <div className="space-y-4">
                           <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Personal Info</h3>
                           
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                               <div>
                                 <label className="block text-xs font-bold text-gray-600 mb-1">Full Name</label>
                                 <div className="relative group">
                                    <User size={14} className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all" placeholder="e.g. Rahul Sharma" required />
                                 </div>
                               </div>

                               <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Phone Number</label>
                                  <div className="relative group">
                                     <Phone size={14} className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                     <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all" placeholder="e.g. 9876543210" required />
                                  </div>
                               </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                               <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Role</label>
                                  <div className="relative">
                                     <Shield size={14} className="absolute left-3 top-2.5 text-gray-400" />
                                     <select name="role" value={formData.role} onChange={handleChange} className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all appearance-none cursor-pointer">
                                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                     </select>
                                  </div>
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Status</label>
                                  <div className="relative">
                                     <CheckCircle2 size={14} className="absolute left-3 top-2.5 text-gray-400" />
                                     <select name="status" value={formData.status} onChange={handleChange} className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all appearance-none cursor-pointer">
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                     </select>
                                  </div>
                               </div>

                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                   <label className="block text-xs font-bold text-gray-600 mb-1">ID Proof Type</label>
                                   <div className="relative group">
                                      <CreditCard size={14} className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                      <select name="idProofType" value={formData.idProofType} onChange={handleChange} className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all appearance-none cursor-pointer">
                                         <option value="">Select ID Proof Type</option>
                                         <option value="Aadhar">Aadhar Card</option>
                                         <option value="PAN">PAN Card</option>
                                         <option value="Voter ID">Voter ID</option>
                                         <option value="Driving License">Driving License</option>
                                      </select>
                                      <ChevronDown size={14} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
                                   </div>
                                </div>
                               <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">ID Number</label>
                                  <div className="relative group">
                                     <FileText size={14} className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                     <input 
                                       type="text" 
                                       name="aadharNumber" 
                                       value={formData.aadharNumber} 
                                       onChange={handleChange} 
                                       disabled={!formData.idProofType}
                                       className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100" 
                                       placeholder={formData.idProofType ? `Enter ${formData.idProofType} Number` : "Select ID Type first"}
                                     />
                                  </div>
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Joining Date</label>
                                  <div className="relative">
                                     <Calendar size={14} className="absolute left-3 top-2.5 text-gray-400" />
                                     <input 
                                        type={joiningDateFocused ? "date" : "text"}
                                        name="joiningDate" 
                                        value={joiningDateFocused ? formData.joiningDate : formatDate(formData.joiningDate)} 
                                        onChange={handleChange}
                                        onFocus={() => setJoiningDateFocused(true)}
                                        onBlur={() => setJoiningDateFocused(false)}
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all" 
                                        placeholder="Select Joining Date"
                                        required 
                                     />
                                  </div>
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Residential Address</label>
                                  <div className="relative group">
                                     <MapPin size={14} className="absolute left-3 top-2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                     <textarea name="address" value={formData.address} onChange={handleChange} rows="1" className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all resize-none" placeholder="Full address"></textarea>
                                  </div>
                               </div>
                            </div>



                  </div>

                  {/* Bottom Section: Room Assignment */}
                  <div className="flex flex-col">
                     <div className="bg-gray-50 rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-inner">
                        <div className="px-4 py-2 border-b border-gray-200 bg-gray-100/50 flex justify-between items-center tracking-tight">
                           <div className="flex items-center gap-2">
                              <Briefcase size={12} className="text-gray-400" />
                              <h3 className="text-[10px] font-bold text-gray-500 uppercase">Room Responsibility</h3>
                           </div>
                           <span className="text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">{formData.assignedRooms.length} Selected</span>
                        </div>
                        
                        <div className="p-3 bg-white/50">
                           <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                              {rooms
                                .filter(room => !takenRoomsMap.has(String(room.roomNumber)))
                                .sort((a, b) => {
                                   const numA = parseInt(a.roomNumber.replace(/\D/g, '')) || 0;
                                   const numB = parseInt(b.roomNumber.replace(/\D/g, '')) || 0;
                                   return numA - numB;
                                })
                                .map(room => {
                                 const isSelected = formData.assignedRooms.some(r => String(r) === String(room.roomNumber));
                                 
                                 return (
                                   <button
                                     key={room.id}
                                     type="button"
                                     onClick={() => handleRoomToggle(room.roomNumber)}
                                     className={`relative group p-1.5 rounded-lg text-xs font-bold border transition-all ${
                                       isSelected
                                         ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                                         : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'
                                     }`}
                                   >
                                      {room.roomNumber}
                                   </button>
                                 );
                               })}
                           </div>
                        </div>
                        
                        <div className="p-3 bg-gray-100 border-t border-gray-200 text-center">
                            <p className="text-xs text-gray-400">Select rooms that this employee is responsible for.</p>
                        </div>
                     </div>
                  </div>

                     <div className="pt-4">
                        <button 
                           type="submit" 
                           disabled={isSubmitting} 
                           className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 flex justify-center items-center gap-2 text-sm"
                        >
                           {isSubmitting ? 'Saving...' : <>{editingId ? <Edit3 size={18} /> : <Plus size={18} />} {editingId ? 'Update Info' : 'Register Employee'}</>}
                        </button>
                     </div>
                  </form>
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

    </div>
  );
};

export default Employees;
