import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { UserCheck, Search, Users, Download, X, Clock, Trash2, Edit3, Phone, MapPin, FileText, Eye, Calendar, History } from 'lucide-react';

const Customers = () => {
  const { customers, allocations, rooms } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', idProof: '', address: '', customerType: 'Regular'
  });
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Stats Calculation
  const stats = useMemo(() => {
    const total = customers.length;
    
    // Calculate regulars dynamically based on visit count > 1
    const visitCounts = allocations.reduce((acc, curr) => {
       const id = String(curr.customerId);
       acc[id] = (acc[id] || 0) + 1;
       return acc;
    }, {});
    
    // Count how many customers have > 1 visit
    const regulars = Object.values(visitCounts).filter(count => count > 1).length;

    const activeNow = new Set(allocations.filter(a => a.status === 'Active' || !a.status).map(a => a.customerId)).size;
    return { total, regulars, activeNow };
  }, [customers, allocations]);

  // Filtering & Sorting
  const filteredCustomers = useMemo(() => {
    let list = customers.filter(c => 
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone?.includes(searchTerm)
    );

    // Apply Date Filter
    if (dateRange.start || dateRange.end) {
      list = list.filter(c => {
        let guestDate;
        if (c.createdAt) {
          guestDate = new Date(c.createdAt);
        } else {
          const stays = allocations.filter(al => String(al.customerId) === String(c.id));
          if (stays.length > 0) {
            guestDate = new Date(Math.max(...stays.map(al => new Date(al.checkIn).getTime())));
          }
        }

        if (!guestDate) return false;

        const start = dateRange.start ? new Date(dateRange.start) : null;
        const end = dateRange.end ? new Date(dateRange.end) : null;
        
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        
        if (start && guestDate < start) return false;
        if (end && guestDate > end) return false;
        return true;
      });
    }

    return list.sort((a, b) => {
       // Sort by most recent activity or creation
      if (a.createdAt || b.createdAt) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      const aLatest = Math.max(...allocations.filter(al => String(al.customerId) === String(a.id)).map(al => new Date(al.checkIn).getTime() || 0), 0);
      const bLatest = Math.max(...allocations.filter(al => String(al.customerId) === String(b.id)).map(al => new Date(al.checkIn).getTime() || 0), 0);
      return bLatest - aLatest;
    });
  }, [customers, searchTerm, allocations, dateRange]);

  // Handlers
  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      idProof: customer.idProof || '',
      address: customer.address || '',
      customerType: customer.customerType || 'Regular'
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await updateDoc(doc(db, "customers", editingCustomer.id), formData);
      }
      setShowForm(false);
      setEditingCustomer(null);
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this guest record?")) {
      await deleteDoc(doc(db, "customers", id));
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Phone', 'ID Proof Type', 'ID Number', 'Address', 'Customer Type', 'Total Visits', 'Total Revenue (Base)', 'Total GST (12%)', 'Total Amount', 'Total Paid', 'Payment Methods Used', 'First Registered', 'Last Visit'];
    
    const rows = filteredCustomers.map(c => {
       // Calculate visits stats
       const customerStays = allocations.filter(a => String(a.customerId) === String(c.id));
       const visitCount = customerStays.length;
       
       // Calculate Last Visit
       let lastVisit = 'N/A';
       if (customerStays.length > 0) {
          const lastDate = new Date(Math.max(...customerStays.map(a => new Date(a.checkIn).getTime())));
          lastVisit = lastDate.toLocaleDateString();
       }

       // Format Created At
       const registered = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Unknown';

       // Parse ID Proof into Type and Number
       let idType = '';
       let idNumber = '';
       if (c.idProof && c.idProof.includes(' - ')) {
          [idType, idNumber] = c.idProof.split(' - ');
       } else {
          idNumber = c.idProof || '';
       }

       // Calculate financial totals
       const totalRevenue = customerStays.reduce((sum, stay) => sum + (Number(stay.price) || 0), 0);
       const totalGST = totalRevenue * 0.12; // 12% GST
       const totalAmount = totalRevenue + totalGST;
       const totalPaid = customerStays.reduce((sum, stay) => sum + (Number(stay.advanceAmount) || 0), 0);
       
       // Get unique payment methods
       const paymentMethods = [...new Set(customerStays
          .map(stay => stay.paymentType)
          .filter(Boolean))].join(', ') || 'N/A';

       // Helper to escape CSV fields
       const escapeCsv = (text) => {
          if (text === null || text === undefined) return '';
          const str = String(text);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
             return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
       };

       return [
          escapeCsv(c.name),
          escapeCsv(c.phone),
          escapeCsv(idType),
          escapeCsv(idNumber),
          escapeCsv(c.address),
          escapeCsv(c.customerType || c.guestType || 'Regular'),
          visitCount,
          totalRevenue.toFixed(2),
          totalGST.toFixed(2),
          totalAmount.toFixed(2),
          totalPaid.toFixed(2),
          escapeCsv(paymentMethods),
          registered,
          lastVisit
       ];
    });

    const content = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balaji-guest-ledger-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-2">
      
      {/* Top Section (Fixed) */}
      <div className="flex-none space-y-3">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Guest Ledger</h1>
            <p className="text-gray-500 text-sm mt-1">Manage customer profiles and history</p>
          </div>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-sm transition-all"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
           <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
              <div>
                 <p className="text-indigo-100 text-xs font-black uppercase tracking-wider">Total Guests</p>
                 <p className="text-3xl font-black text-white mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                 <Users size={24} className="text-white" />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
              <div>
                 <p className="text-amber-100 text-xs font-black uppercase tracking-wider">Regular Visitors</p>
                 <p className="text-3xl font-black text-white mt-1">{stats.regulars}</p>
              </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                 <UserCheck size={24} className="text-white" />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
              <div>
                 <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">Active Now</p>
                 <p className="text-3xl font-black text-white mt-1">{stats.activeNow}</p>
              </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                 <Clock size={24} className="text-white" />
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
              placeholder="Search guests by name or phone..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-indigo-500 rounded-lg text-sm font-medium outline-none transition-all" 
            />
          </div>

          {/* Date Filters */}
          <div className="flex items-center gap-3 w-full lg:w-auto bg-gray-50 p-1.5 rounded-lg border border-gray-200">
               <div className="flex items-center gap-2 px-3 py-1">
                  <span className="text-xs font-bold text-gray-500 uppercase">From</span>
                  <input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})} 
                    className="bg-transparent text-sm font-medium text-gray-700 outline-none" 
                  />
               </div>
               <div className="w-[1px] h-5 bg-gray-300"></div>
               <div className="flex items-center gap-2 px-3 py-1">
                  <span className="text-xs font-bold text-gray-500 uppercase">To</span>
                  <input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})} 
                    className="bg-transparent text-sm font-medium text-gray-700 outline-none" 
                  />
               </div>
               {(dateRange.start || dateRange.end) && (
                  <button onClick={() => setDateRange({start: '', end: ''})} className="p-1 hover:bg-gray-200 rounded-md text-gray-500 transition-colors">
                     <X size={14} />
                  </button>
               )}
          </div>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200 shadow-sm">
              <tr>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-16 text-center">#</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact Info</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Address</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Identification</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
               {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer, index) => (
                    <tr key={customer.id} className="group hover:bg-indigo-50/20 transition-colors even:bg-gray-50/50">
                      <td className="px-6 py-2.5 text-center text-xs font-bold text-gray-400">
                        {(index + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="px-6 py-2.5">
                        <span className="text-sm font-bold text-gray-900">{customer.name}</span>
                      </td>
                      <td className="px-6 py-2.5">
                         <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                            <Phone size={14} className="text-gray-400" />
                            {customer.phone}
                         </div>
                      </td>
                      <td className="px-6 py-2.5">
                         <div className="flex items-center gap-2 text-xs font-medium text-gray-500 max-w-[200px]">
                            <MapPin size={14} className="text-gray-300 shrink-0" />
                            <span className="truncate" title={customer.address}>{customer.address || '---'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-2.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-white border border-gray-100 px-2 py-1 rounded-md w-fit shadow-sm">
                            <FileText size={14} className="text-indigo-300" />
                            {customer.idProof}
                         </div>
                      </td>
                      <td className="px-6 py-2.5 text-center">
                         <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { setSelectedGuest(customer); setShowViewModal(true); }} className="p-1.5 bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-100 rounded-lg transition-all shadow-sm group-hover:border-indigo-200" title="View History">
                               <Eye size={16} />
                            </button>
                            <button onClick={() => handleEdit(customer)} className="p-1.5 bg-white text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-100 rounded-lg transition-all shadow-sm group-hover:border-amber-200" title="Edit Details">
                               <Edit3 size={16} />
                            </button>
                            <button onClick={() => handleDelete(customer.id)} className="p-1.5 bg-white text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-100 rounded-lg transition-all shadow-sm group-hover:border-rose-200" title="Delete Record">
                               <Trash2 size={16} />
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))
               ) : (
                  <tr>
                     <td colSpan="5" className="px-6 py-12 text-center text-gray-400 italic">
                        No guests found matching your criteria.
                     </td>
                  </tr>
               )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
             <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Records</span>
             <span className="text-sm font-bold text-gray-800 bg-white px-3 py-1 rounded border border-gray-200 shadow-sm">{filteredCustomers.length}</span>
        </div>
      </div>

      {/* MODALS */}
      {/* Edit Form Modal */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-all" onClick={() => setShowForm(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
               <h2 className="text-lg font-bold text-gray-800">Edit Guest Details</h2>
               <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Full Name</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 bg-white border border-gray-200 focus:border-indigo-500 rounded-lg outline-none font-medium text-gray-800 transition-all" required />
               </div>
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Phone Number</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 bg-white border border-gray-200 focus:border-indigo-500 rounded-lg outline-none font-medium text-gray-800 transition-all" required />
               </div>
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">ID Proof</label>
                  <input type="text" value={formData.idProof} onChange={(e) => setFormData({...formData, idProof: e.target.value})} className="w-full px-4 py-2 bg-white border border-gray-200 focus:border-indigo-500 rounded-lg outline-none font-medium text-gray-800 transition-all" required />
               </div>
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Address</label>
                  <textarea value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} rows="3" className="w-full px-4 py-2 bg-white border border-gray-200 focus:border-indigo-500 rounded-lg outline-none font-medium text-gray-800 transition-all resize-none" />
               </div>
               <div className="pt-2">
                   <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-sm transition-all active:scale-[0.98]">Update Information</button>
               </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* View Details Slide-Over */}
      {/* View Details Modal - Styled like Allocations */}
      {showViewModal && selectedGuest && createPortal(
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowViewModal(false)} />
            
            <div className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-fade-in-up">
               {/* Header */}
               <div className="px-8 py-6 bg-gradient-to-r from-indigo-700 to-indigo-600 text-white flex justify-between items-center shrink-0">
                  <div>
                     <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-black tracking-tight">{selectedGuest.name}</h2>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                           (selectedGuest.customerType || selectedGuest.guestType) === 'Returning' 
                           ? 'bg-amber-400 text-amber-900' 
                           : 'bg-emerald-400 text-emerald-900'
                        }`}>
                           {selectedGuest.customerType || selectedGuest.guestType || 'Regular'}
                        </span>
                     </div>
                     <p className="text-indigo-100 text-sm font-medium opacity-80">Guest ID: #{selectedGuest.id.slice(0,8).toUpperCase()}</p>
                  </div>
                  <button onClick={() => setShowViewModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
               </div>
               
               {/* Content */}
               <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                  <div className="p-5 flex flex-col gap-4">
                     
                     {/* Row 1: Contact & ID Info */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-100/50 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                                 <Phone size={20} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Contact Details</h3>
                                <p className="text-sm font-black text-gray-900">{selectedGuest.phone || 'N/A'}</p>
                                <p className="text-xs font-medium text-gray-500 truncate" title={selectedGuest.address}>{selectedGuest.address || 'Address not provided'}</p>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-100/50 rounded-full flex items-center justify-center text-purple-600 shrink-0">
                                 <FileText size={20} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Identification</p>
                                <p className="text-sm font-black text-gray-900 truncate">{selectedGuest.idProof || 'Not Provided'}</p>
                                <p className="text-xs font-medium text-gray-500">Registered: {selectedGuest.createdAt ? new Date(selectedGuest.createdAt).toLocaleDateString() : 'Unknown'}</p>
                            </div>
                        </div>
                     </div>

                     {/* Row 2: Stats */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                           <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Total Visits</p>
                              <p className="text-2xl font-black text-indigo-600">{allocations.filter(a => String(a.customerId) === String(selectedGuest.id)).length}</p>
                           </div>
                           <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><History size={20}/></div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                           <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Total Spent</p>
                              <p className="text-2xl font-black text-emerald-600">₹{allocations.filter(a => String(a.customerId) === String(selectedGuest.id)).reduce((sum, a) => sum + (Number(a.price) || 0) + (Number(a.price || 0)*0.12), 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}</p>
                           </div>
                           <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><UserCheck size={20}/></div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                           <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Last Visit</p>
                              {(() => {
                                 const stays = allocations.filter(a => String(a.customerId) === String(selectedGuest.id));
                                 if (stays.length === 0) return <p className="text-xl font-bold text-gray-600">N/A</p>;
                                 const lastDate = new Date(Math.max(...stays.map(a => new Date(a.checkIn).getTime())));
                                 return <p className="text-xl font-bold text-gray-800">{lastDate.toLocaleDateString()}</p>;
                              })()}
                           </div>
                           <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Calendar size={20}/></div>
                        </div>
                     </div>

                     {/* Row 3: History */}
                     <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2 sticky top-0 bg-gray-50 z-10">
                           <Clock size={14} className="text-indigo-500" />
                           <span className="text-xs font-black uppercase text-gray-500 tracking-wider">Visit History</span>
                        </div>
                        
                        <div className="p-5 space-y-4">
                             {allocations
                                .filter(a => String(a.customerId) === String(selectedGuest.id))
                                .sort((a,b) => new Date(b.checkIn) - new Date(a.checkIn))
                                .map((stay, idx) => {
                                    const room = rooms.find(r => String(r.id) === String(stay.roomId));
                                    return (
                                       <div key={stay.id} className="relative pl-6 pb-6 border-l-2 border-gray-100 last:border-0 last:pb-0 group">
                                         <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${stay.status === 'Checked-Out' ? 'bg-gray-300' : 'bg-emerald-500'}`}></div>

                                         <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow">
                                             <div className="flex justify-between items-start mb-2">
                                                <div>
                                                   <span className="text-sm font-bold text-gray-900 block">Room {room?.roomNumber || 'Unknown'} <span className="text-gray-400 font-normal text-xs">({room?.type})</span></span>
                                                </div>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${stay.status === 'Checked-Out' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                                   {stay.status === 'Checked-Out' ? 'Completed' : 'Active'}
                                                </span>
                                             </div>
                                             
                                             <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                                 <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Check In</span>
                                                    <span className="font-bold text-gray-800">{new Date(stay.checkIn).toLocaleString()}</span>
                                                 </div>
                                                 <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Check Out</span>
                                                    <span className="font-bold text-gray-800">{stay.actualCheckOut ? new Date(stay.actualCheckOut).toLocaleString() : new Date(stay.checkOut).toLocaleDateString()}</span>
                                                 </div>
                                             </div>

                                              {(stay.price) && (
                                                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-600">
                                                   <span>Total: <span className="font-bold text-indigo-600">₹{((Number(stay.price)||0)*1.12).toLocaleString('en-IN', {maximumFractionDigits:0})}</span></span>
                                                   <span>Paid: <span className="font-bold text-emerald-600">₹{(Number(stay.advanceAmount)||0).toLocaleString('en-IN', {maximumFractionDigits:0})}</span></span>
                                                </div>
                                              )}
                                         </div>
                                       </div>
                                    )
                                })
                             }
                             {allocations.filter(a => String(a.customerId) === String(selectedGuest.id)).length === 0 && (
                                <p className="text-center text-gray-400 text-sm italic py-4">No history records found.</p>
                             )}
                        </div>
                     </div>
                  </div>
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

export default Customers;
