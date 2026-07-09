import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const SELLER_PIN = process.env.SELLER_PIN || '1234';

// Helper to generate a random ticket code
function generateTicketCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'TKT-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to calculate seat price based on ticket type
function getSeatPrice(price: number, type: string) {
  if (type === 'STUDENT') return Math.round(price * 0.8 * 100) / 100; // 20% discount
  if (type === 'CHILD') return Math.round(price * 0.6 * 100) / 100;   // 40% discount
  if (type === 'FREE') return 0.0;                                     // 100% discount
  return price;                                                       // 'NORMAL'
}

export async function POST(request: Request) {
  try {
    const { sessionId, customerName, customerEmail, seatIds, source, sellerPin, promoCode, ticketTypes } = await request.json();

    if (!customerName || !customerEmail || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: 'Bitte füllen Sie alle erforderlichen Felder aus.' }, { status: 400 });
    }

    // 1. Fetch seat details
    const seats = await prisma.seat.findMany({
      where: {
        id: { in: seatIds },
      },
    });

    if (seats.length !== seatIds.length) {
      return NextResponse.json({ error: 'Einige Sitzplätze sind ungültig.' }, { status: 400 });
    }

    // Calculate total price based on selected ticket types
    const totalAmount = seats.reduce((sum, seat) => {
      let type = ticketTypes?.[seat.id] || 'NORMAL';
      // Safety: Customers cannot book 'FREE' tickets online
      if (source !== 'SELLER' && type === 'FREE') {
        type = 'NORMAL';
      }
      return sum + getSeatPrice(seat.price, type);
    }, 0);

    // ==========================================
    // FLOW A: SELLER (POS / Abendkasse)
    // ==========================================
    if (source === 'SELLER') {
      if (sellerPin !== SELLER_PIN) {
        return NextResponse.json({ error: 'Ungültige Verkäufer-PIN.' }, { status: 403 });
      }

      // POS Transaction - immediately complete order
      const order = await prisma.$transaction(async (tx) => {
        // Double check booking status of seats
        const booked = await tx.ticket.findFirst({
          where: {
            seatId: { in: seatIds },
            order: {
              status: 'PAID',
            },
          },
        });
        if (booked) {
          throw new Error(`Sitzplatz ${booked.seatId} ist bereits von jemand anderem gebucht.`);
        }

        // Create the PAID order
        const createdOrder = await tx.order.create({
          data: {
            customerName,
            customerEmail,
            totalAmount,
            status: 'PAID',
            source: 'SELLER',
          },
        });

        // Generate tickets
        for (const seat of seats) {
          const type = ticketTypes?.[seat.id] || 'NORMAL';
          const pricePaid = getSeatPrice(seat.price, type);

          await tx.ticket.create({
            data: {
              orderId: createdOrder.id,
              seatId: seat.id,
              ticketType: type,
              pricePaid,
              ticketCode: generateTicketCode(),
            },
          });
        }

        // Clean up locks
        await tx.seatLock.deleteMany({
          where: {
            seatId: { in: seatIds },
          },
        });

        return createdOrder;
      });

      return NextResponse.json({
        success: true,
        orderId: order.id,
        redirectUrl: `/checkout/success?orderId=${order.id}`,
      });
    }

    // ==========================================
    // FLOW B: CUSTOMER (Online Shop)
    // ==========================================
    if (!sessionId) {
      return NextResponse.json({ error: 'Session-ID fehlt.' }, { status: 400 });
    }

    // Verify seats are still locked by this session
    const activeLocks = await prisma.seatLock.findMany({
      where: {
        seatId: { in: seatIds },
        lockedBy: sessionId,
      },
    });

    if (activeLocks.length !== seatIds.length) {
      return NextResponse.json({
        error: 'Ihre Platzreservierung ist abgelaufen. Bitte wählen Sie die Sitze erneut aus.',
      }, { status: 400 });
    }

    // Apply promo code if provided
    let finalAmount = totalAmount;
    let promoCodeId: string | null = null;
    let discountAmount = 0;

    if (promoCode) {
      const formattedCode = promoCode.toUpperCase().trim();
      const promo = await prisma.promoCode.findUnique({
        where: { code: formattedCode },
      });

      if (promo && promo.isActive && (promo.maxUses === null || promo.usedCount < promo.maxUses)) {
        promoCodeId = promo.id;
        if (promo.type === 'PERCENT') {
          discountAmount = (totalAmount * promo.value) / 100;
        } else if (promo.type === 'FIXED') {
          discountAmount = Math.min(totalAmount, promo.value);
        }
        discountAmount = Math.round(discountAmount * 100) / 100;
        finalAmount = Math.max(0, totalAmount - discountAmount);
      }
    }

    // Create a PENDING order in the database
    const pendingOrder = await prisma.order.create({
      data: {
        customerName,
        customerEmail,
        totalAmount: finalAmount,
        status: 'PENDING',
        source: 'CUSTOMER',
        promoCodeId,
        discountAmount,
      },
    });

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const origin = `${protocol}://${host}`;

    // If Stripe is configured, create a real Stripe Checkout Session
    if (stripe) {
      let discountLeft = discountAmount;
      const stripeLineItems = seats.map((seat, index) => {
        let type = ticketTypes?.[seat.id] || 'NORMAL';
        if (type === 'FREE') type = 'NORMAL'; // Safety filter
        
        let seatPrice = getSeatPrice(seat.price, type);
        
        if (discountLeft > 0) {
          if (index === seats.length - 1) {
            // Apply all remaining discount to the last item
            seatPrice = Math.max(0, seatPrice - discountLeft);
          } else {
            // Proportional distribution
            const seatDiscount = Math.min(seatPrice, discountLeft);
            seatPrice = seatPrice - seatDiscount;
            discountLeft -= seatDiscount;
          }
        }
        
        return {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Musical Ticket: Reihe ${seat.row}, Platz ${seat.number}`,
              description: `Kategorie: ${seat.category} (Tarif: ${type})`,
            },
            unit_amount: Math.round(seatPrice * 100), // Stripe uses cents
          },
          quantity: 1,
        };
      });

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'sepa_debit'],
        line_items: stripeLineItems,
        mode: 'payment',
        success_url: `${origin}/checkout/success?orderId=${pendingOrder.id}&stripe_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?sessionId=${sessionId}`,
        customer_email: customerEmail,
        metadata: {
          orderId: pendingOrder.id,
          seatIds: JSON.stringify(seatIds),
          sessionId,
          ticketTypes: JSON.stringify(ticketTypes || {}),
        },
      });

      // Update the order with the stripe session ID
      await prisma.order.update({
        where: { id: pendingOrder.id },
        data: { stripeSessionId: stripeSession.id },
      });

      return NextResponse.json({
        success: true,
        redirectUrl: stripeSession.url,
      });
    } else {
      // Fallback: Simulated payment route for local dev testing
      console.log('Stripe not configured. Redirecting to payment simulation.');
      const encodedTicketTypes = encodeURIComponent(JSON.stringify(ticketTypes || {}));
      return NextResponse.json({
        success: true,
        redirectUrl: `/checkout/simulated-payment?orderId=${pendingOrder.id}&sessionId=${sessionId}&ticketTypes=${encodedTicketTypes}`,
      });
    }
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: error.message || 'Ein interner Fehler ist aufgetreten.' }, { status: 500 });
  }
}
