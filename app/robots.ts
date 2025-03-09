import { NextResponse } from 'next/server';

export async function GET() {
  const content = `
    User-agent: *
    Disallow: /
  `;

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
