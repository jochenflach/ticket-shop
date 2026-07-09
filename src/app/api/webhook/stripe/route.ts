import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 });
  }

  const payload = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
    } else {
      // In development if signature verification is not set up, parse payload directly
      event = JSON.parse(payload);
    }
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata && metadata.orderId && metadata.seatIds && metadata.eventId) {
      const orderId = metadata.orderId;
      const seatIds: string[] = JSON.parse(metadata.seatIds);
      const ticketTypes = metadata.ticketTypes ? JSON.parse(metadata.ticketTypes) : {};
      const eventId = metadata.eventId;

      try {
        await prisma.$transaction(async (tx) => {
          // Get current order status
          const order = await tx.order.findUnique({
            where: { id: orderId },
          });

          if (!order || order.status !== 'PENDING') {
            console.log(`Order ${orderId} already processed or does not exist.`);
            return;
          }

          // Fetch seat details to get prices
          const seats = await tx.seat.findMany({
            where: { id: { in: seatIds } },
          });

          // 1. Mark order as PAID
          await tx.order.update({
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

          // 2. Generate tickets
          for (const seat of seats) {
            // Check if ticket already exists for safety for this event
            const existingTicket = await tx.ticket.findFirst({
              where: {
                order: { status: 'PAID' },
                seatId: seat.id,
                eventId: eventId,
              },
            });
            if (existingTicket) {
              throw new Error(`Sitzplatz ${seat.id} ist bereits besetzt.`);
            }

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

          // 3. Clear temporary seat locks for this event
          await tx.seatLock.deleteMany({
            where: {
              seatId: { in: seatIds },
              eventId: eventId,
            },
          });

          console.log(`Order ${orderId} successfully completed via Stripe Webhook.`);
        });
      } catch (dbError: any) {
        console.error('Database transaction error in Stripe webhook:', dbError);
        return NextResponse.json({ error: 'Database transaction failed' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
