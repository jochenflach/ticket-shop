import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function generateTicketCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'TKT-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getSeatPrice(price: number, type: string) {
  if (type === 'STUDENT') return Math.round(price * 0.8 * 100) / 100; // 20% discount
  if (type === 'CHILD') return Math.round(price * 0.6 * 100) / 100;   // 40% discount
  if (type === 'FREE') return 0.0;                                     // 100% discount
  return price;
}

export async function POST(request: Request) {
  try {
    const { orderId, seatIds, ticketTypes, eventId } = await request.json();

    if (!orderId || !seatIds || !Array.isArray(seatIds) || !eventId) {
      return NextResponse.json({ error: 'Ungültige Parameter. eventId, orderId und seatIds sind erforderlich.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch current order
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error('Bestellung nicht gefunden.');
      }

      if (order.status !== 'PENDING') {
        throw new Error('Bestellung ist nicht im Status PENDING.');
      }

      // 2. Fetch seats
      const seats = await tx.seat.findMany({
        where: { id: { in: seatIds } },
      });

      // 3. Double check if seats are booked for this event
      const alreadyBooked = await tx.ticket.findFirst({
        where: {
          seatId: { in: seatIds },
          eventId: eventId,
          order: { status: 'PAID' },
        },
      });
      if (alreadyBooked) {
        throw new Error(`Sitzplatz ${alreadyBooked.seatId} ist bereits von jemand anderem gebucht.`);
      }

      // 4. Update order status to PAID
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: 'PAID' },
      });

      // Increment promo code used count if applicable
      if (order.promoCodeId) {
        await tx.promoCode.update({
          where: { id: order.promoCodeId },
          data: {
            usedCount: { increment: 1 },
          },
        });
      }

      // 5. Generate tickets
      for (const seat of seats) {
        const type = ticketTypes?.[seat.id] || 'NORMAL';
        const pricePaid = getSeatPrice(seat.price, type);

        await tx.ticket.create({
          data: {
            orderId,
            seatId: seat.id,
            eventId: eventId,
            ticketType: type,
            pricePaid,
            ticketCode: generateTicketCode(),
          },
        });
      }

      // 6. Delete locks for this event
      await tx.seatLock.deleteMany({
        where: {
          seatId: { in: seatIds },
          eventId: eventId,
        },
      });

      return updatedOrder;
    });

    return NextResponse.json({ success: true, orderId: result.id });
  } catch (error: any) {
    console.error('Simulator webhook error:', error);
    return NextResponse.json({ error: error.message || 'Zahlungssimulation fehlgeschlagen.' }, { status: 400 });
  }
}
