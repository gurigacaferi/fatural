"use client";

import { useState, useEffect } from "react";
import UploadZone from "./UploadZone";
import StatsCards from "./StatsCards";

const API_URL = "https://fatural-api-p4woo2xebq-ey.a.run.app";

interface DashboardProps {
  companyId: string;
}

export default function Dashboard({ companyId }: DashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/stats`, {
        headers: { "X-Company-Id": companyId },
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-2">
          Upload and manage your bills with AI-powered extraction
        </p>
      </div>

      {stats && <StatsCards stats={stats} />}

      <div className="mt-8">
        <UploadZone companyId={companyId} onUploadComplete={fetchStats} />
      </div>
    </div>
  );
}
