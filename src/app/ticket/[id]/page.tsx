'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, Calendar, MapPin, ArrowLeft, Loader2, Award, Heart, HelpCircle } from 'lucide-react';
import QRCode from 'qrcode';
import styles from './ticket.module.css';

interface Seat {
  id: string;
  row: number;
  number: number;
  category: string;
  price: number;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
}

interface Event {
  id: string;
  title: string;
  date: string;
  description: string | null;
}

interface TicketData {
  id: string;
  ticketCode: string;
  checkedIn: boolean;
  ticketType: string;
  pricePaid: number;
  seat: Seat;
  order: Order;
  event: Event;
}

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' Uhr';
  } catch (e) {
    return dateString;
  }
};

export default function TicketPrintPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (!id) return;

    const fetchTicket = async () => {
      try {
        const response = await fetch(`/api/tickets/${id}`);
        const data = await response.json();

        if (response.ok && data.ticket) {
          setTicket(data.ticket);
          
          // Generate QR code encoding the ticket code
          const code = data.ticket.ticketCode;
          const qr = await QRCode.toDataURL(code, {
            width: 250,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          setQrUrl(qr);
        } else {
          setError(data.error || 'Ticket konnte nicht geladen werden.');
        }
      } catch (err) {
        console.error(err);
        setError('Fehler beim Laden des Tickets.');
      } finally {
        setLoading(false);
      }
    };

    fetchTicket();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <main className={styles.main}>
      {/* Action buttons (hidden on print) */}
      <div className={styles.noPrintActions}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={16} className={styles.mr2} />
          <span>Zurück</span>
        </button>
        <button onClick={handlePrint} className={styles.printButton}>
          <Printer size={16} className={styles.mr2} />
          <span>Ticket drucken</span>
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={40} className={styles.spinner} />
          <p>Lade Ticket...</p>
        </div>
      ) : error ? (
        <div className={styles.errorBox}>
          <h2>Fehler</h2>
          <p>{error}</p>
          <button onClick={() => router.push('/')} className={styles.backButton}>
            Zum Shop
          </button>
        </div>
      ) : ticket ? (
        <div className={styles.ticketContainer}>
          {/* Real physical-like ticket design */}
          <div className={styles.ticketLayout}>
            {/* Left/Main Ticket Part */}
            <div className={styles.ticketMain}>
              <div className={styles.ticketHeader}>
                <div className={styles.verticalBrand}>EINTRITTSKARTE</div>
                <div className={styles.brandTitle}>
                  <span className={styles.musicalSub}>Musical</span>
                  <h1 className={styles.musicalName}>{ticket.event.title}</h1>
                </div>
              </div>

              <div className={styles.ticketDetails}>
                <div className={styles.detailRow}>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Datum & Uhrzeit</span>
                    <span className={styles.value}>
                      <Calendar size={14} className={styles.inlineIcon} />
                      {formatDate(ticket.event.date)}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Veranstaltungsort</span>
                    <span className={styles.value}>
                      <MapPin size={14} className={styles.inlineIcon} />
                      Stadthalle Wildeshausen
                    </span>
                  </div>
                </div>

                <div className={styles.detailRow}>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Reihe</span>
                    <span className={styles.valueBig}>{ticket.seat.row}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Sitzplatz</span>
                    <span className={styles.valueBig}>{ticket.seat.number}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Kategorie</span>
                    <span className={styles.valueMedium}>{ticket.seat.category}</span>
                  </div>
                </div>

                <div className={styles.detailRowBordered}>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Besucher</span>
                    <span className={styles.value}>{ticket.order.customerName}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Tarif</span>
                    <span className={styles.value}>{
                      ticket.ticketType === 'STUDENT' ? 'Ermäßigt (Schüler/Student)' :
                      ticket.ticketType === 'CHILD' ? 'Ermäßigt (Kind)' :
                      ticket.ticketType === 'FREE' ? 'Freikarte / Ehrenkarte' : 'Normalpreis'
                    }</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.label}>Preis (inkl. USt)</span>
                    <span className={styles.value}>{ticket.pricePaid.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* Sponsor Logos */}
              <div className={styles.sponsorsSection}>
                <div className={styles.sponsorsLabel}>PARTNER & SPONSOREN</div>
                <div className={styles.sponsorsLogoWrapper}>
                  <img src="/images/sponsors.png" alt="Sponsoren" className={styles.sponsorsImage} />
                </div>
              </div>

              <div className={styles.ticketFooter}>
                <div className={styles.footerNote}>
                  <Heart size={10} className={styles.inlineIcon} />
                  <span>Einlass ab 19:00 Uhr. Bitte rechtzeitig erscheinen.</span>
                </div>
                <div className={styles.ticketId}>
                  ID: {ticket.id.substring(0, 12).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Perforation line (dashed) */}
            <div className={styles.perforation}></div>

            {/* Right/Stub QR Code Part */}
            <div className={styles.ticketStub}>
              <div className={styles.stubHeader}>
                <span>EINLASSKONTROLLE</span>
              </div>
              
              <div className={styles.qrWrapper}>
                {qrUrl ? (
                  <img src={qrUrl} alt="Ticket QR Code" className={styles.qrCodeImage} />
                ) : (
                  <div className={styles.qrPlaceholder}>QR Code</div>
                )}
              </div>

              <div className={styles.stubFooter}>
                <span className={styles.stubCode}>{ticket.ticketCode}</span>
                <span className={styles.stubNote}>Gültig für einmaligen Einlass</span>
              </div>
            </div>
          </div>
          
          <div className={styles.printInstructions}>
            <p>Tipp: Drucken Sie dieses Ticket im Hochformat aus oder zeigen Sie den QR-Code auf Ihrem Smartphone am Einlass vor.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
