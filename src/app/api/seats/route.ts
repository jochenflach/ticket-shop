import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const sessionId = request.headers.get('x-session-id') || '';

    if (!eventId) {
      return NextResponse.json({ error: 'eventId ist erforderlich.' }, { status: 400 });
    }

    // 1. Fetch Event and layout info
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Veranstaltung nicht gefunden.' }, { status: 404 });
    }

    // 2. Clean up expired locks (older than 12 minutes) across all events
    const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000);
    await prisma.seatLock.deleteMany({
      where: {
        lockedAt: {
          lt: twelveMinutesAgo,
        },
      },
    });

    // 3. Fetch all seats for the event's layout
    const seats = await prisma.seat.findMany({
      where: {
        layoutId: event.layoutId,
      },
      orderBy: [
        { row: 'asc' },
        { number: 'asc' },
      ],
    });

    // 4. Fetch active locks for this specific event
    const locks = await prisma.seatLock.findMany({
      where: {
        eventId: eventId,
      },
    });
    const locksMap = new Map(locks.map((l) => [l.seatId, l]));

    // 5. Fetch booked seats (tickets belonging to PAID orders for this event)
    const bookedTickets = await prisma.ticket.findMany({
      where: {
        eventId: eventId,
        order: {
          status: 'PAID',
        },
      },
      select: {
        seatId: true,
      },
    });
    const bookedSeatIds = new Set(bookedTickets.map((t) => t.seatId));

    // 6. Combine and map seat statuses
    const seatData = seats.map((seat) => {
      let status: 'free' | 'locked' | 'booked' = 'free';
      let lockedBy = '';
      let isMine = false;

      if (bookedSeatIds.has(seat.id)) {
        status = 'booked';
      } else {
        const lock = locksMap.get(seat.id);
        if (lock) {
          status = 'locked';
          lockedBy = lock.lockedBy;
          isMine = sessionId ? lock.lockedBy === sessionId : false;
        }
      }

      return {
        id: seat.id,
        row: seat.row,
        number: seat.number,
        category: seat.category,
        price: seat.price,
        x: seat.x,
        y: seat.y,
        status,
        lockedBy,
        isMine,
      };
    });

    return NextResponse.json({ seats: seatData });
  } catch (error: any) {
    console.error('Error fetching seats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
