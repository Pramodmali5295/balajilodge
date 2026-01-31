import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext'; // Import Auth
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Rooms from './pages/Rooms';
import Employees from './pages/Employees';

import Allocations from './pages/Allocations';
import Customers from './pages/Customers';
import Auth from './pages/Auth';
import CheckoutNotifier from './components/CheckoutNotifier';
import './index.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Navigate to="/auth" replace />;
  }
  return children;
};

// Route that redirects to Dashboard if already logged in
const PublicRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (currentUser) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function AppContent() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { currentUser } = useAuth(); // Use auth state
  
  // Check if we're on the add-booking page
  const isAddBookingPage = location.pathname === '/add-booking';
  const isAuthPage = location.pathname === '/auth';

  if (!currentUser) {
     return (
        <Routes>
           <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
           <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
     );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans antialiased text-gray-900">
      <Sidebar isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
      <CheckoutNotifier />
      <main className={`flex-1 lg:ml-64 overflow-y-auto h-screen no-scrollbar ${isAddBookingPage ? '' : 'p-4 lg:p-8'}`}>
        <div className={isAddBookingPage ? '' : 'max-w-7xl mx-auto animate-fade-in-up'}>
          {/* Mobile Menu Button - Show only if not adds booking page */}
          {!isAddBookingPage && (
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
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/employees" element={<Employees />} />

            <Route path="/allocations" element={<Allocations />} />
            <Route path="/add-booking" element={<Allocations />} />
            <Route path="/pending" element={<Allocations />} />
            <Route path="/completed" element={<Allocations />} />
            <Route path="/customers" element={<Customers />} />
            {/* Redirect any unknown protected route to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </AppProvider>
  );
}

export default App;
