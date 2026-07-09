import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Ticket-ID fehlt.' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        seat: true,
        order: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error: any) {
    console.error('Error fetching ticket:', error);
    return NextResponse.json({ error: 'Interner Server-Fehler beim Laden des Tickets.' }, { status: 500 });
  }
}
