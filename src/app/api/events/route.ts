import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' },
    });
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Error fetching public events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
