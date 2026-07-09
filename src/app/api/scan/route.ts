import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { ticketCode } = await request.json();

    if (!ticketCode) {
      return NextResponse.json({ error: 'Ticket-Code fehlt.' }, { status: 400 });
    }

    // Find the ticket and its associated order and seat details
    const ticket = await prisma.ticket.findUnique({
      where: { ticketCode },
      include: {
        order: true,
        seat: true,
      },
    });

    if (!ticket || ticket.order.status !== 'PAID') {
      return NextResponse.json({
        success: false,
        message: 'Ungültiges Ticket oder Zahlung nicht abgeschlossen.',
      }, { status: 404 });
    }

    // Check if already checked in
    if (ticket.checkedIn) {
      const formattedDate = ticket.checkedInAt
        ? new Date(ticket.checkedInAt).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : 'unbekannt';

      return NextResponse.json({
        success: false,
        alreadyCheckedIn: true,
        message: `Achtung! Ticket wurde bereits um ${formattedDate} Uhr eingecheckt.`,
        customerName: ticket.order.customerName,
        seatId: ticket.seatId,
        row: ticket.seat.row,
        number: ticket.seat.number,
      });
    }

    // Perform check-in
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        checkedIn: true,
        checkedInAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Ticket erfolgreich eingecheckt. Viel Spaß!',
      customerName: ticket.order.customerName,
      seatId: ticket.seat.id,
      category: ticket.seat.category,
      row: ticket.seat.row,
      number: ticket.seat.number,
      checkedInAt: updatedTicket.checkedInAt,
    });
  } catch (error: any) {
    console.error('Scan API error:', error);
    return NextResponse.json({ error: 'Interner Server-Fehler bei der Einlasskontrolle.' }, { status: 500 });
  }
}
