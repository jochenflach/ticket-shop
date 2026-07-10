'use client';

import { useState, useRef, useEffect } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, XCircle, Search, Loader2, ArrowRight, ClipboardList, Camera, X } from 'lucide-react';
import styles from './scan.module.css';
import { getBlockNameFromSeatId } from '@/lib/utils';
import { Html5Qrcode } from 'html5-qrcode';

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
  const [showCamera, setShowCamera] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().catch(err => console.error("Unmount camera stop error:", err));
        }
      }
    };
  }, []);

  const scanTicket = async (code: string) => {
    const cleanCode = code.trim().toUpperCase();
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
    } catch (err) {
      console.error(err);
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    await scanTicket(ticketCode);
    setTicketCode('');
    
    // Auto focus input back
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const startCamera = () => {
    setShowCamera(true);
    setError(null);
    setResult(null);

    // Give React time to render the modal container
    setTimeout(() => {
      try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        html5QrCodeRef.current = html5QrCode;

        html5QrCode.start(
          { facingMode: "environment" }, // Rear camera
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            }
          },
          async (decodedText) => {
            // Scanner success
            await stopCamera();
            await scanTicket(decodedText);
          },
          (errorMessage) => {
            // Keep scanning, ignore silent errors
          }
        ).catch(err => {
          console.error("Camera start error:", err);
          setError("Kamera konnte nicht gestartet werden. Bitte Berechtigungen prüfen.");
          setShowCamera(false);
        });
      } catch (err) {
        console.error("Scanner init error:", err);
        setError("Fehler bei der Kamera-Initialisierung.");
        setShowCamera(false);
      }
    }, 200);
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (err) {
        console.error("Error stopping camera:", err);
      }
      html5QrCodeRef.current = null;
    }
    setShowCamera(false);
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
              disabled={loading || showCamera}
              autoComplete="off"
              autoFocus
            />
            <button 
              type="button" 
              className={styles.cameraButton} 
              onClick={startCamera} 
              disabled={loading || showCamera}
              title="Kamera-Scanner starten"
            >
              <Camera size={18} />
            </button>
            <button type="submit" className={styles.submitButton} disabled={loading || showCamera}>
              {loading ? <Loader2 size={18} className={styles.spinner} /> : <ArrowRight size={18} />}
            </button>
          </div>
        </form>

        {/* Camera Modal Viewport */}
        {showCamera && (
          <div className={styles.cameraModal}>
            <div className={styles.cameraContent}>
              <div className={styles.cameraHeader}>
                <h3>Kamera-Scanner</h3>
                <button type="button" onClick={stopCamera} className={styles.closeCameraButton} title="Scanner schließen">
                  <X size={18} />
                </button>
              </div>
              <div className={styles.cameraViewportContainer}>
                <div id="qr-reader" className={styles.qrReader}></div>
                <div className={styles.scanOverlay}>
                  <div className={styles.scanTarget}></div>
                </div>
              </div>
              <p className={styles.cameraHint}>Halten Sie den QR-Code des Tickets in das Quadrat.</p>
            </div>
          </div>
        )}

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
