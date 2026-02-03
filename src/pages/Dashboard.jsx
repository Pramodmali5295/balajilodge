import { BedDouble, Users, CheckCircle, Sparkles, TrendingUp, Calendar, IndianRupee, LogIn, LogOut, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom'; // Assuming Link is from react-router-dom
import React, { useMemo } from 'react'; // Assuming React and useMemo are imported
import { useAppContext } from '../context/AppContext'; // Assuming useAppContext is imported

const StatCard = ({ title, value, icon, gradient, link, border }) => (
  <Link to={link || '#'} className={`group ${gradient} p-5 rounded-xl shadow-lg ${border} text-white flex items-center justify-between transform transition-all hover:scale-[1.02] hover:shadow-xl duration-300`}>
    <div>
      <p className="text-white/80 text-[10px] font-black uppercase tracking-widest">{title}</p>
      <p className="text-3xl font-black mt-1 text-white">{value}</p>
    </div>
    <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner group-hover:bg-white/30 transition-all">
      {React.cloneElement(icon, { size: 24, className: "text-white" })}
    </div>
  </Link>
);



const Dashboard = () => {
  const { rooms, employees, allocations, customers } = useAppContext();

  const stats = useMemo(() => {
    const total = rooms.length;
    const available = rooms.filter(r => r.status === 'Available').length;
    const occupied = rooms.filter(r => r.status === 'Booked').length;
    const activeStays = allocations.filter(a => a.status === 'Active' || !a.status).length;
    const totalStaff = employees.filter(e => e.status !== 'Inactive').length;
    const totalGuests = customers.length;
    
    return { total, available, occupied, activeStays, totalStaff, totalGuests };
  }, [rooms, allocations, employees, customers]);

  const recentStays = useMemo(() => {
    return [...allocations]
      .sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn))
      .slice(0, 10);
  }, [allocations]);

  const getCustomerName = (id) => customers.find(c => String(c.id) === String(id))?.name || 'Unknown Guest';
  const getRoomNumber = (id) => rooms.find(r => String(r.id) === String(id))?.roomNumber || 'N/A';
  const getRoomType = (id) => rooms.find(r => String(r.id) === String(id))?.type || 'Unknown';

  const roomBreakdown = useMemo(() => {
     const data = { 
         AC: { total: 0, available: 0, occupied: 0 }, 
         'Non-AC': { total: 0, available: 0, occupied: 0 } 
     };
     
     rooms.forEach(r => { 
        const type = r.type;
        if(data[type]) {
            data[type].total++;
            if (r.status === 'Booked') {
                data[type].occupied++;
            } else {
                data[type].available++;
            }
        }
     });
     return data;
  }, [rooms]);

  // Compute active assigned rooms from Allocations
  const employeeRoomMap = useMemo(() => {
    const map = {};
    if (!allocations || !rooms) return map;

    allocations.forEach(alloc => {
      // Check for active status
      const isActive = alloc.status === 'Active' || !alloc.status;
      if (isActive && alloc.employeeId) {
        if (!map[alloc.employeeId]) {
          map[alloc.employeeId] = new Set();
        }
        
        // Get rooms from this allocation
        if (alloc.roomSelections && Array.isArray(alloc.roomSelections)) {
             alloc.roomSelections.forEach(sel => {
                 const room = rooms.find(r => String(r.id) === String(sel.roomId));
                 if (room) map[alloc.employeeId].add(room.roomNumber);
             });
        } else if (alloc.roomId) {
             // Backward compatibility
             const room = rooms.find(r => String(r.id) === String(alloc.roomId));
             if (room) map[alloc.employeeId].add(room.roomNumber);
        }
      }
    });

    // Convert Sets to Arrays
    Object.keys(map).forEach(empId => {
        map[empId] = Array.from(map[empId]).sort((a,b) => {
             // Try numeric sort
             const numA = parseInt(a.replace(/\D/g, '')) || 0;
             const numB = parseInt(b.replace(/\D/g, '')) || 0;
             return numA - numB;
        });
    });
    
    return map;
  }, [allocations, rooms]);

  // Daily Report Calculations
  const dailyReport = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Filter today's allocations
    const todayAllocations = allocations.filter(alloc => {
      const checkInDate = new Date(alloc.checkIn);
      return checkInDate >= today && checkInDate < tomorrow;
    });

    // Check-outs today
    const todayCheckOuts = allocations.filter(alloc => {
      if (!alloc.actualCheckOut && !alloc.checkOut) return false;
      const checkOutDate = new Date(alloc.actualCheckOut || alloc.checkOut);
      return checkOutDate >= today && checkOutDate < tomorrow && alloc.status === 'Checked-Out';
    });

    // Revenue calculations
    const todayRevenue = todayAllocations.reduce((sum, alloc) => {
      return sum + (Number(alloc.advanceAmount) || 0);
    }, 0);

    const todayTotalBilling = todayAllocations.reduce((sum, alloc) => {
      return sum + (Number(alloc.price) || 0);
    }, 0);

    const todayPending = todayTotalBilling - todayRevenue;

    // Payment type breakdown for today
    const paymentBreakdown = todayAllocations.reduce((acc, alloc) => {
      const type = alloc.paymentType || 'Cash';
      const amount = Number(alloc.advanceAmount) || 0;
      acc[type] = (acc[type] || 0) + amount;
      return acc;
    }, {});

    // Add Pending Collection if any
    if (todayPending > 0) {
      paymentBreakdown['Pending'] = todayPending;
    }

    // Occupancy rate
    const occupancyRate = rooms.length > 0 ? ((stats.occupied / rooms.length) * 100).toFixed(1) : 0;

    return {
      checkIns: todayAllocations.length,
      checkOuts: todayCheckOuts.length,
      revenue: todayRevenue,
      totalBilling: todayTotalBilling,
      pending: todayPending,
      paymentBreakdown,
      occupancyRate,
      todayAllocations
    };
  }, [allocations, rooms, stats.occupied]);

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="bg-gray-50/50 backdrop-blur-md pb-4 -mx-4 px-4 md:-mx-8 md:px-8 border-b border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">System Overview</h1>
            <p className="text-gray-500 text-sm font-medium">Real-time hospitality management operations</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
             <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
             <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest leading-none">Live Monitor</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Rooms" 
          value={stats.total} 
          icon={<BedDouble />} 
          gradient="bg-gradient-to-br from-indigo-500 to-indigo-600"
          border="border-indigo-400"
          link="/rooms"
        />
        <StatCard 
          title="Booked Rooms" 
          value={stats.occupied} 
          icon={<CheckCircle />} 
          gradient="bg-gradient-to-br from-rose-500 to-rose-600"
          border="border-rose-400"
          link="/allocations"
        />
        <StatCard 
          title="Available Rooms" 
          value={stats.available} 
          icon={<Sparkles />} 
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          border="border-emerald-400"
          link="/rooms"
        />
        <StatCard 
          title="Total Staff" 
          value={stats.totalStaff} 
          icon={<Users />} 
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          border="border-amber-400"
          link="/employees"
        />
      </div>

      {/* Daily Report Section */}
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-xl shadow-lg border border-blue-400/20 overflow-hidden">
        <div className="p-3 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
              <Calendar size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-tight">Daily Report</h2>
              <p className="text-blue-100 text-[9px] font-bold mt-0.5">{(() => {
                const d = new Date();
                return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
              })()}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-md backdrop-blur-sm border border-white/20">
            <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-[9px] font-black text-white uppercase tracking-wider">Live</span>
          </div>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Check-ins Today */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 hover:bg-white/15 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-emerald-500/20 rounded-md group-hover:bg-emerald-500/30 transition-all">
                <LogIn size={14} className="text-emerald-300" />
              </div>
              <span className="text-[9px] font-black text-white/60 uppercase tracking-wider">Check-ins</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-white">{dailyReport.checkIns}</h3>
              <span className="text-[10px] font-bold text-white/70">Today</span>
            </div>
          </div>

          {/* Check-outs Today */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 hover:bg-white/15 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-rose-500/20 rounded-md group-hover:bg-rose-500/30 transition-all">
                <LogOut size={14} className="text-rose-300" />
              </div>
              <span className="text-[9px] font-black text-white/60 uppercase tracking-wider">Check-outs</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-white">{dailyReport.checkOuts}</h3>
              <span className="text-[10px] font-bold text-white/70">Today</span>
            </div>
          </div>

          {/* Revenue Collected */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 hover:bg-white/15 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-green-500/20 rounded-md group-hover:bg-green-500/30 transition-all">
                <IndianRupee size={14} className="text-green-300" />
              </div>
              <span className="text-[9px] font-black text-white/60 uppercase tracking-wider">Collected Amount</span>
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-black text-white">₹{dailyReport.revenue.toLocaleString('en-IN')}</h3>
              <p className="text-[9px] font-bold text-white/50 mt-0.5">of ₹{dailyReport.totalBilling.toLocaleString('en-IN')}</p>
            </div>
          </div>


          {/* Occupied Rooms */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 hover:bg-white/15 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-amber-500/20 rounded-md group-hover:bg-amber-500/30 transition-all">
                <BedDouble size={14} className="text-amber-300" />
              </div>
              <span className="text-[9px] font-black text-white/60 uppercase tracking-wider">Occupied Rooms</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-white">{stats.occupied}</h3>
              <span className="text-[10px] font-bold text-white/70">Rooms</span>
            </div>
            <p className="text-[9px] font-bold text-white/50 mt-0.5">of {stats.total} total</p>
          </div>
        </div>

        {/* Payment Breakdown */}
        {Object.keys(dailyReport.paymentBreakdown).length > 0 && (
          <div className="px-3 pb-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
              <div className="flex items-center gap-1.5 mb-2">
                <CreditCard size={12} className="text-white/80" />
                <h3 className="text-[10px] font-black text-white uppercase tracking-wider">Payment Breakdown</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(dailyReport.paymentBreakdown)
                  .sort(([a], [b]) => {
                    // Sort Cash first, then Pending, then others
                    if (a === 'Cash') return -1;
                    if (b === 'Cash') return 1;
                    if (a === 'Pending') return -1;
                    if (b === 'Pending') return 1;
                    return a.localeCompare(b);
                  })
                  .map(([type, amount]) => (
                  <div key={type} className="bg-white/5 rounded-md p-2 border border-white/10">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-wide mb-0.5">
                      {type === 'Pending' ? 'Pending Collection' : type}
                    </p>
                    <p className="text-base font-black text-white">₹{amount.toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Guest Activity */}
         <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden flex flex-col h-[280px] border-t-4 border-t-indigo-500">
                <div className="p-4 border-b border-indigo-100 flex justify-between items-center bg-indigo-50/50 flex-shrink-0">
                   <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest">Customer Activity</h3>
                      <div className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-black shadow-sm shadow-indigo-100">{stats.totalGuests}</div>
                   </div>
                   <Link to="/customers" className="text-[9px] font-black text-white hover:bg-indigo-700 uppercase tracking-widest px-2.5 py-1.5 bg-indigo-600 rounded-lg shadow-md shadow-indigo-100 transition-all flex items-center gap-1">
                      Ledger <TrendingUp size={10} />
                   </Link>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100/80 text-[10px] font-black text-gray-800 uppercase tracking-widest border-b border-gray-200 sticky top-0 bg-gray-100 z-10 backdrop-blur-md">
                          <th className="px-5 py-2">Profile</th>
                          <th className="px-5 py-2">Room</th>
                          <th className="px-5 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {recentStays.map(alloc => (
                          <tr key={alloc.id} className="group hover:bg-indigo-50/30 transition-all">
                            <td className="px-5 py-3">
                               <div className="flex flex-col">
                                  <span className="text-xs font-black text-gray-800 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate max-w-[120px]">{getCustomerName(alloc.customerId)}</span>
                                  <span className="text-[8px] font-bold text-gray-400 uppercase">IN: {(() => {
                                      const d = new Date(alloc.checkIn);
                                      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} HRS`;
                                  })()}</span>
                               </div>
                            </td>
                            <td className="px-5 py-3">
                               <div className="flex flex-col">
                                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase w-fit border border-indigo-100 shadow-sm">{getRoomNumber(alloc.roomId)}</span>
                                  <span className="text-[7px] font-bold text-gray-400 uppercase mt-0.5">{getRoomType(alloc.roomId)}</span>
                                </div>
                            </td>
                            <td className="px-5 py-3 text-center">
                               <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border shadow-sm ${
                                  alloc.status === 'Checked-Out' 
                                  ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse-slow'
                               }`}>
                                  {alloc.status === 'Checked-Out' ? 'DONE' : 'LIVE'}
                               </span>
                            </td>
                          </tr>
                        ))}
                        {allocations.length === 0 && (
                           <tr><td colSpan="3" className="px-6 py-20 text-center text-gray-400 font-bold italic">No allocation data available</td></tr>
                        )}
                      </tbody>
                   </table>
                </div>
             </div>

             {/* Inventory Breakdown */}
             <div className="bg-white rounded-xl shadow-md border border-gray-100 flex flex-col h-[280px] border-t-4 border-t-emerald-500 overflow-hidden">
                <div className="p-4 border-b border-emerald-100 flex justify-between items-center bg-emerald-50/50 flex-shrink-0">
                   <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Rooms Distribution</h3>
                      <div className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-black shadow-sm shadow-emerald-100">{stats.total}</div>
                   </div>
                   <Link to="/rooms" className="text-[9px] font-black text-white hover:bg-emerald-700 uppercase tracking-widest px-2.5 py-1.5 bg-emerald-600 rounded-lg shadow-md shadow-emerald-100 transition-all flex items-center gap-1.5">
                      Rooms <BedDouble size={10} />
                   </Link>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4 p-5">
                   {/* Deluxe AC Item - Vertical Style */}
                   <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-center items-center text-center group/item">
                      <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 mb-2 group-hover/item:scale-110 transition-transform">
                         <Sparkles size={20} />
                      </div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3">AC</p>
                      
                      <div className="w-full space-y-2">
                          <div className="flex justify-between items-center px-3 py-2 bg-white/80 rounded-lg shadow-sm">
                              <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wide">Available</span>
                              <span className="text-sm font-black text-emerald-600">{roomBreakdown.AC.available}</span>
                          </div>
                          <div className="flex justify-between items-center px-3 py-2 bg-emerald-100/50 rounded-lg">
                              <span className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wide">Booked</span>
                              <span className="text-sm font-black text-emerald-700/70">{roomBreakdown.AC.occupied}</span>
                          </div>
                      </div>
                   </div>

                   {/* Standard Non-AC Item - Vertical Style */}
                   <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-center items-center text-center group/item">
                      <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gray-200 mb-2 group-hover/item:scale-110 transition-transform">
                         <BedDouble size={20} />
                      </div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Non-AC</p>
                      
                       <div className="w-full space-y-2">
                          <div className="flex justify-between items-center px-3 py-2 bg-white/80 rounded-lg shadow-sm">
                              <span className="text-[9px] font-bold text-gray-700 uppercase tracking-wide">Available</span>
                              <span className="text-sm font-black text-gray-800">{roomBreakdown['Non-AC'].available}</span>
                          </div>
                          <div className="flex justify-between items-center px-3 py-2 bg-gray-200/50 rounded-lg">
                              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Booked</span>
                              <span className="text-sm font-black text-gray-500">{roomBreakdown['Non-AC'].occupied}</span>
                          </div>
                      </div>
                   </div>
                </div>
             </div>

         {/* Staff on Duty */}
         <div className="bg-white rounded-xl shadow-md border border-gray-100 flex flex-col h-[280px] border-t-4 border-t-amber-500 overflow-hidden">
            <div className="p-4 border-b border-amber-100 flex justify-between items-center bg-amber-50/50 flex-shrink-0">
               <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-amber-900 uppercase tracking-widest">Staff Overview</h3>
                  <div className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black shadow-sm shadow-amber-100">{stats.totalStaff}</div>
               </div>
               <Link to="/employees" className="text-[9px] font-black text-white hover:bg-amber-600 uppercase tracking-widest px-2.5 py-1.5 bg-amber-500 rounded-lg shadow-md shadow-amber-100 transition-all flex items-center gap-1.5">
                  Manage <Users size={10} />
               </Link>
            </div>
            
             <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar">
                {employees.filter(e => e.status !== 'Inactive').length === 0 ? (
                   <div className="px-4 py-20 text-center text-gray-400 font-bold italic">No active staff members</div>
                ) : (
                   employees
                     .filter(e => e.status !== 'Inactive')
                     .sort((a, b) => {
                       // Sort by createdAt timestamp (most recent first)
                       if (a.createdAt || b.createdAt) {
                         return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                       }
                       // Fallback to alphabetical
                       return a.name.localeCompare(b.name);
                     })
                     .slice(0, 15)
                     .map(emp => {
                       const assignedRooms = employeeRoomMap[emp.id] || [];
                       return (
                       <div key={emp.id} className="group flex items-start justify-between p-3 hover:bg-gradient-to-r hover:from-amber-50/50 hover:to-transparent rounded-2xl transition-all cursor-default border border-transparent hover:border-amber-100/50">
                       <div className="flex-shrink-0 w-24 mr-2 pt-1">
                         <h4 className="font-bold text-gray-800 group-hover:text-amber-700 transition-colors uppercase text-[10px] tracking-tight truncate" title={emp.name}>{emp.name}</h4>
                         <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{emp.role}</p>
                       </div>
                       <div className="flex-1 grid grid-cols-5 gap-1 justify-items-end">
                          {assignedRooms.length > 0 ? (
                             assignedRooms.map(room => (
                               <span key={room} className="w-full text-center px-0.5 py-1 bg-amber-50 text-amber-700 rounded-md text-[8px] font-black border border-amber-100/50 shadow-sm whitespace-nowrap overflow-hidden">
                                 {room}
                               </span>
                             ))
                          ) : (
                             <div className="col-span-5 flex justify-end">
                                <span className="text-[7px] font-black text-gray-300 uppercase tracking-widest italic">Free</span>
                             </div>
                          )}
                       </div>
                     </div>
                     );
                   })

                )}
             </div>
         </div>
      </div>
    </div>
  );
};

export default Dashboard;
