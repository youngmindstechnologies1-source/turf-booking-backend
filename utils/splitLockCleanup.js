const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const SplitLedger = require('../models/SplitLedger');

const CLEANUP_INTERVAL_MS = 60 * 1000; // Run every 60 seconds

/**
 * Background job to release expired split locks.
 * Runs every 60 seconds, finds bookings where:
 *  - status === 'pending_split'
 *  - splitLockExpiresAt < now
 *
 * If no UTRs were submitted: release slots, cancel booking.
 * If some payments received: auto-confirm the booking (partial payment scenario).
 */
const cleanupExpiredSplitLocks = async () => {
  try {
    const now = new Date();

    const expiredBookings = await Booking.find({
      status: 'pending_split',
      splitLockExpiresAt: { $lt: now },
    });

    for (const booking of expiredBookings) {
      const ledgerEntries = await SplitLedger.find({ booking: booking._id });

      // Check if any payment action was taken
      const hasAnyPayment = ledgerEntries.some(
        (e) => e.status !== 'unpaid'
      );

      if (!hasAnyPayment) {
        // No one paid — release the slot
        console.log(`[SplitCleanup] Releasing expired booking ${booking.bookingRef} — no payments received`);

        booking.status = 'cancelled';
        booking.cancelledAt = now;
        await booking.save();

        // Release slots
        await Slot.updateMany(
          { _id: { $in: booking.slots } },
          { status: 'available', booking: null }
        );

        // Clean up ledger
        await SplitLedger.deleteMany({ booking: booking._id });
      } else {
        // Some payments received — auto-confirm with whatever state we have
        console.log(`[SplitCleanup] Auto-confirming expired booking ${booking.bookingRef} — partial payments exist`);

        let onlineCollected = 0;
        let cashOutstanding = 0;

        for (const entry of ledgerEntries) {
          if (
            entry.status === 'utr_submitted' ||
            entry.status === 'verified_by_host' ||
            entry.status === 'settled'
          ) {
            onlineCollected += entry.shareAmount;
          } else {
            // unpaid or pay_at_turf — treat remaining as cash outstanding
            cashOutstanding += entry.shareAmount;
            if (entry.status === 'unpaid') {
              entry.status = 'pay_at_turf';
              await entry.save();
            }
          }
        }

        booking.status = 'confirmed';
        booking.onlineCollected = onlineCollected;
        booking.cashOutstanding = cashOutstanding;
        await booking.save();
      }
    }

    if (expiredBookings.length > 0) {
      console.log(`[SplitCleanup] Processed ${expiredBookings.length} expired split locks`);
    }
  } catch (error) {
    console.error('[SplitCleanup] Error:', error.message);
  }
};

const startSplitLockCleanup = () => {
  console.log('[SplitCleanup] Started background cleanup job (every 60s)');
  setInterval(cleanupExpiredSplitLocks, CLEANUP_INTERVAL_MS);
};

module.exports = { startSplitLockCleanup, cleanupExpiredSplitLocks };
