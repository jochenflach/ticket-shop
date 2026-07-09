import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const sessionId = request.headers.get('x-session-id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const { action, seatIds, eventId } = await request.json();
    if (!action || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0 || !eventId) {
      return NextResponse.json({ error: 'Ungültige Parameter. eventId und seatIds sind erforderlich.' }, { status: 400 });
    }

    if (action === 'lock') {
      // 1. Transaction to safely lock seats
      const result = await prisma.$transaction(async (tx) => {
        // A. Check if any seat is already booked (Paid order) for this specific event
        const booked = await tx.ticket.findFirst({
          where: {
            seatId: { in: seatIds },
            eventId: eventId,
            order: {
              status: 'PAID',
            },
          },
        });
        if (booked) {
          throw new Error(`Sitzplatz ${booked.seatId} ist bereits fest gebucht.`);
        }

        // B. Check if any seat is already locked by someone else (not expired) for this event
        const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000);
        const activeLocks = await tx.seatLock.findMany({
          where: {
            seatId: { in: seatIds },
            eventId: eventId,
            lockedAt: { gt: twelveMinutesAgo },
          },
        });

        const lockedByOthers = activeLocks.filter((l) => l.lockedBy !== sessionId);
        if (lockedByOthers.length > 0) {
          throw new Error(`Sitzplatz ${lockedByOthers[0].seatId} ist von einem anderen Käufer reserviert.`);
        }

        // C. Clean up any expired locks or existing locks of this session for these seats for this event
        await tx.seatLock.deleteMany({
          where: {
            seatId: { in: seatIds },
            eventId: eventId,
          },
        });

        // D. Create new locks for these seats for this event
        const locksData = seatIds.map((seatId) => ({
          seatId,
          eventId,
          lockedBy: sessionId,
          lockedAt: new Date(),
        }));

        for (const lock of locksData) {
          await tx.seatLock.create({
            data: lock,
          });
        }

        return { success: true };
      });

      return NextResponse.json(result);
    } else if (action === 'unlock') {
      // Release locks for this session and these seats for this event
      await prisma.seatLock.deleteMany({
        where: {
          seatId: { in: seatIds },
          eventId: eventId,
          lockedBy: sessionId,
        },
      });

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error locking/unlocking seats:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 400 });
  }
}
