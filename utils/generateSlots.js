const Slot = require('../models/Slot');

/**
 * Generate slots for a turf over a date range
 * @param {Object} turf - Turf document with operatingHours, slotDuration, pricePerHour
 * @param {Date|String} startDate - Start date of the range
 * @param {Date|String} endDate - End date of the range
 * @returns {Number} Count of slots created
 */
const generateSlotsForDateRange = async (turf, startDate, endDate) => {
  const slots = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const openTime = turf.operatingHours.open || '06:00';
  const closeTime = turf.operatingHours.close || '23:00';
  const duration = turf.slotDuration || 60;

  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);

  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  for (
    let currentDate = new Date(start);
    currentDate <= end;
    currentDate.setDate(currentDate.getDate() + 1)
  ) {
    const dateOnly = new Date(currentDate);
    dateOnly.setHours(0, 0, 0, 0);

    for (
      let slotStart = openMinutes;
      slotStart + duration <= closeMinutes;
      slotStart += duration
    ) {
      const slotEnd = slotStart + duration;

      const startHour = String(Math.floor(slotStart / 60)).padStart(2, '0');
      const startMin = String(slotStart % 60).padStart(2, '0');
      const endHour = String(Math.floor(slotEnd / 60)).padStart(2, '0');
      const endMin = String(slotEnd % 60).padStart(2, '0');

      slots.push({
        turf: turf._id,
        date: new Date(dateOnly),
        startTime: `${startHour}:${startMin}`,
        endTime: `${endHour}:${endMin}`,
        price: turf.pricePerHour,
        status: 'available',
      });
    }
  }

  if (slots.length === 0) {
    return 0;
  }

  try {
    const result = await Slot.insertMany(slots, { ordered: false });
    return result.length;
  } catch (error) {
    // If some inserts fail due to duplicate keys, that's okay
    if (error.code === 11000 || error.writeErrors) {
      // Return the count of successfully inserted documents
      const insertedCount = error.insertedDocs
        ? error.insertedDocs.length
        : error.result
          ? error.result.nInserted || error.result.insertedCount || 0
          : 0;
      return insertedCount;
    }
    throw error;
  }
};

module.exports = generateSlotsForDateRange;
