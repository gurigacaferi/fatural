import { TrendingUp, FileText, CheckCircle, AlertCircle } from "lucide-react";

interface StatsCardsProps {
  stats: any;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Bills",
      value: Object.values(stats.bills_by_status).reduce((a: any, b: any) => a + b, 0),
      icon: FileText,
      color: "bg-blue-500",
    },
    {
      title: "Completed",
      value: stats.bills_by_status.completed || 0,
      icon: CheckCircle,
      color: "bg-green-500",
    },
    {
      title: "Processing",
      value: (stats.bills_by_status.pending || 0) + (stats.bills_by_status.processing || 0),
      icon: AlertCircle,
      color: "bg-yellow-500",
    },
    {
      title: "Total Amount",
      value: `€${stats.total_amount_processed.toFixed(2)}`,
      icon: TrendingUp,
      color: "bg-purple-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
              <div className={`${card.color} p-3 rounded-lg`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
