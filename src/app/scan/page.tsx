'use client';

import { useState, useRef } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, XCircle, Search, Loader2, ArrowRight, ClipboardList } from 'lucide-react';
import styles from './scan.module.css';
import { getBlockNameFromSeatId } from '@/lib/utils';

interface ScanResult {
  success: boolean;
  alreadyCheckedIn?: boolean;
  message: string;
  customerName?: string;
  seatId?: string;
  row?: number;
  number?: number;
  category?: string;
  checkedInAt?: string;
}

interface ScanHistoryItem {
  code: string;
  success: boolean;
  message: string;
  customerName?: string;
  seatId?: string;
  timestamp: string;
}

export default function TicketScanner() {
  const [ticketCode, setTicketCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = ticketCode.trim().toUpperCase();
    if (!cleanCode) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticketCode: cleanCode }),
      });

      const data = await response.json();
      
      const scanResult: ScanResult = response.ok
        ? data
        : { success: false, message: data.error || 'Verbindungsfehler beim Scannen.' };

      setResult(scanResult);

      // Add to history
      const now = new Date().toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const historyItem: ScanHistoryItem = {
        code: cleanCode,
        success: scanResult.success,
        message: scanResult.message,
        customerName: scanResult.customerName,
        seatId: scanResult.seatId,
        timestamp: now,
      };

      setHistory((prevHistory) => [historyItem, ...prevHistory.slice(0, 4)]);
      setTicketCode('');
      
      // Auto focus input back
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (err) {
      console.error(err);
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={`${styles.container} glass`}>
        {/* Header */}
        <div className={styles.header}>
          <ShieldAlert size={36} className={styles.shieldIcon} />
          <h1>Einlasskontrolle</h1>
          <p className={styles.subtitle}>Einlass-Scanner für das Musical <strong>"Das Wilde Weib"</strong></p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleScan} className={styles.scanForm}>
          <div className={styles.inputWrapper}>
            <Search size={20} className={styles.searchIcon} />
            <input
              ref={inputRef}
              type="text"
              required
              placeholder="Ticket-Code scannen oder eintippen"
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
              disabled={loading}
              autoComplete="off"
              autoFocus
            />
            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? <Loader2 size={18} className={styles.spinner} /> : <ArrowRight size={18} />}
            </button>
          </div>
        </form>

        {error && <div className={styles.errorAlert}>{error}</div>}

        {/* Scan Results Screen */}
        {result && (
          <div className={styles.resultContainer}>
            {result.success ? (
              /* Success card: Ticket is valid */
              <div className={`${styles.resultCard} ${styles.bgSuccess}`}>
                <CheckCircle size={44} className={styles.iconSuccess} />
                <div className={styles.resultDetails}>
                  <h2>✓ TICKET GÜLTIG</h2>
                  <p className={styles.resultMessage}>{result.message}</p>
                  
                  <div className={styles.ticketMetaData}>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Name:</span>
                      <span className={styles.metaValue}>{result.customerName}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Sitzplatz:</span>
                      <span className={styles.metaValueHighlight}>
                        {result.seatId ? getBlockNameFromSeatId(result.seatId) + ', ' : ''}Reihe {result.row}, Platz {result.number}
                      </span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Kategorie:</span>
                      <span className={styles.metaValue}>{result.category}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : result.alreadyCheckedIn ? (
              /* Warning card: Already checked in */
              <div className={`${styles.resultCard} ${styles.bgWarning}`}>
                <AlertTriangle size={44} className={styles.iconWarning} />
                <div className={styles.resultDetails}>
                  <h2>⚠ BEREITS BELEGT</h2>
                  <p className={styles.resultMessage}>{result.message}</p>
                  
                  <div className={styles.ticketMetaData}>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Name:</span>
                      <span className={styles.metaValue}>{result.customerName}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Sitzplatz:</span>
                      <span className={styles.metaValueHighlight}>
                        {result.seatId ? getBlockNameFromSeatId(result.seatId) + ', ' : ''}Reihe {result.row}, Platz {result.number}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Error card: Ticket invalid */
              <div className={`${styles.resultCard} ${styles.bgDanger}`}>
                <XCircle size={44} className={styles.iconDanger} />
                <div className={styles.resultDetails}>
                  <h2>✗ UNGÜLTIG</h2>
                  <p className={styles.resultMessage}>{result.message}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scan History (recent scans) */}
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <ClipboardList size={16} />
            <h3>Letzte Scans</h3>
          </div>

          {history.length === 0 ? (
            <p className={styles.emptyHistory}>Noch keine Tickets gescannt.</p>
          ) : (
            <div className={styles.historyList}>
              {history.map((item, index) => (
                <div key={index} className={styles.historyItem}>
                  <div className={styles.historyItemLeft}>
                    <span 
                      className={styles.statusDot} 
                      style={{ 
                        backgroundColor: item.success 
                          ? 'var(--color-free)' 
                          : item.message.includes('bereits') 
                            ? 'var(--color-locked)' 
                            : 'var(--color-booked)' 
                      }}
                    ></span>
                    <div className={styles.historyCodeInfo}>
                      <span className={styles.historyCode}>{item.code}</span>
                      <span className={styles.historyName}>{item.customerName || 'Ungültiges Ticket'}</span>
                    </div>
                  </div>
                  <span className={styles.historyTime}>{item.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
