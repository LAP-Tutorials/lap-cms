"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select";
  
export function AnalyticsOverview() {
  const [days, setDays] = useState("7");

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
        <Card className="border border-neutral-800 bg-transparent text-white rounded-none">
            <CardHeader className="border-b border-neutral-800">
                <CardTitle>Analytics Overview</CardTitle>
                <CardDescription className="text-neutral-400">Loading metrics...</CardDescription>
            </CardHeader>
            <CardContent className="h-[200px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </CardContent>
        </Card>
    );
  }

  if (!data || !data.timeline) {
      return null;
  }

  const totalUsers = data.timeline.reduce((acc: number, curr: any) => acc + curr.users, 0);
  const totalViews = data.timeline.reduce((acc: number, curr: any) => acc + curr.views, 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        // Parse date for prettier label if needed, or use label directly
        const d = new Date(label.substring(0,4) + '-' + label.substring(4,6) + '-' + label.substring(6,8));
        const formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

      return (
        <div className="bg-[#0a0a0a] border border-neutral-800 p-3 text-sm rounded-none shadow-xl">
          <p className="text-neutral-400 mb-2 font-medium">{formattedDate}</p>
          <div className="flex flex-col gap-2">
              <span className="font-bold flex items-center gap-2" style={{ color: '#8a2be2' }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#8a2be2' }} />
                {payload.find((p: any) => p.dataKey === 'users')?.value} Users
              </span>
              <span className="font-bold flex items-center gap-2" style={{ color: '#3b82f6' }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                {payload.find((p: any) => p.dataKey === 'views')?.value} Page Views
              </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border border-neutral-800 bg-transparent text-white rounded-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-neutral-800">
        <div className="space-y-1">
            <CardTitle>L.A.P Docs Overview</CardTitle>
            <CardDescription className="text-neutral-400">Performance metrics</CardDescription>
        </div>
        <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px] bg-transparent border-neutral-800 text-white h-8 rounded-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-neutral-800 text-white rounded-none z-[9999]" position="popper">
                <SelectItem value="7" className="focus:bg-neutral-800 focus:text-white cursor-pointer rounded-none">Last 7 days</SelectItem>
                <SelectItem value="28" className="focus:bg-neutral-800 focus:text-white cursor-pointer rounded-none">Last 28 days</SelectItem>
                <SelectItem value="90" className="focus:bg-neutral-800 focus:text-white cursor-pointer rounded-none">Last 90 days</SelectItem>
            </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex items-center gap-8 mb-6 mt-2 ml-2">
             <div>
                <p className="text-3xl font-bold">{totalUsers.toLocaleString()}</p>
                <p className="text-sm text-neutral-400">Unique Users</p>
             </div>
             <div>
                <p className="text-3xl font-bold">{totalViews.toLocaleString()}</p>
                <p className="text-sm text-neutral-400">Page Views</p>
             </div>
        </div>
        <div className="h-[300px] w-full -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.timeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorUsersSummary" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8a2be2" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8a2be2" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorViewsSummary" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                </defs>
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                    if (!value) return '';
                    const d = new Date(value.substring(0,4) + '-' + value.substring(4,6) + '-' + value.substring(6,8));
                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }}
                dy={10}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
              <Area
                type="monotone"
                dataKey="views"
                stroke="#3b82f6"
                fill="url(#colorViewsSummary)"
                strokeWidth={2}
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#8a2be2"
                fill="url(#colorUsersSummary)"
                strokeWidth={2}
                stackId="2"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
      <div className="border-t border-neutral-800">
        <Button asChild className="w-full bg-transparent hover:bg-neutral-900 text-white border-0 rounded-none h-12" variant="outline">
            <Link href="/analytics" className="flex items-center gap-2 justify-center">
                View Full Analytics <ArrowRight className="h-4 w-4" />
            </Link>
        </Button>
      </div>
    </Card>
  );
}
