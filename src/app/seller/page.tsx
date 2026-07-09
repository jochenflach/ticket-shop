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

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Session
  useEffect(() => {
    // Check if seller PIN is stored in sessionStorage
    const storedPin = sessionStorage.getItem('seller_pos_pin');
    if (storedPin === '1234') {
      setIsLoggedIn(true);
    }

    let storedSessionId = localStorage.getItem('seller_pos_session_id');
    if (!storedSessionId) {
      storedSessionId = 'seller_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('seller_pos_session_id', storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Fetch seats data
  const fetchSeats = async (showLoading = false) => {
    if (!sessionId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/seats', {
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

  // Poll for seat changes
  useEffect(() => {
    if (isLoggedIn && sessionId) {
      fetchSeats(true);

      pollingRef.current = setInterval(() => {
        fetchSeats(false);
      }, 4000); // Poll slightly faster for sellers (4s)
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isLoggedIn, sessionId]);

  // PIN login handler
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '1234') {
      setIsLoggedIn(true);
      sessionStorage.setItem('seller_pos_pin', pinInput);
      setPinError(null);
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
    if (submitting) return;

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
    if (selectedSeatIds.length === 0 || submitting) return;

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
          customerName,
          customerEmail,
          seatIds: selectedSeatIds,
          source: 'SELLER',
          sellerPin: pin,
          ticketTypes: finalTicketTypes,
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
          <div className={styles.cardHeader}>
            <h2>Sitzplatzauswahl (Direktbuchung)</h2>
            <p>Plätze im Plan auswählen. Als Verkäufer buchen Sie Plätze direkt und ohne Zahlungsdienstleister.</p>
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
              <div className={styles.svgContainer}>
                <svg viewBox="0 0 650 560" className={styles.svgSeatmap}>
                  {/* Stage */}
                  <line x1="120" y1="35" x2="530" y2="35" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
                  <text x="325" y="55" textAnchor="middle" className={styles.stageText}>BÜHNE</text>

                  {/* Seats */}
                  {Object.entries(rows).map(([rowNumStr, rowSeats]) => {
                    const rowNum = parseInt(rowNumStr);
                    
                    // Add a vertical spacer gap of 24px between category 1 (rows 1-6) and category 2 (rows 7-16)
                    const baseY = 90 + (rowNum - 1) * 28 + (rowNum >= 7 ? 24 : 0);
                    const labelY = baseY;

                    return (
                      <g key={rowNum}>
                        <text x="15" y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>

                        {rowSeats.map((seat) => {
                          const isRightSide = seat.number > 10;
                          const x = 40 + (seat.number - 1) * 25 + (isRightSide ? 30 : 0);
                          
                          // Calculate curved Y offset for rows 1 to 6 (U-shape: center lower, sides higher)
                          let y = baseY;
                          if (rowNum <= 6) {
                            const colOffset = seat.number - 10.5;
                            const curveY = colOffset * colOffset * 0.18;
                            y += (16.2 - curveY);
                          }

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

                        <text x="615" y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
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
