import React from 'react';
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
  return (
    <AppProvider>
      <Router>
        <div className="flex bg-gray-50 min-h-screen font-sans antialiased text-gray-900">
          <Sidebar />
          <CheckoutNotifier />
          <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen no-scrollbar">
            <div className="max-w-7xl mx-auto animate-fade-in-up">
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
