'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Ticket, Printer, Shield, Lock, LayoutGrid, DollarSign, Calendar, MapPin } from 'lucide-react';
import styles from './seller.module.css';

interface Seat {
  id: string;
  row: number;
  number: number;
  category: string;
  price: number;
  status: 'free' | 'locked' | 'booked';
  lockedBy: string;
  isMine: boolean;
  x: number;
  y: number;
}

export default function SellerPOS() {
  const router = useRouter();

  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Ticketing states
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [ticketTypes, setTicketTypes] = useState<{ [key: string]: string }>({});
  const [sessionId, setSessionId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // CASH, INVOICE, or FREE
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-Event States
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      const data = await response.json();
      if (response.ok && data.events) {
        setEvents(data.events);
        if (data.events.length > 0 && !selectedEventId) {
          setSelectedEventId(data.events[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching events in POS:', err);
    }
  };

  // Initialize Session
  useEffect(() => {
    // Check if seller PIN is stored in sessionStorage
    const storedPin = sessionStorage.getItem('seller_pos_pin');
    if (storedPin === '1234') {
      setIsLoggedIn(true);
      fetchEvents();
    }

    let storedSessionId = localStorage.getItem('seller_pos_session_id');
    if (!storedSessionId) {
      storedSessionId = 'seller_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('seller_pos_session_id', storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Fetch seats data for the selected event
  const fetchSeats = async (showLoading = false) => {
    if (!sessionId || !selectedEventId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/seats?eventId=${selectedEventId}`, {
        headers: {
          'x-session-id': sessionId,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setSeats(data.seats);
        // Sync selected seats (marked 'locked' and 'isMine')
        const mine = data.seats
          .filter((s: Seat) => s.status === 'locked' && s.isMine)
          .map((s: Seat) => s.id);
        setSelectedSeatIds(mine);
        
        // Sync ticketTypes state
        setTicketTypes(prev => {
          const next = { ...prev };
          mine.forEach((id: string) => {
            if (!next[id]) {
              next[id] = 'NORMAL';
            }
          });
          const mineSet = new Set(mine);
          Object.keys(next).forEach(id => {
            if (!mineSet.has(id)) {
              delete next[id];
            }
          });
          return next;
        });

        setError(null);
      } else {
        setError(data.error || 'Fehler beim Laden des Kassen-Saalplans.');
      }
    } catch (err) {
      console.error(err);
      setError('Verbindung zum Kassen-Server fehlgeschlagen.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll for seat changes (re-binds when event changes)
  useEffect(() => {
    if (isLoggedIn && sessionId && selectedEventId) {
      fetchSeats(true);

      pollingRef.current = setInterval(() => {
        fetchSeats(false);
      }, 4000); // Poll slightly faster for sellers (4s)
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isLoggedIn, sessionId, selectedEventId]);

  // PIN login handler
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '1234') {
      setIsLoggedIn(true);
      sessionStorage.setItem('seller_pos_pin', pinInput);
      setPinError(null);
      fetchEvents();
    } else {
      setPinError('Falsche Verkäufer-PIN. Bitte erneut versuchen.');
      setPinInput('');
    }
  };

  // Logout handler
  const handleLogout = () => {
    setIsLoggedIn(false);
    sessionStorage.removeItem('seller_pos_pin');
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  // Seat toggle handler
  const handleSeatClick = async (seat: Seat) => {
    if (submitting || !selectedEventId) return;

    const isSelected = selectedSeatIds.includes(seat.id);
    const action = isSelected ? 'unlock' : 'lock';

    setError(null);

    try {
      const response = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          action,
          seatIds: [seat.id],
          eventId: selectedEventId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (isSelected) {
          setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.id));
          setTicketTypes(prev => {
            const next = { ...prev };
            delete next[seat.id];
            return next;
          });
        } else {
          setSelectedSeatIds([...selectedSeatIds, seat.id]);
          setTicketTypes(prev => ({ ...prev, [seat.id]: 'NORMAL' }));
        }
        fetchSeats(false);
      } else {
        setError(data.error || 'Platzreservierung im POS fehlgeschlagen.');
        fetchSeats(false);
      }
    } catch (err) {
      console.error(err);
      setError('Fehler bei der Platzreservierung.');
      fetchSeats(false);
    }
  };

  // POS Checkout submission handler
  const handlePOSCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeatIds.length === 0 || submitting || !selectedEventId) return;

    setSubmitting(true);
    setError(null);

    const pin = sessionStorage.getItem('seller_pos_pin') || '';

    // Adjust ticket types if payment method is FREE
    const finalTicketTypes = { ...ticketTypes };
    if (paymentMethod === 'FREE') {
      selectedSeatIds.forEach((id) => {
        finalTicketTypes[id] = 'FREE';
      });
    }

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName: customerName || 'Abendkasse Käufer',
          customerEmail: customerEmail || 'abendkasse@wildes-weib.de',
          seatIds: selectedSeatIds,
          source: 'SELLER',
          sellerPin: pin,
          ticketTypes: finalTicketTypes,
          eventId: selectedEventId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Clear locally selected seats and redirect to success printing page
        setSelectedSeatIds([]);
        router.push(data.redirectUrl);
      } else {
        setError(data.error || 'Kassenbuchung fehlgeschlagen.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setError('Verbindungsfehler bei Kassenbuchung.');
      setSubmitting(false);
    }
  };

  const calculateTicketPrice = (basePrice: number, type: string) => {
    if (type === 'STUDENT') return Math.round(basePrice * 0.8 * 100) / 100; // 20% discount
    if (type === 'CHILD') return Math.round(basePrice * 0.6 * 100) / 100;   // 40% discount
    if (type === 'FREE') return 0;                                         // 100% discount
    return basePrice;
  };

  const getSelectedSeatsDetails = () => {
    return seats.filter((s) => selectedSeatIds.includes(s.id));
  };

  const selectedSeatsDetails = getSelectedSeatsDetails();
  const totalPrice = selectedSeatsDetails.reduce((sum: number, seat) => {
    const type = paymentMethod === 'FREE' ? 'FREE' : (ticketTypes[seat.id] || 'NORMAL');
    return sum + calculateTicketPrice(seat.price, type);
  }, 0);

  // Group seats by row
  const rows: { [key: number]: Seat[] } = {};
  seats.forEach((seat) => {
    if (!rows[seat.row]) {
      rows[seat.row] = [];
    }
    rows[seat.row].push(seat);
  });

  // Login PIN Page
  if (!isLoggedIn) {
    return (
      <main className={styles.loginMain}>
        <div className={`${styles.loginCard} glass`}>
          <div className={styles.loginHeader}>
            <Shield size={36} className={styles.shieldIcon} />
            <h1>Kassensystem Login</h1>
            <p>Bitte geben Sie die PIN Ihrer Verkaufsstelle ein, um den POS freizuschalten.</p>
          </div>

          {pinError && <div className={styles.errorAlert}>{pinError}</div>}

          <form onSubmit={handlePinSubmit} className={styles.loginForm}>
            <div className={styles.pinInputGroup}>
              <Lock size={18} className={styles.lockIcon} />
              <input
                type="password"
                required
                maxLength={4}
                placeholder="PIN eingeben (z.B. 1234)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button type="submit" className={styles.loginButton}>
              Kasse freischalten
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Active POS Terminal Page
  return (
    <main className={styles.main}>
      {/* POS Top Warning Info bar */}
      <div className={styles.posBar}>
        <div className={styles.posBarLeft}>
          <LayoutGrid size={16} />
          <span>KASSENSYSTEM (POS) — Das Wilde Weib</span>
        </div>
        <button onClick={handleLogout} className={styles.logoutButton}>
          Kasse sperren
        </button>
      </div>

      <div className={styles.grid}>
        {/* Left: Seat plan */}
        <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2>Sitzplatzauswahl (Direktbuchung)</h2>
              <p>Plätze im Plan auswählen. Als Verkäufer buchen Sie Plätze direkt und ohne Zahlungsdienstleister.</p>
            </div>
            {events.length > 0 && (
              <div className={styles.eventSelectorWrapper} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#090514', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #33275b' }}>
                <Calendar size={15} style={{ color: '#fbbf24' }} />
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    setSelectedSeatIds([]);
                    setTicketTypes({});
                  }}
                  style={{ backgroundColor: 'transparent', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', outline: 'none' }}
                >
                  {events.map(ev => {
                    const formatted = new Date(ev.date).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) + ' Uhr';
                    return (
                      <option key={ev.id} value={ev.id} style={{ backgroundColor: '#090514', color: '#fff' }}>
                        {ev.title} ({formatted})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Seat Map Legend */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatFree}`}></div>
              <span>Frei</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatSelected}`}></div>
              <span>Ausgewählt</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatLocked}`}></div>
              <span>Reserviert (Kunde)</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatBooked}`}></div>
              <span>Verkauft</span>
            </div>
          </div>

          <div className={styles.categoryLegend}>
            <div className={styles.legendItem}>
              <span className={styles.catKat1Dot}>●</span>
              <span>Kategorie 1 (Reihe 1-6, leicht gebogen) — 40,00 €</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.catKat2Dot}>●</span>
              <span>Kategorie 2 (Reihe 7-16, gerade) — 24,00 €</span>
            </div>
          </div>

          {/* Seat Map wrapper */}
          <div className={styles.seatMapWrapper}>
            {loading ? (
              <div className={styles.loadingOverlay}>
                <Loader2 size={36} className={styles.spinner} />
                <p>Lade POS-Saalplan...</p>
              </div>
            ) : (
              (() => {
                // Calculate dynamic bounding box of seats to crop out margins
                let viewBox = "0 0 1000 800";
                let stageX1 = 300;
                let stageX2 = 700;
                let stageY = 35;
                let stageTextY = 55;

                if (seats.length > 0) {
                  const xCoords = seats.map(s => s.x);
                  const yCoords = seats.map(s => s.y);
                  const minX = Math.min(...xCoords);
                  const maxX = Math.max(...xCoords);
                  const minY = Math.min(...yCoords);
                  const maxY = Math.max(...yCoords);

                  const paddingX = 40;
                  const paddingBottom = 40;

                  const svgMinX = Math.max(0, minX - paddingX);
                  const stageWidth = Math.min(400, Math.max(150, maxX - minX));
                  const centerX = (minX + maxX) / 2;
                  stageX1 = centerX - stageWidth / 2;
                  stageX2 = centerX + stageWidth / 2;
                  stageY = Math.max(10, minY - 50);
                  stageTextY = stageY + 20;

                  const svgMinY = Math.max(0, stageY - 35);
                  const svgWidth = (maxX + 18 + paddingX) - svgMinX;
                  const svgHeight = (maxY + 18 + paddingBottom) - svgMinY;

                  viewBox = `${svgMinX} ${svgMinY} ${svgWidth} ${svgHeight}`;
                }

                return (
                  <div className={styles.svgContainer}>
                    <svg viewBox={viewBox} className={styles.svgSeatmap}>
                      {/* Stage */}
                      <line x1={stageX1} y1={stageY} x2={stageX2} y2={stageY} stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
                      <text x={(stageX1 + stageX2) / 2} y={stageTextY} textAnchor="middle" className={styles.stageText}>BÜHNE</text>

                      {/* Seats */}
                      {Object.entries(rows).map(([rowNumStr, rowSeats]) => {
                        const rowNum = parseInt(rowNumStr);
                        
                        const firstSeatY = rowSeats[0]?.y ?? (90 + (rowNum - 1) * 28 + (rowNum >= 7 ? 24 : 0));
                        const labelY = firstSeatY;

                        const leftSeatX = rowSeats.length > 0 ? Math.min(...rowSeats.map(s => s.x)) : 15;
                        const rightSeatX = rowSeats.length > 0 ? Math.max(...rowSeats.map(s => s.x)) : 615;

                        return (
                          <g key={rowNum}>
                            {/* Row label left */}
                            <text x={leftSeatX - 25} y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>

                            {rowSeats.map((seat) => {
                              const x = seat.x;
                              const y = seat.y;

                              let seatColorClass = styles.svgSeatFree;
                              let strokeColor = '';
                              
                              if (seat.category === 'KAT1') strokeColor = 'var(--cat-kat1)';
                              else strokeColor = 'var(--cat-kat2)';

                              if (seat.status === 'booked') {
                                seatColorClass = styles.svgSeatBooked;
                              } else if (seat.status === 'locked') {
                                seatColorClass = seat.isMine ? styles.svgSeatSelected : styles.svgSeatLocked;
                              }

                              return (
                                <g key={seat.id} className={styles.seatGroup}>
                                  <rect
                                    x={x}
                                    y={y}
                                    width="18"
                                    height="18"
                                    rx="4"
                                    className={`${styles.svgSeat} ${seatColorClass}`}
                                    style={{ stroke: seat.status === 'free' ? strokeColor : undefined }}
                                    onClick={() => seat.status !== 'booked' && (seat.status !== 'locked' || seat.isMine) && handleSeatClick(seat)}
                                  />
                                  <text x={x + 9} y={y + 12} textAnchor="middle" className={styles.seatNumberInside}>
                                    {seat.number}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Row label right */}
                            <text x={rightSeatX + 18 + 10} y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()
            )}
          </div>
        </section>

        {/* Right: Checkout Sidebar */}
        <section className={styles.checkoutSection}>
          <div className={`${styles.card} glass`}>
            <div className={styles.cardHeader}>
              <h2>POS-Kassenzettel</h2>
            </div>

            {error && <div className={styles.errorAlert}>{error}</div>}

            {selectedSeatsDetails.length === 0 ? (
              <div className={styles.emptyCart}>
                <Ticket size={48} className={styles.textMuted} />
                <p>Keine Sitze ausgewählt.</p>
                <p className={styles.hint}>Wählen Sie Plätze im Saalplan aus, um sie direkt für den Kunden einzubuchen.</p>
              </div>
            ) : (
              <div className={styles.cartContainer}>
                {/* Tickets list */}
                 <div className={styles.ticketsList}>
                  {selectedSeatsDetails.map((seat) => {
                    const type = paymentMethod === 'FREE' ? 'FREE' : (ticketTypes[seat.id] || 'NORMAL');
                    const seatPrice = calculateTicketPrice(seat.price, type);
                    
                    return (
                      <div key={seat.id} className={styles.ticketItem}>
                        <div className={styles.ticketDetails}>
                          <span className={styles.ticketTitle}>Reihe {seat.row}, Platz {seat.number}</span>
                          <span className={styles.ticketCategory} style={{ color: seat.category === 'KAT1' ? 'var(--cat-kat1)' : 'var(--cat-kat2)' }}>
                            {seat.category}
                          </span>
                          
                          {/* Dropdown select only if paymentMethod is not FREE */}
                          {paymentMethod !== 'FREE' && (
                            <select
                              value={type}
                              onChange={(e) => setTicketTypes(prev => ({ ...prev, [seat.id]: e.target.value }))}
                              className={styles.ticketTypeSelect}
                            >
                              <option value="NORMAL">Normalpreis</option>
                              <option value="STUDENT">Schüler/Student (-20%)</option>
                              <option value="CHILD">Kind (-40%)</option>
                              <option value="FREE">Freikarte (0,00 €)</option>
                            </select>
                          )}
                        </div>
                        <span className={styles.ticketPrice}>{seatPrice.toFixed(2)} €</span>
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                <div className={styles.totalPriceRow}>
                  <span>Kassenbetrag</span>
                  <span className={styles.totalPrice}>{totalPrice.toFixed(2)} €</span>
                </div>

                {/* Form */}
                <form onSubmit={handlePOSCheckout} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label htmlFor="paymentMethod">Zahlungsart</label>
                     <select
                      id="paymentMethod"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className={styles.selectInput}
                    >
                      <option value="CASH">Barzahlung (Abendkasse)</option>
                      <option value="INVOICE">Vorkasse / Überweisung (VVK-Stelle)</option>
                      <option value="FREE">Freikarte / Ehrenkarte (0,00 €)</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="customerName">Kundenname (Vor- & Nachname)</label>
                    <input
                      type="text"
                      id="customerName"
                      required
                      placeholder="Max Mustermann"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="customerEmail">E-Mail (für Ticket-Zustellung)</label>
                    <input
                      type="email"
                      id="customerEmail"
                      required
                      placeholder="max@beispiel.de"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className={styles.checkoutButton}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className={`${styles.spinner} ${styles.mr2}`} />
                        <span>Buche ein...</span>
                      </>
                    ) : (
                      <>
                        <Printer size={18} className={styles.mr2} />
                        <span>Karten drucken & abschließen</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
