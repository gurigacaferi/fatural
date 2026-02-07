"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import BillsPage from "@/components/BillsPage";
import SettingsPage from "@/components/SettingsPage";

export default function Home() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [companyId] = useState("0944756b-48ce-417b-903c-664cd63cad17");

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-y-auto">
        {currentPage === "dashboard" && <Dashboard companyId={companyId} />}
        {currentPage === "bills" && <BillsPage companyId={companyId} />}
        {currentPage === "settings" && <SettingsPage companyId={companyId} />}
      </main>
    </div>
  );
}
