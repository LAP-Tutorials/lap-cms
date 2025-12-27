import { NextResponse } from 'next/server';
import { getAnalyticsData } from '@/lib/analytics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : 7;

  try {
    const data = await getAnalyticsData(days);

    if (!data) {
        return NextResponse.json({ error: 'Failed to fetch analytics data or credentials missing' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
