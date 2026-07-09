import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Bestell-ID fehlt.' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tickets: {
          include: {
            seat: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Bestellung nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error('Error fetching order:', error);
    return NextResponse.json({ error: 'Interner Server-Fehler beim Laden der Bestellung.' }, { status: 500 });
  }
}
