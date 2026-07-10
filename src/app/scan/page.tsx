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
  const [cameraActive, setCameraActive] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);

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
    setCameraActive(true);
    setError(null);
    setResult(null);

    // Give React time to render the viewport container
    setTimeout(() => {
      try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        html5QrCodeRef.current = html5QrCode;

        html5QrCode.start(
          { facingMode: "environment" }, // Rear camera
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.75;
              return { width: size, height: size };
            }
          },
          async (decodedText) => {
            // Check if in cooldown
            if (cooldownRef.current) return;
            
            // Set cooldown
            cooldownRef.current = true;
            setScanCooldown(true);

            // Process scan
            await scanTicket(decodedText);

            // Cooldown timeout: 2.2 seconds before resetting to active scan mode
            setTimeout(() => {
              cooldownRef.current = false;
              setScanCooldown(false);
              setResult(null); // Clear result card to indicate ready for next ticket
            }, 2200);
          },
          (errorMessage) => {
            // Keep scanning
          }
        ).catch(err => {
          console.error("Camera start error:", err);
          setError("Kamera konnte nicht gestartet werden. Bitte Berechtigungen prüfen.");
          setCameraActive(false);
        });
      } catch (err) {
        console.error("Scanner init error:", err);
        setError("Fehler bei der Kamera-Initialisierung.");
        setCameraActive(false);
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
    setCameraActive(false);
    setScanCooldown(false);
    cooldownRef.current = false;
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

        {/* Camera Section */}
        <div className={styles.cameraSection}>
          {!cameraActive ? (
            <button type="button" className={styles.activateCameraButton} onClick={startCamera}>
              <Camera size={18} className={styles.cameraIcon} />
              Kamera-Scanner starten
            </button>
          ) : (
            <div className={styles.cameraBox}>
              <div className={styles.cameraHeader}>
                <span className={styles.cameraStatus}>
                  {scanCooldown ? (
                    <span className={styles.statusCooldown}>Pausiert... (Nächstes Ticket)</span>
                  ) : (
                    <span className={styles.statusScanning}>Scannen aktiv...</span>
                  )}
                </span>
                <button type="button" className={styles.stopCameraButton} onClick={stopCamera}>
                  Kamera stoppen
                </button>
              </div>
              <div className={`${styles.cameraViewportContainer} ${
                result ? (
                  result.success ? styles.borderSuccess : 
                  result.alreadyCheckedIn ? styles.borderWarning : 
                  styles.borderError
                ) : ''
              }`}>
                <div id="qr-reader" className={styles.qrReader}></div>
                <div className={styles.scanOverlay}>
                  <div className={`${styles.scanTarget} ${scanCooldown ? styles.paused : ''}`}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Form for Manual Entry */}
        <form onSubmit={handleScan} className={styles.scanForm}>
          <div className={styles.inputWrapper}>
            <Search size={20} className={styles.searchIcon} />
            <input
              ref={inputRef}
              type="text"
              required
              placeholder="Code manuell eingeben"
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
              disabled={loading}
              autoComplete="off"
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
