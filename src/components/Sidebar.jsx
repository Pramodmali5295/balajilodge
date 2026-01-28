import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BedDouble, Users, UserCheck, CalendarRange, X, CalendarClock, CheckSquare, Clock } from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Add New Customer', path: '/add-booking', icon: <CalendarClock size={20} /> },
    { name: 'Pending', path: '/pending', icon: <Clock size={20} /> },
    { name: 'Completed', path: '/completed', icon: <CheckSquare size={20} /> },
    { name: 'Rooms', path: '/rooms', icon: <BedDouble size={20} /> },
    { name: 'Employees', path: '/employees', icon: <Users size={20} /> },

    { name: 'Cutomer report', path: '/customers', icon: <UserCheck size={20} /> },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`h-screen w-64 bg-slate-900 border-r border-slate-800 fixed left-0 top-0 flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Close Button for Mobile */}
        <div className="lg:hidden absolute top-4 right-4">
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Brand Header */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
                <span className="font-black text-white text-lg">B</span>
              </div>
              <div>
                  <h1 className="text-lg font-black tracking-tight text-white leading-none">Balaji Lodge</h1>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Management</p>
              </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
          <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Main Menu</p>
          
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => setIsOpen(false)} // Close mobile menu on navigation
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group font-bold text-sm ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className={`transition-transform duration-200 ${!item.isActive && 'group-hover:scale-110'}`}>
                  {item.icon}
              </span>
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
