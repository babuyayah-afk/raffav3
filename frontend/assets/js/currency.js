(function () {
  // USD/KES is the 2026-11-09 ExchangeRate-API rate; INR/KES uses the user-provided 1 KES = 0.72 INR.
  const ratesToKES = Object.freeze({
    USD: 129.939272,
    INR: 1 / 0.72
  });
  const formatter = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0
  });

  function convertToKES(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) throw new TypeError('Currency amount must be a finite number.');
    if (currency === 'KES') return Math.round(value);
    if (!Object.prototype.hasOwnProperty.call(ratesToKES, currency)) {
      throw new RangeError(`Unsupported source currency: ${currency}`);
    }
    return Math.round(value * ratesToKES[currency]);
  }

  function format(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) throw new TypeError('Currency amount must be a finite number.');
    return formatter.format(value);
  }

  window.RAFACurrency = Object.freeze({ convertToKES, format, ratesToKES });
})();
