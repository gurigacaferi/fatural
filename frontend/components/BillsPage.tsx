"use client";

import { useState, useEffect } from "react";
import { Download, Search, RefreshCw } from "lucide-react";

const API_URL = "https://fatural-api-p4woo2xebq-ey.a.run.app";

interface BillsPageProps {
  companyId: string;
}

const ATK_CODES: { [key: string]: string } = {
  "665-04": "Food & Beverages",
  "665-09": "Fuel",
  "665-11": "Professional Services",
  "665-12": "Office Supplies",
  "665-13": "Utilities",
  "665-14": "Transportation",
  "665-15": "Maintenance",
  "665-99": "Other",
};

export default function BillsPage({ companyId }: BillsPageProps) {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetchBills();
    const interval = setInterval(fetchBills, 5000); // Poll for updates
    return () => clearInterval(interval);
  }, []);

  const fetchBills = async () => {
    try {
      const response = await fetch(`${API_URL}/bills`, {
        headers: { "X-Company-Id": companyId },
      });
      const data = await response.json();
      setBills(data.bills || []);
    } catch (error) {
      console.error("Failed to fetch bills:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`${API_URL}/bills/export/csv`, {
        headers: { "X-Company-Id": companyId },
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bills_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const filteredBills = bills.filter((bill) => {
    const matchesSearch =
      bill.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.bill_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || bill.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: string) => {
    const colors: { [key: string]: string } = {
      pending: "bg-yellow-100 text-yellow-800",
      processing: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      duplicate: "bg-gray-100 text-gray-800",
    };
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-medium ${
          colors[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getATKBadge = (items: any[]) => {
    if (!items || items.length === 0) return null;
    const codes = new Set(items.map((item) => item.atk_code).filter(Boolean));
    const firstCode = Array.from(codes)[0] as string;
    if (!firstCode) return null;
    return (
      <span className="px-2 py-1 rounded bg-purple-100 text-purple-800 text-xs font-medium">
        {ATK_CODES[firstCode] || firstCode}
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Bills</h2>
          <p className="text-gray-500 mt-2">
            Manage and export your scanned bills
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by merchant or bill number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={fetchBills}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Merchant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  Loading bills...
                </td>
              </tr>
            ) : filteredBills.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No bills found
                </td>
              </tr>
            ) : (
              filteredBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {bill.vendor_name || "Unknown"}
                    </div>
                    {bill.vendor_tax_number && (
                      <div className="text-sm text-gray-500">
                        NUI: {bill.vendor_tax_number}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {bill.bill_date
                      ? new Date(bill.bill_date).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    €{bill.total_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    {getATKBadge(bill.extracted_data?.line_items)}
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(bill.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
