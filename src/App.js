import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Rooms from './pages/Rooms';
import Employees from './pages/Employees';

import Allocations from './pages/Allocations';
import Customers from './pages/Customers';
import CheckoutNotifier from './components/CheckoutNotifier';
import './index.css';

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <AppProvider>
      <Router>
        <div className="flex bg-gray-50 min-h-screen font-sans antialiased text-gray-900">
          <Sidebar isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
          <CheckoutNotifier />
          <main className="flex-1 lg:ml-64 p-4 lg:p-8 overflow-y-auto h-screen no-scrollbar">
            <div className="max-w-7xl mx-auto animate-fade-in-up">
              {/* Mobile Menu Button */}
              <div className="lg:hidden mb-4">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/rooms" element={<Rooms />} />
                <Route path="/employees" element={<Employees />} />

                <Route path="/allocations" element={<Allocations />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
