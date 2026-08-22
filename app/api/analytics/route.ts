import { NextResponse } from 'next/server';
import { getAnalyticsData } from '@/lib/analytics';
import { verifyContentStaffRequest } from '@/lib/server-auth';

export async function GET(request: Request) {
  const staff = await verifyContentStaffRequest(request);
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? 'Authentication required' : 'Access denied' },
      { status: staff.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const days = searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : 7;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    let data;
    if (from && to) {
        // Ensure format YYYY-MM-DD which GA4 expects implies
        // But the date-fns ISO string usually works or strict format.
        // runReport expects 'YYYY-MM-DD' or 'today'/'yesterday'.
        // Let's assume the frontend sends ISO strings, we might need to trim them.
        const formatDate = (d: string) => d.split('T')[0];
        data = await getAnalyticsData(days, { startDate: formatDate(from), endDate: formatDate(to) });
    } else {
        data = await getAnalyticsData(days);
    }

    if (!data) {
        return NextResponse.json({ error: 'Failed to fetch analytics data or credentials missing' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
