import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Bell, X, BedDouble, CalendarClock } from 'lucide-react';

const CheckoutNotifier = () => {
  const { checkoutAlerts, dismissAlert, rooms, customers } = useAppContext();

  if (!checkoutAlerts || checkoutAlerts.length === 0) return null;

  const getCustomerName = (id) => customers.find(c => String(c.id) === String(id))?.name || 'Guest';
  const getRoomNumber = (id) => rooms.find(r => String(r.id) === String(id))?.roomNumber || 'N/A';

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-4 max-w-sm w-full animate-fade-in">
      {checkoutAlerts.map((alert) => (
        <div 
          key={alert.id} 
          className="bg-white rounded-2xl shadow-2xl border-l-4 border-amber-500 overflow-hidden animate-slide-up transform transition-all hover:scale-[1.02]"
        >
          <div className="p-4 relative">
            <button 
              onClick={() => dismissAlert(alert.id)}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                <Bell size={20} className="animate-bounce" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded">Check-out Alert</span>
                  <span className="text-[10px] font-bold text-gray-400">Scheduled in ~5 mins</span>
                </div>
                <h4 className="text-sm font-black text-gray-800 mb-2">Upcoming Room Release</h4>
                
                <div className="space-y-2">
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center text-indigo-600 font-black text-[10px]">
                         {getCustomerName(alert.customerId).charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-gray-700">{getCustomerName(alert.customerId)}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <BedDouble size={14} className="text-gray-400" />
                      <span className="text-xs font-black text-gray-600">Room {getRoomNumber(alert.roomId)}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <CalendarClock size={14} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">
                        Scheduled: {new Date(alert.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                   </div>
                </div>

                <div className="mt-4 flex gap-2">
                   <button 
                    onClick={() => dismissAlert(alert.id)}
                    className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 text-[10px] items-center justify-center flex font-black uppercase tracking-wider rounded-lg transition-all"
                   >
                     Later
                   </button>
                   <button 
                    onClick={() => {
                        window.location.href = '/allocations';
                        dismissAlert(alert.id);
                    }}
                    className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] items-center justify-center flex font-black uppercase tracking-wider rounded-lg transition-all shadow-md shadow-amber-200"
                   >
                     View Desk
                   </button>
                </div>
              </div>
            </div>
          </div>
          <div className="h-1 bg-amber-100 w-full overflow-hidden">
             <div className="h-full bg-amber-500 animate-[progress_300s_linear_forwards]" style={{ width: '100%', transformOrigin: 'left' }}></div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
};

export default CheckoutNotifier;
