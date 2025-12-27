"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { motion } from "framer-motion";
import { Loader2, TrendingUp, Users, Eye, MousePointerClick, Globe, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { subDays } from "date-fns";

type AnalyticsData = {
  timeline: {
    date: string;
    users: number;
    views: number;
    sessions: number;
    engagementDuration: number;
  }[];
  topPages: {
    path: string;
    title: string;
    views: number;
    sessions: number;
  }[];
  devices: {
    device: string;
    users: number;
    sessions: number;
  }[];
  countries: {
    country: string;
    users: number;
    sessions: number;
  }[];
  cities: {
    city: string;
    users: number;
    sessions: number;
  }[];
  browsers: {
      browser: string;
      users: number;
  }[];
  operatingSystems: {
      os: string;
      users: number;
  }[];
  acquisition: {
      source: string;
      users: number;
      sessions: number;
  }[];
  newVsReturning: {
      userType: string;
      users: number;
  }[];
  summary: {
    users: number;
    views: number;
    sessions: number;
    engagementDuration: number;
  };
};


export function AnalyticsDashboard() {
  const [days, setDays] = useState("7");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["analytics", dateRange],
    queryFn: async () => {
      let queryParams = "";
      if (dateRange?.from && dateRange?.to) {
        queryParams = `?from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}`;
      } else {
         queryParams = `?days=7`;
      }

      const res = await fetch(`/api/analytics${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  const totalUsers = useMemo(() => {
    return data?.summary?.users || 0;
  }, [data]);

  const totalViews = useMemo(() => {
    return data?.summary?.views || 0;
  }, [data]);

  const totalSessions = useMemo(() => {
    return data?.summary?.sessions || 0;
  }, [data]);

  const avgViewsPerUser = useMemo(() => {
    if (totalUsers === 0) return "0"; 
    return (totalViews / totalUsers).toFixed(1); 
  }, [totalViews, totalUsers]);

    const totalCountries = useMemo(() => {
        return data?.countries?.length || 0;
    }, [data]);

    const totalCities = useMemo(() => {
        return data?.cities?.length || 0;
    }, [data]);

    const avgEngagementTime = useMemo(() => {
        const totalDuration = data?.summary?.engagementDuration || 0;
        if (totalUsers === 0) return "0s";
        const avgSeconds = totalDuration / totalUsers;
        const minutes = Math.floor(avgSeconds / 60);
        const seconds = Math.floor(avgSeconds % 60);
        return `${minutes}m ${seconds}s`;
    }, [data, totalUsers]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
            <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500">
                <TrendingUp className="h-8 w-8" />
            </div>
            <div className="text-center space-y-1">
                <h3 className="font-semibold text-lg">Could not load Analytics</h3>
                <p className="text-muted-foreground max-w-sm text-sm">
                    Please ensure your Google Analytics credentials are correctly configured in your environment variables.
                </p>
            </div>
        </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Docs Analytics Dashboard</h2> 
          <p className="text-muted-foreground">
            Overview of L.A.P Docs performance and audience. 
          </p>
        </div>
        <div className="flex items-center gap-2">
            <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 border border-neutral-800 rounded-none overflow-hidden gap-px bg-neutral-800">
        <MetricItem
          title="Total Users"
          value={totalUsers.toLocaleString()}
          icon={Users}
          trend="+12% from last period"
        />
        <MetricItem
          title="Page Views"
          value={totalViews.toLocaleString()}
          icon={Eye}
          trend="+8% from last period"
        />
        <MetricItem
          title="Views Per User"
          value={avgViewsPerUser}
          icon={MousePointerClick}
          trend="Stable"
        />
         <MetricItem
          title="Total Countries"
          value={totalCountries.toLocaleString()}
          icon={Globe}
          trend="Global Reach"
        />
         <MetricItem
          title="Total Cities"
          value={totalCities.toLocaleString()}
          icon={MapPin}
          trend="Local Reach"
        />
        <MetricItem
            title="Avg. Engagement Time"
            value={avgEngagementTime}
            icon={Clock}
            trend="Per User"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList 
            className="bg-transparent border-b border-neutral-800 w-full justify-start rounded-none h-auto p-0 overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4 flex-shrink-0">Overview</TabsTrigger>
          <TabsTrigger value="content" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4 flex-shrink-0">Top Content</TabsTrigger>
          <TabsTrigger value="audience" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4 flex-shrink-0">Audience</TabsTrigger>
          <TabsTrigger value="acquisition" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4 flex-shrink-0">Acquisition</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4 pt-4">
            <Card className="border border-neutral-800 bg-transparent shadow-none">
            <CardHeader>
                <CardTitle>Traffic Overview</CardTitle>
                <CardDescription>
                    Traffic trends over the selected period
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="h-[350px] w-full -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8a2be2" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8a2be2" stopOpacity={0} />
                    </linearGradient>
                    </defs>
                    <XAxis
                    dataKey="date"
                    stroke="rgba(255,255,255,0.3)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tickFormatter={(value) => {
                        if (!value) return '';
                        const d = new Date(value.substring(0,4) + '-' + value.substring(4,6) + '-' + value.substring(6,8));
                        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    }}
                    dy={10}
                    />
                    <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                    width={40}
                    />
                    <Tooltip 
                        cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                // Format date from YYYYMMDD
                                const dateStr = label ? String(label) : '';
                                let formattedDate = label;
                                if (dateStr.length === 8) {
                                    const d = new Date(dateStr.substring(0,4) + '-' + dateStr.substring(4,6) + '-' + dateStr.substring(6,8));
                                    formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                                }

                                return (
                                    <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                        <p className="text-white font-medium mb-2">{formattedDate}</p>
                                        <div className="flex flex-col gap-1.5">
                                            {payload.map((entry: any) => (
                                                <div key={entry.name} className="flex items-center gap-2">
                                                    <div 
                                                        className="w-2 h-2 rounded-full" 
                                                        style={{ backgroundColor: entry.color }}
                                                    />
                                                    <span className="text-neutral-400 capitalize">
                                                        {entry.name}:
                                                    </span>
                                                    <span className="text-white font-medium">
                                                        {entry.value.toLocaleString()}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorViews)"
                    strokeWidth={2}
                    />
                    <Area
                    type="monotone"
                    dataKey="users"
                    stroke="#8a2be2"
                    fillOpacity={1}
                    fill="url(#colorUsers)"
                    strokeWidth={2}
                    />
                </AreaChart>
                </ResponsiveContainer>
                </div>
            </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4 pt-4">
             <Card className="col-span-3 border border-neutral-800 bg-transparent shadow-none">
                <CardHeader>
                    <CardTitle>Top Pages</CardTitle>
                    <CardDescription>Most visited content</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-0">
                        {data.topPages.map((page) => (
                            <div key={page.path} className="flex items-center justify-between border-b border-white/20 py-5 last:border-0">
                                <div className="space-y-1">
                                    <p className="font-semibold text-lg">{page.title || page.path}</p>
                                    <p className="text-sm text-white/50">{page.path}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-xl">{page.views.toLocaleString()}</p>
                                    <p className="text-xs text-white/50">Views</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="audience" className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="border border-neutral-800 bg-transparent shadow-none">
                    <CardHeader>
                        <CardTitle>Devices</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.devices} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="device" type="category" width={150} tick={{fill: '#888888', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                                        <p className="text-white font-medium mb-2">{label}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#8884d8]" />
                                                            <span className="text-neutral-400">Users:</span>
                                                            <span className="text-white font-medium">{payload[0].value?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="users" fill="#8884d8" radius={[0, 4, 4, 0]} barSize={30} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-neutral-800 bg-transparent shadow-none">
                    <CardHeader>
                        <CardTitle>New vs Returning</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="flex flex-col h-[300px]">
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.newVsReturning}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="users"
                                            nameKey="userType"
                                        >
                                            {data.newVsReturning?.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#8a2be2'} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                         <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                                            <p className="text-white font-medium mb-2">{payload[0].name === 'new' ? 'New Users' : 'Returning Users'}</p>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill }} />
                                                                <span className="text-neutral-400">Users:</span>
                                                                <span className="text-white font-medium">{payload[0].value?.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                                return null;
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                             <div className="flex justify-center gap-4 p-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                                    <span className="text-sm font-medium text-[#3b82f6]">New</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-[#8a2be2]" />
                                    <span className="text-sm font-medium text-[#8a2be2]">Returning</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="border border-neutral-800 bg-transparent shadow-none">
                    <CardHeader>
                        <CardTitle>Top Cities</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[600px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.cities} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="city" type="category" width={150} tick={{fill: '#888888', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                                        <p className="text-white font-medium mb-2">{label}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                                                            <span className="text-neutral-400">Users:</span>
                                                            <span className="text-white font-medium">{payload[0].value?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="users" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                 <Card className="border border-neutral-800 bg-transparent shadow-none">
                    <CardHeader>
                        <CardTitle>Top Countries</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="h-[600px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.countries} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="country" type="category" width={150} tick={{fill: '#888888', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                                        <p className="text-white font-medium mb-2">{label}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#8a2be2]" />
                                                            <span className="text-neutral-400">Users:</span>
                                                            <span className="text-white font-medium">{payload[0].value?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="users" fill="#8a2be2" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="border border-neutral-800 bg-transparent shadow-none">
                    <CardHeader>
                        <CardTitle>Top Browsers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.browsers} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="browser" type="category" width={150} tick={{fill: '#888888', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                                        <p className="text-white font-medium mb-2">{label}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#2eb886]" />
                                                            <span className="text-neutral-400">Users:</span>
                                                            <span className="text-white font-medium">{payload[0].value?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="users" fill="#2eb886" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                 <Card className="border border-neutral-800 bg-transparent shadow-none">
                    <CardHeader>
                        <CardTitle>Operating Systems</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.operatingSystems} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="os" type="category" width={150} tick={{fill: '#888888', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-[#1a1a1a] border border-white/20 p-3 rounded-lg shadow-xl text-sm">
                                                        <p className="text-white font-medium mb-2">{label}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                                                            <span className="text-neutral-400">Users:</span>
                                                            <span className="text-white font-medium">{payload[0].value?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="users" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
        
        <TabsContent value="acquisition" className="space-y-4 pt-4">
             <Card className="border border-neutral-800 bg-transparent shadow-none">
                <CardHeader>
                    <CardTitle>Traffic Sources</CardTitle>
                    <CardDescription>Where are your users coming from?</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow className="border-neutral-800 hover:bg-neutral-900/50">
                                <TableHead className="text-neutral-400">Source / Medium</TableHead>
                                <TableHead className="text-right text-neutral-400">Users</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.acquisition?.map((source) => (
                                <TableRow key={source.source} className="border-neutral-800 hover:bg-neutral-900/50">
                                    <TableCell className="font-medium">{source.source}</TableCell>
                                    <TableCell className="text-right">{source.users.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function MetricItem({ title, value, icon: Icon, trend }: { title: string; value: string; icon: any; trend: string }) {
  return (
    <div className="flex flex-col p-6 bg-black border border-neutral-800">
        <div className="flex items-center justify-between gap-4 mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
            <Icon className="h-4 w-4 text-muted-foreground opacity-50" />
        </div>
        <div className="mt-1">
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{trend}</p>
        </div>
    </div>
  );
}
