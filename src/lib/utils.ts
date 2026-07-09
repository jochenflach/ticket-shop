/**
 * Extracts the block name (e.g., "Block A") from a seat ID.
 * Standard seat IDs are formatted as "layoutId-blockId-R[row]-S[seatNumber]" 
 * or "blockId-R[row]-S[seatNumber]".
 */
export const getBlockNameFromSeatId = (seatId: string): string => {
  if (!seatId) return '';
  const parts = seatId.split('-');
  if (parts.length >= 3) {
    // Find the row part (e.g. "R1")
    const rIndex = parts.findIndex(p => p.startsWith('R') && !isNaN(Number(p.substring(1))));
    if (rIndex > 0) {
      return `Block ${parts[rIndex - 1]}`;
    }
  }
  return '';
};
