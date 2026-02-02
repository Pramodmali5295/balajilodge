import React from 'react';
import logoImage from '../assets/logo.jpg';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BedDouble, Users, UserCheck, X, CalendarClock, CheckSquare, Clock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { logout, currentUser } = useAuth();
  const username = currentUser?.email ? currentUser.email.split('@')[0] : 'Staff';
  const displayUsername = username.charAt(0).toUpperCase() + username.slice(1);
  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Add New Customer', path: '/add-booking', icon: <CalendarClock size={20} /> },
    { name: 'Pending Customer', path: '/pending', icon: <Clock size={20} /> },
    { name: 'Completed Customer', path: '/completed', icon: <CheckSquare size={20} /> },
    { name: 'Add Rooms', path: '/rooms', icon: <BedDouble size={20} /> },
    { name: 'Add Staff ', path: '/employees', icon: <Users size={20} /> },

    { name: 'Customer Report', path: '/customers', icon: <UserCheck size={20} /> },
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
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20 overflow-hidden">
                <img src={logoImage} alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                  <h1 className="text-lg font-black tracking-tight text-white leading-none">Balaji Lodge</h1>
              </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-1.5 no-scrollbar">
          <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Main Menu</p>
          
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => setIsOpen(false)} // Close mobile menu on navigation
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 group font-bold text-sm ${
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

        {/* User Profile / Logout */}
        <div className="p-3 border-t border-slate-800">
             <div className="flex items-center gap-3 px-2 mb-2">
                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/30">
                    {displayUsername.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-200 truncate">{displayUsername}</p>
                    <p className="text-[10px] font-medium text-slate-500 truncate">Logged In</p>
                </div>
             </div>
             <button
                onClick={() => logout()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group font-bold text-sm bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-900/30"
             >
                <LogOut size={20} className="group-hover:scale-110 transition-transform" />
                <span>Sign Out</span>
             </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
