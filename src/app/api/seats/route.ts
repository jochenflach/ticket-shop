import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = request.headers.get('x-session-id') || '';

    // 1. Clean up expired locks (older than 12 minutes)
    const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000);
    await prisma.seatLock.deleteMany({
      where: {
        lockedAt: {
          lt: twelveMinutesAgo,
        },
      },
    });

    // 2. Fetch all seats
    const seats = await prisma.seat.findMany({
      orderBy: [
        { row: 'asc' },
        { number: 'asc' },
      ],
    });

    // 3. Fetch active locks
    const locks = await prisma.seatLock.findMany();
    const locksMap = new Map(locks.map((l) => [l.seatId, l]));

    // 4. Fetch booked seats (tickets belonging to PAID orders)
    const bookedTickets = await prisma.ticket.findMany({
      where: {
        order: {
          status: 'PAID',
        },
      },
      select: {
        seatId: true,
      },
    });
    const bookedSeatIds = new Set(bookedTickets.map((t) => t.seatId));

    // 5. Combine and map seat statuses
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
