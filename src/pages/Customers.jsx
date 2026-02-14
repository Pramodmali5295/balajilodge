import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { db } from '../services/firebase';
import { updateDoc, doc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { UserCheck, Search, Users, Download, X, Clock, Trash2, Phone, MapPin, FileText, Eye, Calendar, History, Printer } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import logoImage from '../assets/logo.jpg';

const Customers = () => {
    const { customers, allocations, rooms, employees } = useAppContext();

  // --- Date Formatting Helper ---
  const formatBillDate = (dateStr) => {
     if (!dateStr) return "---";
     const d = new Date(dateStr);
     const day = String(d.getDate()).padStart(2, '0');
     const month = String(d.getMonth() + 1).padStart(2, '0');
     const year = d.getFullYear();
     
     let hrs = d.getHours();
     const mins = String(d.getMinutes()).padStart(2, '0');
     const ampm = hrs >= 12 ? 'PM' : 'AM';
     hrs = hrs % 12;
     hrs = hrs ? hrs : 12; 
     const hrsStr = String(hrs).padStart(2, '0');
     
     return `${day}-${month}-${year} ${hrsStr}:${mins} ${ampm}`;
  };

  // --- Number to Words Helper (Indian Format) ---
  const numberToWords = (num) => {
   const roundedNum = Math.round(num);
   const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
   const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
   
   const g = (n) => {
      if (n === 0) return '';
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + g(n % 100) : '');
      if (n < 100000) return g(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + g(n % 1000) : '');
      if (n < 10000000) return g(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + g(n % 100000) : '');
      return g(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + g(n % 10000000) : '');
   };

   let str = g(roundedNum);
   if (str) str += ' Rupees';
   return (str || 'Zero') + ' Only';
};
    
  const getRoomNumber = (roomId) => {
     const r = rooms.find(rm => String(rm.id) === String(roomId));
     return r ? r.roomNumber : '---';
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', idProof: '', address: '', customerType: 'Regular'
  });
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [dateFilterFocus, setDateFilterFocus] = useState({ start: false, end: false });
  const formatDateForFilter = (dateStr) => {
     if (!dateStr) return '';
     return dateStr.split('-').reverse().join('/');
  };

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

    // Filter: Show all entries including not fully paid or not checked out
    list = list.filter(c => {
       // Show all customers regardless of payment status
       return true; 
    });

   // Apply Date Filter
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start ? new Date(dateRange.start) : null;
      const end = dateRange.end ? new Date(dateRange.end) : null;
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);

      list = list.filter(c => {
         // Check creation date
         let createdInRange = false;
         if (c.createdAt) {
             const cDate = new Date(c.createdAt);
             createdInRange = (!start || cDate >= start) && (!end || cDate <= end);
         }

         // Check visits (Allocations)
         const hasVisitInRange = allocations.some(a => {
             if (String(a.customerId) !== String(c.id)) return false;
             const checkIn = new Date(a.checkIn);
             return (!start || checkIn >= start) && (!end || checkIn <= end);
         });

         return createdInRange || hasVisitInRange;
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
    // Logical sequence: Basic Info → Contact → ID → Visit Stats → Financial → Booking Details
    const headers = [
      'Sr. No',
      'Name', 
      'Phone', 
      'Address',
      'ID Proof Type', 
      'ID Number',
      'Customer Type',
      'First Registered', 
      'Last Visit',
      'Latest Visit Guests',
      'Latest Visit Children',
      'Visits (In Range)',
      'Total Visits (Lifetime)',
      'Range Room Amount (Without GST)', 
      'Range Other Charges',
      'Range CGST (6%)', 
      'Range SGST (6%)', 
      'Range Total (With GST)', 
      'Range Advance',
      'Range Pending Amount',
      'Payment Methods',
      'Register Nos', 
      'Booking IDs', 
      'Booked Rooms'
    ];
    
    const rows = filteredCustomers.map((c, index) => {
       // Get ALL stays for history stats
       const allStays = allocations.filter(a => String(a.customerId) === String(c.id));
       const lifetimeVisits = allStays.length;

       // Get Filtered stays for Ledger Calculation
       let rangeStays = [...allStays];
       if (dateRange.start || dateRange.end) {
           const start = dateRange.start ? new Date(dateRange.start) : null;
           const end = dateRange.end ? new Date(dateRange.end) : null;
           if (start) start.setHours(0, 0, 0, 0);
           if (end) end.setHours(23, 59, 59, 999);

           rangeStays = rangeStays.filter(a => {
               const checkIn = new Date(a.checkIn);
               return (!start || checkIn >= start) && (!end || checkIn <= end);
           });
       }

       const visitCountInRange = rangeStays.length;
       
       // Helper for DD/MM/YYYY
       const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

       // Calculate Last Visit (from ALL stays usually, or just range? Use Range if available, else N/A)
       let lastVisit = 'N/A';
       let lastGuests = '0';
       let lastChildren = '0';

       if (rangeStays.length > 0) {
          const sortedStays = [...rangeStays].sort((a,b) => new Date(b.checkIn) - new Date(a.checkIn));
          const latestStay = sortedStays[0];
          const lastDate = new Date(latestStay.checkIn);
          lastVisit = fmtDate(lastDate);
          lastGuests = String(latestStay.numberOfGuests || 1);
          lastChildren = String(latestStay.numberOfChildren || 0);
       } else if (allStays.length > 0) {
          // Fallback to show they visited before, but indicate it wasnt in range?
          // The user asked for specific date csv. 
          // If 0 stays in range, lastVisit in range is N/A.
       }

       // Format Created At
       const registered = c.createdAt ? fmtDate(new Date(c.createdAt)) : 'Unknown';

       // Parse ID Proof into Type and Number
       let idType = '';
       let idNumber = '';
       if (c.idProof && c.idProof.includes(' - ')) {
          [idType, idNumber] = c.idProof.split(' - ');
       } else {
          idNumber = c.idProof || '';
       }

       // Get all booked rooms (In Range)
       const allRooms = rangeStays.map(stay => {
           if (stay.roomSelections && stay.roomSelections.length > 0) {
               return stay.roomSelections.map(s => {
                   const r = rooms.find(rm => String(rm.id) === String(s.roomId));
                   return r ? r.roomNumber : 'Unknown';
               }).join(', ');
           } else {
               const r = rooms.find(rm => String(rm.id) === String(stay.roomId));
               return r ? r.roomNumber : '';
           }
       }).filter(Boolean).join(' | ');

       // Get Registration Numbers and Booking IDs (In Range)
       const regNos = [...new Set(rangeStays.map(s => s.registrationNumber).filter(Boolean))].join(' | ');
       const bookingIds = [...new Set(rangeStays.map(s => s.externalBookingId).filter(Boolean))].join(' | ');

       // Calculate financial totals (In Range)
       let totalRevenue = 0; // Base Room Amount
       let totalOtherCharges = 0; // Other Charges
       let totalCGST = 0;
       let totalSGST = 0;
       let totalAmount = 0;
       let advanceAmount = 0;

       rangeStays.forEach(stay => {
          const totalPrice = Number(stay.price) || 0; // Total includes everything
          const otherCharges = Number(stay.otherCharges) || 0;
          const gstRate = Number(stay.gstRate) || 12;
          
          // Room Total (With GST) = Total - OtherCharges
          const roomTotalInclusive = totalPrice - otherCharges;

          // Room Base = Room Total / (1 + GST)
          const roomBase = roomTotalInclusive / (1 + gstRate / 100);
          
          const gstAmount = roomTotalInclusive - roomBase;
          const cgst = gstAmount / 2;
          const sgst = gstAmount / 2;
          
          totalRevenue += roomBase;
          totalOtherCharges += otherCharges;
          totalCGST += cgst;
          totalSGST += sgst;
          totalAmount += totalPrice;
          advanceAmount += Number(stay.advanceAmount) || 0;
       });
       
       const pendingAmount = totalAmount - advanceAmount;

       // Get unique payment methods (In Range)
       const paymentMethods = [...new Set(rangeStays
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
          index + 1, // Sr. No
          escapeCsv(c.name),
          escapeCsv(c.phone),
          escapeCsv(c.address),
          escapeCsv(idType),  
          escapeCsv(idNumber ? `\t${idNumber}` : ''),
          escapeCsv(c.customerType || c.guestType || 'Regular'),
          registered,
          lastVisit,
          lastGuests,
          lastChildren,
          visitCountInRange,
          lifetimeVisits,
          totalRevenue.toFixed(2),
          totalOtherCharges.toFixed(2),
          totalCGST.toFixed(2),
          totalSGST.toFixed(2),
          totalAmount.toFixed(2),
          advanceAmount.toFixed(2),
          pendingAmount.toFixed(2),
          escapeCsv(paymentMethods),
          escapeCsv(regNos),
          escapeCsv(bookingIds),
          escapeCsv(allRooms)
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

  const handlePrintReport = async (customer, action) => {
    // Find Latest Allocation
    const custStays = allocations
        .filter(a => String(a.customerId) === String(customer.id))
        .sort((a,b) => new Date(b.checkIn) - new Date(a.checkIn));

    if (custStays.length === 0) {
        alert("No booking history found for this customer.");
        return;
    }

    const allocation = custStays[0]; // Use Latest
    const cust = customer; // Alias
    const employee = employees.find(e => String(e.id) === String(allocation.employeeId));

     // Prepare Calculation Data
     const gstRate = Number(allocation.gstRate || 0);
     const selections = allocation.roomSelections || [{ 
         roomId: allocation.roomId, 
         numberOfGuests: allocation.numberOfGuests || 1, 
         stayDuration: allocation.stayDuration || 1, 
         bookingPlatform: allocation.bookingPlatform || 'Counter',
         basePrice: allocation.basePrice,
         roomType: rooms.find(r => String(r.id) === String(allocation.roomId))?.type || ''
     }];

     let taxableValue = 0;
     let totalTax = 0;
     
     const roomWiseGst = selections.map(s => {
         const bp = parseFloat(s.basePrice) || 0;
         const dur = parseInt(s.stayDuration) || 1;
         const lineTaxable = bp * dur;
         const lineGst = lineTaxable * (gstRate / 100);
         taxableValue += lineTaxable;
         totalTax += lineGst;
         return {
             ...s,
             lineTaxable,
             lineCgst: lineGst / 2,
             lineSgst: lineGst / 2,
             lineTotalTax: lineGst
         };
     });

     const otherCharges = parseFloat(allocation.otherCharges) || 0;
     const totalTaxRounded = Math.round(totalTax);
     const totalInclusivePriceRounded = Math.round(taxableValue + totalTax + otherCharges);
     const cgstAmountRounded = totalTaxRounded / 2;
     const sgstAmountRounded = totalTaxRounded / 2;

     let invoiceNumber = allocation.invoiceNumber;
     
     if (!invoiceNumber) {
        try {
           const q = query(collection(db, "invoices"), where("allocationId", "==", allocation.id));
           const querySnapshot = await getDocs(q);
           if (!querySnapshot.empty) {
              invoiceNumber = querySnapshot.docs[0].data().invoiceNumber;
           } else {
              const d = new Date();
              const currentMonth = d.getMonth(); 
              const currentYear = d.getFullYear();
              const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
               const fyString = `${startYear}/${String(startYear + 1).slice(-2)}`; 
               const baseSeq = (startYear === 2025) ? 8781 : 1;
               let nextNum = baseSeq;

               try {
                   const lastInvQuery = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1));
                   const lastInvSnap = await getDocs(lastInvQuery);
                   if (!lastInvSnap.empty) {
                      const lastData = lastInvSnap.docs[0].data();
                      const lastId = String(lastData.invoiceNumber || '');
                      
                      if (startYear === 2025) {
                          const lastSeq = parseInt(lastId, 10);
                          if (!isNaN(lastSeq)) {
                             nextNum = Math.max(8781, lastSeq + 1);
                          }
                      } else if (lastId.startsWith(fyString)) {
                          const parts = lastId.split('/');
                          const lastSeq = parseInt(parts[parts.length - 1], 10);
                          if (!isNaN(lastSeq)) {
                              nextNum = Math.max(baseSeq, lastSeq + 1);
                          }
                      }
                   }
               } catch (err) { console.warn("Sequence fetch failed", err); }
               
               if (startYear === 2025) {
                   invoiceNumber = String(nextNum);
               } else {
                   invoiceNumber = `${fyString}/${String(nextNum).padStart(4, '0')}`;
               }

              await addDoc(collection(db, "invoices"), {
                 invoiceNumber: invoiceNumber,
                 allocationId: allocation.id,
                 customerId: allocation.customerId,
                 customerName: cust?.name || 'Guest',
                  amount: totalInclusivePriceRounded,
                  createdAt: new Date().toISOString()
              });
              await updateDoc(doc(db, "allocations", allocation.id), { invoiceNumber: invoiceNumber });
              
              allocation.invoiceNumber = invoiceNumber;
           }
        } catch (error) { invoiceNumber = `INV-${Date.now().toString().slice(-4)}`; }
     }

     // Generate HTML
     const invoiceHTML = `
       <html>
         <head>
           <title>Invoice #${invoiceNumber}</title>
           <style>
             @page { size: A4; margin: 15mm; }
             body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; line-height: 1.4; }
             .invoice-box { width: 100%; margin: auto; padding: 0 30px; box-sizing: border-box; }
             
             /* Customer Section */
             .customer-info { margin-bottom: 15px; }
             .info-row { display: flex; margin-bottom: 2px; }
             .info-label { width: 110px; font-weight: bold; flex-shrink: 0; }
             .info-value { flex-grow: 1; }

             /* Table Styles */
             table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
             table, th, td { border: 1px solid #000; }
             th { background-color: #f2f2f2; padding: 8px 4px; text-align: center; font-size: 10px; font-weight: bold; text-transform: uppercase; }
             td { padding: 8px 4px; vertical-align: middle; font-size: 11px; }
             .text-center { text-align: center; }
             .text-right { text-align: right; }

             /* GST Summary */
             .gst-analysis th { background-color: #f9f9f9; }
             
             /* Calculation Section */
             .total-section { display: flex; justify-content: space-between; margin-top: 10px; }
             .words-section { width: 65%; font-style: italic; }
             .calc-box { width: 30%; }
             .calc-row { display: flex; justify-content: space-between; padding: 2px 0; }
             .calc-label { font-weight: bold; }

             /* Footer Section */
             .footer { margin-top: 40px; }
             .sig-area { display: flex; justify-content: space-between; margin-top: 50px; }
             .sig-box { text-align: center; width: 220px; }
             .sig-line { border-top: 1px solid #000; margin-bottom: 4px; }
             .jurisdiction { font-weight: bold; text-align: center; margin-top: 20px; font-size: 10px; text-transform: uppercase; }
             .computer-gen { text-align: center; font-size: 8px; color: #666; margin-top: 5px; }
           </style>
         </head>
         <body>
           <div class="invoice-box">
             <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px;">
               <div style="text-align: left;">
                  <img src="${logoImage}" alt="Logo" style="height: 90px; width: 180px;" />
               </div>

               <div style="text-align: right;">
                 <div style="font-size: 22px; font-weight: bold; margin-bottom: 4px;">Balaji Lodging</div>
                 <div style="font-size: 10px; line-height: 1.4;">
                   Opp. Railway Station, Near Shriyash Hospital, Pandharpur 413304.<br>
                   Phone : +91 9284793956 / 8080248271<br>
                   GSTIN/UIN: 27AAPFB9198M1ZE<br>
                   Email: balajilodgingpandharpur@gmail.com
                 </div>
               </div>
             </div>

             <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px;">
                <div style="flex: 1;">
                   <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 2px;">CUSTOMER DETAILS</div>
                   <div class="info-row"><span class="info-label">Booked By :</span> <span class="info-value" style="font-weight:bold;">${employee?.name || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Name :</span> <span class="info-value" style="font-weight:bold;">${cust?.name || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Address :</span> <span class="info-value">${cust?.address || '---'}</span></div>
                   <div class="info-row"><span class="info-label">GSTIN :</span> <span class="info-value">${cust?.gstin || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Company :</span> <span class="info-value">${cust?.companyName || '---'}</span></div>
                   <div class="info-row"><span class="info-label">Phone :</span> <span class="info-value">${cust?.phone || '---'}</span></div>
                </div>

                <div style="flex: 0.8;">
                   <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 2px;">INVOICE DETAILS</div>
                   <div style="display: grid; grid-template-columns: auto auto; gap: 4px 10px; font-size: 11px;">
                      <span style="font-weight: bold;">Invoice No :</span> <span style="font-weight:bold;">${invoiceNumber}</span>
                      <span style="font-weight: bold;">Invoice Date :</span> <span>${(() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}</span>
                      <span style="font-weight: bold;">Arrival :</span> <span>${formatBillDate(allocation.checkIn)}</span>
                      <span style="font-weight: bold;">Departure :</span> <span>${formatBillDate(allocation.actualCheckOut || allocation.checkOut)}</span>
                      <span style="font-weight: bold;">Reg. No :</span> <span>${allocation.registrationNumber || '---'}</span>
                      <span style="font-weight: bold;">Booking ID :</span> <span>${allocation.externalBookingId || '0'}</span>
                   </div>
                </div>
             </div>

             <table>
               <thead>
                 <tr>
                   <th style="width: 30px;">Sr.No</th>
                   <th style="width: 60px;">Room No</th>
                   <th style="width: 40px;">GST</th>
                   <th style="width: 60px;">Guests</th>
                   <th style="width: 40px;">Childs</th>
                   <th style="width: 40px;">Days</th>
                   <th>Booking Type</th>
                   <th>Room Type</th>
                   <th style="width: 80px;">Rate</th>
                   <th style="width: 90px;">Total</th>
                 </tr>
               </thead>
                <tbody>
                  ${selections.map((s, i) => {
                    const rNum = getRoomNumber(s.roomId);
                    const lineTotal = (parseFloat(s.basePrice) || 0) * (parseInt(s.stayDuration) || 1);
                    return `
                      <tr>
                        <td class="text-center">${i + 1}</td>
                        <td class="text-center">${rNum}</td>
                        <td class="text-center">${gstRate.toFixed(2)}%</td>
                        <td class="text-center">${String(s.numberOfGuests).padStart(2, '0')}</td>
                        <td class="text-center">${String(s.numberOfChildren || 0).padStart(2, '0')}</td>
                        <td class="text-center">${s.stayDuration}</td>
                        <td class="text-center">${s.bookingPlatform || allocation.bookingPlatform}</td>
                        <td class="text-center">${s.roomType || '---'}</td>
                        <td class="text-center">${(parseFloat(s.basePrice) || 0).toFixed(2)}</td>
                        <td class="text-center">${lineTotal.toFixed(2)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
             </table>

             <div class="total-section" style="display: flex; justify-content: flex-end; padding-top: 0px; margin-top: 5px;">
                <div style="text-align: right; padding-right: 15px; display: flex; flex-direction: column; gap: 0; font-weight: bold;">
                  <div style="height: 24px; display: flex; align-items: center; justify-content: flex-end;">Other</div>
                  <div style="height: 24px; display: flex; align-items: center; justify-content: flex-end;">Subtotal</div>
                  <div style="height: 24px; display: flex; align-items: center; justify-content: flex-end;">SGST</div>
                  <div style="height: 24px; display: flex; align-items: center; justify-content: flex-end;">CGST</div>
                  <div style="height: 24px; display: flex; align-items: center; justify-content: flex-end;">Total</div>
                </div>
                <div class="calc-box" style="width: 160px;">
                  <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                    <tr style="height: 24px;">
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: center; width: 30px;">Rs.</td>
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: right;">${otherCharges.toFixed(2)}</td>
                    </tr>
                    <tr style="height: 24px;">
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: center;">Rs.</td>
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: right;">${taxableValue.toFixed(2)}</td>
                    </tr>
                    <tr style="height: 24px;">
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: center;">Rs.</td>
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: right;">${cgstAmountRounded.toFixed(2)}</td>
                    </tr>
                    <tr style="height: 24px;">
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: center;">Rs.</td>
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: right;">${sgstAmountRounded.toFixed(2)}</td>
                    </tr>
                    <tr style="height: 24px; font-weight: bold;">
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: center;">Rs.</td>
                      <td style="border: 1px solid #000; padding: 0 8px; text-align: right;">${totalInclusivePriceRounded.toFixed(2)}</td>
                    </tr>
                  </table>
                </div>
              </div>

              <div style="margin-top: 15px; margin-bottom: 20px;">
                <div style="margin-bottom: 5px;"><strong>In Words:</strong> ${numberToWords(totalInclusivePriceRounded)}</div>
                <div><strong>Narration :</strong> ${allocation.narration || allocation.paymentType || '---'}</div>
              </div>

             <div style="margin-top: 25px; font-weight:bold; text-decoration: underline; margin-bottom: 5px;">GST Breakdown</div>
             <table class="gst-analysis">
               <thead>
                 <tr>
                   <th rowspan="2">Sr.No</th>
                   <th rowspan="2">HSN/SAC</th>
                   <th rowspan="2">Taxable Value</th>
                   <th colspan="2">CGST</th>
                   <th colspan="2">SGST</th>
                   <th rowspan="2">Total Tax</th>
                 </tr>
                 <tr>
                   <th>Tax</th>
                   <th>Amount</th>
                   <th>Tax</th>
                   <th>Amount</th>
                 </tr>
               </thead>
               <tbody>
                 ${roomWiseGst.map((s, i) => `
                   <tr>
                     <td class="text-center">${i + 1}</td>
                     <td class="text-center">${allocation.hsnSacNumber || '996311'}</td>
                     <td class="text-center">${s.lineTaxable.toFixed(2)}</td>
                     <td class="text-center">${(gstRate / 2).toFixed(2)}%</td>
                     <td class="text-center">${s.lineCgst.toFixed(2)}</td>
                     <td class="text-center">${(gstRate / 2).toFixed(2)}%</td>
                     <td class="text-center">${s.lineSgst.toFixed(2)}</td>
                     <td class="text-center">${s.lineTotalTax.toFixed(2)}</td>
                   </tr>
                 `).join('')}
                 <tr style="font-weight:bold; background-color: #f9f9f9;">
                   <td colspan="2" class="text-center">Total</td>
                   <td class="text-center">${taxableValue.toFixed(2)}</td>
                   <td></td>
                   <td class="text-center">${cgstAmountRounded.toFixed(2)}</td>
                   <td></td>
                   <td class="text-center">${sgstAmountRounded.toFixed(2)}</td>
                   <td class="text-center">${totalTaxRounded.toFixed(2)}</td>
                 </tr>
               </tbody>
             </table>
             
             <div style="margin-bottom: 20px;"><strong>Tax Amount (In Words):</strong> ${numberToWords(totalTaxRounded)}</div>

             <div class="info-row"><span class="info-label" style="width: 80px;">Pay Details :</span> <span class="info-value" style="font-weight:bold; font-size: 14px; text-decoration: underline;">₹${totalInclusivePriceRounded.toFixed(2)} ${allocation.paymentType}</span></div>

             <div class="sig-area">
               <div class="sig-box">
                 <div class="sig-line"></div>
                 <div style="font-size: 10px; font-weight:bold;">Customer's Signature</div>
               </div>
               <div class="sig-box">
                 <div class="sig-line"></div>
                 <div style="font-size: 10px; font-weight:bold;">For Balaji Lodging<br>(Authorized Signatory)</div>
               </div>
             </div>

             <div class="jurisdiction">SUBJECT TO PANDHARPUR JURISDICTION</div>
             <div class="computer-gen">It is computer generated invoice,  hence does not require stamp and signature.</div>
           </div>
         </body>
       </html>
     `;

     if (action === 'print') {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(invoiceHTML);
        printWindow.document.close();
        printWindow.onload = function() {
           setTimeout(() => {
             printWindow.print();
           }, 500); 
        };
     } else {
        const element = document.createElement('div');
        element.innerHTML = invoiceHTML;
        const opt = {
           margin: 0,
           filename: `Invoice_${invoiceNumber}.pdf`,
           image: { type: 'jpeg', quality: 0.98 },
           html2canvas: { scale: 2, useCORS: true },
           jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
     }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] space-y-2">
      
      {/* Top Section (Fixed) */}
      <div className="flex-none space-y-3">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Customer Ledger</h1>
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
                 <p className="text-indigo-100 text-xs font-black uppercase tracking-wider">Total Customers</p>
                 <p className="text-3xl font-black text-white mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                 <Users size={24} className="text-white" />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
              <div>
                 <p className="text-amber-100 text-xs font-black uppercase tracking-wider">Regular Customers</p>
                 <p className="text-3xl font-black text-white mt-1">{stats.regulars}</p>
              </div>
               <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                 <UserCheck size={24} className="text-white" />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-xl text-white shadow-lg flex items-center justify-between transform transition-all hover:scale-[1.02]">
              <div>
                 <p className="text-emerald-100 text-xs font-black uppercase tracking-wider">Active Customers </p>
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
              placeholder="Search customer by name or phone..." 
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
                    type={dateFilterFocus.start ? 'date' : 'text'}
                    value={dateFilterFocus.start ? dateRange.start : formatDateForFilter(dateRange.start)}
                    onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} 
                    onFocus={() => setDateFilterFocus(prev => ({ ...prev, start: true }))}
                    onBlur={() => setDateFilterFocus(prev => ({ ...prev, start: false }))}
                    className="bg-transparent text-sm font-medium text-gray-700 outline-none w-28 cursor-pointer" 
                    placeholder="DD/MM/YYYY"
                  />
               </div>
               <div className="w-[1px] h-5 bg-gray-300"></div>
               <div className="flex items-center gap-2 px-3 py-1">
                  <span className="text-xs font-bold text-gray-500 uppercase">To</span>
                  <input 
                    type={dateFilterFocus.end ? 'date' : 'text'}
                    value={dateFilterFocus.end ? dateRange.end : formatDateForFilter(dateRange.end)}
                    onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} 
                    onFocus={() => setDateFilterFocus(prev => ({ ...prev, end: true }))}
                    onBlur={() => setDateFilterFocus(prev => ({ ...prev, end: false }))}
                    className="bg-transparent text-sm font-medium text-gray-700 outline-none w-28 cursor-pointer" 
                    placeholder="DD/MM/YYYY"
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
          <table className="w-full min-w-[700px] text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200 shadow-sm">
              <tr>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-16 text-center">Sr. No</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Name</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Contact Info</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Address</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Identification</th>
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
                      <td className="px-6 py-2.5 text-center">
                        <span className="text-sm font-bold text-gray-900">{customer.name}</span>
                      </td>
                      <td className="px-6 py-2.5 text-center">
                         <div className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-700">
                            <Phone size={14} className="text-gray-400" />
                            {customer.phone}
                         </div>
                      </td>
                      <td className="px-6 py-2.5 text-center">
                         <div className="flex items-center justify-center gap-2 text-xs font-medium text-gray-500 max-w-[200px] mx-auto">
                            <MapPin size={14} className="text-gray-300 shrink-0" />
                            <span className="truncate" title={customer.address}>{customer.address || '---'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-600 bg-white border border-gray-100 px-2 py-1 rounded-md w-fit mx-auto shadow-sm">
                            <FileText size={14} className="text-indigo-300" />
                            {customer.idProof}
                         </div>
                      </td>
                      <td className="px-6 py-2.5 text-center">
                         <div className="flex items-center justify-center gap-2">
                             <button onClick={() => { setSelectedGuest(customer); setShowViewModal(true); }} className="p-1.5 bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-100 rounded-lg transition-all shadow-sm group-hover:border-indigo-200" title="View History">
                               <Eye size={16} />
                             </button>

                             <button 
                               onClick={() => handlePrintReport(customer, 'print')}
                               className="p-1.5 bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-100 rounded-lg transition-all shadow-sm group-hover:border-emerald-200"
                               title="Print Statement"
                             >
                               <Printer size={16} />
                             </button>

                             <button 
                               onClick={() => handlePrintReport(customer, 'download')}
                               className="p-1.5 bg-white text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-100 rounded-lg transition-all shadow-sm group-hover:border-blue-200"
                               title="Download PDF"
                             >
                               <Download size={16} />
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
                        No customers found matching your criteria.
                     </td>
                  </tr>
               )}
            </tbody>
          </table>
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
                  <button onClick={() => setShowViewModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"><X size={24} /></button>
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
                                <p className="text-xs font-medium text-gray-500">Registered: {(() => {
                                   if (!selectedGuest.createdAt) return 'Unknown';
                                   const d = new Date(selectedGuest.createdAt);
                                   return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                                })()}</p>
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
                        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-1 h-full min-h-[100px]">
                           <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Financial Summary</p>
                              {(() => {
                                 const stays = allocations.filter(a => String(a.customerId) === String(selectedGuest.id));
                                 let totalRoomAmount = 0;
                                 let totalOtherAmount = 0;
                                 let totalGst = 0;
                                 let grandTotal = 0;
                                 let totalPaid = 0;

                                 stays.forEach(stay => {
                                     // 1. Calculate Room Amount
                                     let stayRoomAmount = 0;
                                     if (stay.roomSelections && stay.roomSelections.length > 0) {
                                         stay.roomSelections.forEach(s => {
                                              const base = Number(s.basePrice) || 0;
                                              const days = Number(s.stayDuration) || 1;
                                              stayRoomAmount += base * days;
                                         });
                                     } else {
                                          const base = Number(stay.basePrice) || 0;
                                          const days = Number(stay.stayDuration) || 1;
                                          stayRoomAmount = base * days;
                                     }

                                     // 2. Get Other Charges
                                     const stayOther = Number(stay.otherCharges) || 0;
                                     
                                     // 3. Calculate GST (Room Amount only)
                                     const rate = Number(stay.gstRate) || 0;
                                     const stayGst = stayRoomAmount * (rate / 100);

                                     // 4. Stay Total
                                     const stayTotal = (stayRoomAmount + stayOther + stayGst) || Number(stay.price || 0);

                                     totalRoomAmount += stayRoomAmount;
                                     totalOtherAmount += stayOther;
                                     totalGst += stayGst;
                                     grandTotal += stayTotal;
                                     totalPaid += (Number(stay.advanceAmount) || 0);
                                 });

                                 const totalBalance = Math.max(0, Math.round(grandTotal - totalPaid));

                                 return (
                                     <div className="flex flex-col gap-0.5">
                                         <div className="flex justify-between items-baseline text-xs font-medium text-gray-500">
                                             <span>Room Amount:</span>
                                             <span>₹{totalRoomAmount.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                                         </div>
                                         <div className="flex justify-between items-baseline text-xs font-medium text-gray-500">
                                             <span>Other Amount:</span>
                                             <span>₹{totalOtherAmount.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                                         </div>
                                         <div className="flex justify-between items-baseline text-xs font-medium text-gray-500">
                                             <span>GST:</span>
                                             <span>₹{totalGst.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                                         </div>
                                         <div className="flex justify-between items-baseline text-xs font-medium text-emerald-600">
                                             <span>Total Paid:</span>
                                             <span>₹{totalPaid.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                                         </div>
                                         <div className="flex justify-between items-baseline pt-1 mt-1 border-t border-gray-100">
                                             <span className="text-xs font-bold text-gray-700 uppercase">Total Bill:</span>
                                             <span className="text-xl font-black text-gray-900">₹{grandTotal.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                                         </div>
                                         {totalBalance > 0 && (
                                            <div className="flex justify-between items-baseline mt-1 bg-rose-50 p-2 rounded-lg border border-rose-100">
                                                <span className="text-xs font-black text-rose-600 uppercase">Total Balance Due:</span>
                                                <span className="text-xl font-black text-rose-600">₹{totalBalance.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                                            </div>
                                         )}
                                     </div>
                                 );
                              })()}
                           </div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                           <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Last Visit</p>
                              {(() => {
                                 const stays = allocations.filter(a => String(a.customerId) === String(selectedGuest.id));
                                 if (stays.length === 0) return <p className="text-xl font-bold text-gray-600">N/A</p>;
                                 const lastDate = new Date(Math.max(...stays.map(a => new Date(a.checkIn).getTime())));
                                 return <p className="text-xl font-bold text-gray-800">{(() => {
                                    const d = new Date(lastDate);
                                    let hrs = d.getHours();
                                    const mins = String(d.getMinutes()).padStart(2, '0');
                                    const ampm = hrs >= 12 ? 'PM' : 'AM';
                                    hrs = hrs % 12;
                                    hrs = hrs ? hrs : 12;
                                    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
                                 })()}</p>;
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
                                                    <span className="text-sm font-bold text-gray-900 block">
                                                       {stay.roomSelections && stay.roomSelections.length > 0 ? (
                                                          <div className="flex flex-col gap-1">
                                                             {stay.roomSelections.map((s, i) => {
                                                                const r = rooms.find(rm => String(rm.id) === String(s.roomId));
                                                                const days = parseInt(s.stayDuration) || 1;
                                                                const base = parseFloat(s.basePrice) || 0;
                                                                const roomTotal = base * days;
                                                                
                                                                return (
                                                                   <div key={i} className="flex items-center gap-2 text-xs">
                                                                      <span className="font-bold text-gray-800">Room {r?.roomNumber || 'Unknown'}</span>
                                                                      <span className="text-gray-500">({s.roomType || r?.type})</span>
                                                                      <span className="text-gray-400 text-[10px]">•</span>
                                                                      <span className="font-medium text-emerald-600">₹{roomTotal.toLocaleString('en-IN')}</span>
                                                                      <span className="text-gray-400 text-[10px]">({days} days)</span>
                                                                   </div>
                                                                );
                                                             })}
                                                          </div>
                                                       ) : (
                                                          <div className="flex items-center gap-2 text-xs">
                                                             <span className="font-bold text-gray-800">Room {room?.roomNumber || 'Unknown'}</span>
                                                             <span className="text-gray-500">({room?.type})</span>
                                                             {/* Fallback for old single-room structure if price details aren't in selections */}
                                                          </div>
                                                       )}
                                                    </span>
                                                </div>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${stay.status === 'Checked-Out' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                                   {stay.status === 'Checked-Out' ? 'Completed' : 'Active'}
                                                </span>
                                             </div>
                                             
                                             <div className="flex items-center gap-3 mb-2 text-xs font-medium text-gray-600">
                                                  <span className="flex items-center gap-1"><Users size={12} className="text-gray-400"/> {stay.numberOfGuests || 1} Guests</span>
                                                  {(stay.numberOfChildren > 0) && <span className="flex items-center gap-1 text-rose-500 font-bold"><Users size={12} className="text-rose-400"/> {stay.numberOfChildren} Children</span>}
                                             </div>
                                             
                                             <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                                 <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Check In</span>
                                                    <span className="font-bold text-gray-800">{(() => {
                                                       const d = new Date(stay.checkIn);
                                                       let hrs = d.getHours();
                                                       const mins = String(d.getMinutes()).padStart(2, '0');
                                                       const ampm = hrs >= 12 ? 'PM' : 'AM';
                                                       hrs = hrs % 12;
                                                       hrs = hrs ? hrs : 12;
                                                       return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
                                                    })()}</span>
                                                 </div>
                                                 <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Check Out</span>
                                                    <span className="font-bold text-gray-800">{(() => {
                                                       const d = stay.actualCheckOut ? new Date(stay.actualCheckOut) : new Date(stay.checkOut);
                                                       let hrs = d.getHours();
                                                       const mins = String(d.getMinutes()).padStart(2, '0');
                                                       const ampm = hrs >= 12 ? 'PM' : 'AM';
                                                       hrs = hrs % 12;
                                                       hrs = hrs ? hrs : 12;
                                                       return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
                                                    })()}</span>
                                                 </div>
                                             </div>
                                             
                                             <div className="flex gap-2 mb-3">
                                                {stay.registrationNumber && (
                                                   <span className="inline-block px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-600 border border-gray-200">
                                                      Reg: {stay.registrationNumber}
                                                   </span>
                                                )}
                                                {stay.externalBookingId && (
                                                   <span className="inline-block px-2 py-1 bg-indigo-50 rounded text-[10px] font-bold text-indigo-600 border border-indigo-100">
                                                      ID: {stay.externalBookingId}
                                                   </span>
                                                )}
                                             </div>

                                              {(stay.price) && (
                                                <div className="flex flex-col gap-1 pt-2 border-t border-gray-100 text-xs text-gray-600">
                                                   {(() => {
                                                        // 1. Calculate Room Amount
                                                        let stayRoomAmount = 0;
                                                        if (stay.roomSelections && stay.roomSelections.length > 0) {
                                                            stay.roomSelections.forEach(s => {
                                                                    const base = Number(s.basePrice) || 0;
                                                                    const days = Number(s.stayDuration) || 1;
                                                                    stayRoomAmount += base * days;
                                                            });
                                                        } else {
                                                            const base = Number(stay.basePrice) || 0;
                                                            const days = Number(stay.stayDuration) || 1;
                                                            stayRoomAmount = base * days;
                                                        }

                                                        // 2. Get Other Charges
                                                        const stayOther = Number(stay.otherCharges) || 0;
                                                        
                                                        // 3. Calculate GST (Room Amount only)
                                                        const rate = Number(stay.gstRate) || 0;
                                                        const stayGst = stayRoomAmount * (rate / 100);

                                                        // 4. Stay Total
                                                        const stayTotal = (stayRoomAmount + stayOther + stayGst) || Number(stay.price || 0);
                                                        const balanceDue = Math.max(0, Math.round(stayTotal - (Number(stay.advanceAmount) || 0)));

                                                        return (
                                                            <>
                                                                <div className="flex justify-between">
                                                                   <span>Room: <span className="font-bold">₹{stayRoomAmount.toLocaleString('en-IN')}</span></span>
                                                                   <span>Other: <span className="font-bold">₹{stayOther.toLocaleString('en-IN')}</span></span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                   <span>GST: <span className="font-bold">₹{stayGst.toLocaleString('en-IN')}</span></span>
                                                                   <span>Total: <span className="font-bold text-indigo-600">₹{stayTotal.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span></span>
                                                                </div>
                                                                <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                                                                    <span>Paid: <span className="font-bold text-emerald-600">₹{(Number(stay.advanceAmount)||0).toLocaleString('en-IN')}</span></span>
                                                                    {balanceDue > 0 && (
                                                                       <span className="bg-rose-50 px-2 py-0.5 rounded text-[10px] font-black text-rose-600 border border-rose-100">
                                                                          Due: ₹{balanceDue.toLocaleString('en-IN')}
                                                                       </span>
                                                                    )}
                                                                </div>
                                                            </>
                                                        );
                                                   })()}
                                                   <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                                      <span>via {stay.paymentType || 'Cash'}</span>
                                                      {stay.narration && <span className="italic truncate max-w-[150px]" title={stay.narration}>{stay.narration}</span>}
                                                   </div>
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
