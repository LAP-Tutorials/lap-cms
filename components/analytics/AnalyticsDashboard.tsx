"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { motion } from "framer-motion";
import { Loader2, TrendingUp, Users, Eye, MousePointerClick } from "lucide-react";
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

type AnalyticsData = {
  timeline: {
    date: string;
    users: number;
    views: number;
    sessions: number;
  }[];
  topPages: {
    path: string;
    title: string;
    views: number;
  }[];
  devices: {
    device: string;
    users: number;
  }[];
  countries: {
    country: string;
    users: number;
  }[];
  acquisition: {
      source: string;
      users: number;
  }[];
};

export function AnalyticsDashboard() {
  const [days, setDays] = useState("7");

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

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

  // Calculate totals
  const totalUsers = data.timeline.reduce((acc, curr) => acc + curr.users, 0);
  const totalViews = data.timeline.reduce((acc, curr) => acc + curr.views, 0);
  const avgViewsPerUser = totalUsers > 0 ? (totalViews / totalUsers).toFixed(1) : "0";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics Overview</h2>
          <p className="text-muted-foreground">
            Monitor your website performance and audience growth.
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="28">Last 28 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Users"
          value={totalUsers.toLocaleString()}
          icon={Users}
          trend="+12% from last period"
        />
        <MetricCard
          title="Page Views"
          value={totalViews.toLocaleString()}
          icon={Eye}
          trend="+8% from last period"
        />
        <MetricCard
          title="Views Per User"
          value={avgViewsPerUser}
          icon={MousePointerClick}
          trend="Stable"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">Top Content</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
            <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader>
                <CardTitle>Traffic Overview</CardTitle>
                <CardDescription>
                    Traffic trends over the selected period
                </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeline}>
                    <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                    </linearGradient>
                    </defs>
                    <XAxis
                    dataKey="date"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                        if (!value) return '';
                        const d = new Date(value.substring(0,4) + '-' + value.substring(4,6) + '-' + value.substring(6,8));
                        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    }}
                    />
                    <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                    />
                    <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#8884d8"
                    fillOpacity={1}
                    fill="url(#colorViews)"
                    strokeWidth={2}
                    />
                    <Area
                    type="monotone"
                    dataKey="users"
                    stroke="#82ca9d"
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

        <TabsContent value="content" className="space-y-4">
             <Card className="col-span-3 shadow-sm hover:shadow-md transition-shadow duration-200">
                <CardHeader>
                    <CardTitle>Top Pages</CardTitle>
                    <CardDescription>Most visited content</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Page</TableHead>
                                <TableHead className="text-right">Views</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.topPages.map((page) => (
                                <TableRow key={page.path}>
                                    <TableCell className="font-medium truncate max-w-[300px]" title={page.title || page.path}>
                                        {page.title || page.path}
                                        <div className="text-xs text-muted-foreground">{page.path}</div>
                                    </TableCell>
                                    <TableCell className="text-right">{page.views.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="audience" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Devices</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.devices} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="device" type="category" width={80} />
                                    <Tooltip cursor={{fill: 'transparent'}} />
                                    <Bar dataKey="users" fill="#8884d8" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Top Countries</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.countries} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="country" type="category" width={100} />
                                    <Tooltip cursor={{fill: 'transparent'}} />
                                    <Bar dataKey="users" fill="#82ca9d" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
        
        <TabsContent value="acquisition" className="space-y-4">
             <Card>
                <CardHeader>
                    <CardTitle>Traffic Sources</CardTitle>
                    <CardDescription>Where are your users coming from?</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Source / Medium</TableHead>
                                <TableHead className="text-right">Users</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.acquisition?.map((source) => (
                                <TableRow key={source.source}>
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

function MetricCard({ title, value, icon: Icon, trend }: { title: string; value: string; icon: any; trend: string }) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{trend}</p>
      </CardContent>
    </Card>
  );
}
