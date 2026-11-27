(function () {
  const cartKey = 'rafa-apparel-bag-preview';
  const cartItems = document.getElementById('cartItems');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartSummary = document.getElementById('cartSummary');
  const checkoutForm = document.getElementById('checkoutForm');
  const cartStatus = document.getElementById('cartStatus');
  const clearCartButton = document.getElementById('clearCart');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartTotal = document.getElementById('cartTotal');
  const cartDelivery = document.getElementById('cartDelivery');
  const mobileItemCount = document.getElementById('mobileItemCount');
  const mobileSubtotal = document.getElementById('mobileSubtotal');
  const mobileSubmitTotal = document.getElementById('mobileSubmitTotal');
  const mobileDelivery = document.getElementById('mobileDelivery');
  const mobileCheckoutBar = document.getElementById('mobileCheckoutBar');
  const mobileStepAction = document.getElementById('mobileStepAction');
  const editCartButton = document.getElementById('editCart');
  const mobileSummaryToggle = document.getElementById('mobileSummaryToggle');
  const mobileSummaryDetails = document.getElementById('mobileSummaryDetails');
  const deliveryStage = document.getElementById('deliveryStage');
  const paymentStage = document.getElementById('paymentStage');
  const reviewStage = document.getElementById('reviewStage');
  const mpesaPanel = document.getElementById('mpesaPanel');
  const cardPanel = document.getElementById('cardPanel');
  const otherPanel = document.getElementById('otherPanel');
  const mpesaPhone = document.getElementById('mpesaPhone');
  const mpesaPromptSent = document.getElementById('mpesaPromptSent');
  const otherPaymentReady = document.getElementById('otherPaymentReady');
  const demoCardConsent = document.getElementById('demoCardConsent');
  const deliveryInputs = Array.from(document.querySelectorAll(
    '#countryRegion, #firstName, #lastName, #checkoutEmail, #checkoutPhone, #deliveryAddress, #checkoutCity, #checkoutPostcode'
  ));
  const paymentMethodButtons = Array.from(document.querySelectorAll('[data-payment-method]'));
  const progressSteps = Array.from(document.querySelectorAll('[data-progress-step]'));
  const checkoutStages = {
    delivery: deliveryStage,
    payment: paymentStage,
    review: reviewStage
  };
  let currentStage = 'delivery';
  let selectedPaymentMethod = '';
  let paymentConfirmed = false;
  let lastCartSnapshot = '';

  function readCart() {
    const saved = window.localStorage.getItem(cartKey);
    if (saved === null) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new TypeError('Saved apparel bag must be a list.');

    return parsed.map((item) => {
      if (!item || typeof item !== 'object'
        || typeof item.id !== 'string'
        || typeof item.name !== 'string'
        || typeof item.size !== 'string'
        || typeof item.color !== 'string'
        || !Number.isFinite(Number(item.price))
        || Number(item.price) < 0
        || !Number.isSafeInteger(item.quantity)
        || item.quantity < 1
        || (item.image !== undefined && typeof item.image !== 'string')) {
        throw new TypeError('A saved apparel bag item is incomplete or invalid.');
      }

      return { ...item, price: Number(item.price) };
    });
  }

  function itemKey(item) {
    return JSON.stringify([item.id, item.size, item.color]);
  }

  function formatPrice(amount) {
    return window.RAFACurrency.format(amount);
  }

  function setStatus(message) {
    cartStatus.textContent = message;
  }

  function saveCart(items) {
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('rafa:apparel-cart-change'));
      return true;
    } catch (error) {
      console.error('Unable to save the apparel bag:', error);
      setStatus('Your browser could not save that change. Your bag was not updated.');
      return false;
    }
  }

  function createActionButton(action, label, text, key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `apparel-cart-action apparel-cart-action--${action}`;
    button.dataset.cartAction = action;
    button.dataset.cartKey = key;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    return button;
  }

  function getSafeImageUrl(source) {
    if (!source) return '';
    try {
      const url = new URL(source, window.location.href);
      const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(source);
      const sameOriginRelative = !hasProtocol && url.origin === window.location.origin;
      return url.protocol === 'https:' || url.protocol === 'http:' || sameOriginRelative
        ? url.href
        : '';
    } catch (error) {
      return '';
    }
  }

  function createCartItem(item) {
    const key = itemKey(item);
    const row = document.createElement('li');
    row.className = 'apparel-cart-item';

    const media = document.createElement('div');
    media.className = 'apparel-cart-item-media';
    const imageUrl = getSafeImageUrl(item.image);
    if (imageUrl) {
      const image = document.createElement('img');
      image.alt = item.name;
      image.loading = 'lazy';
      image.decoding = 'async';
      window.RAFAMedia?.prepareImage(image);
      image.src = imageUrl;
      image.addEventListener('error', () => {
        media.classList.add('is-unavailable');
        image.remove();
      });
      media.append(image);
    } else {
      media.classList.add('is-unavailable');
      media.setAttribute('aria-hidden', 'true');
    }

    const details = document.createElement('div');
    details.className = 'apparel-cart-item-details';
    const name = document.createElement('h3');
    name.textContent = item.name;
    const options = document.createElement('p');
    options.textContent = `${item.color} · ${item.size}`;
    const unitPrice = document.createElement('p');
    unitPrice.className = 'apparel-cart-unit-price';
    unitPrice.textContent = `${formatPrice(item.price)} each`;
    details.append(name, options, unitPrice);

    const controls = document.createElement('div');
    controls.className = 'apparel-cart-item-controls';
    const quantity = document.createElement('div');
    quantity.className = 'apparel-cart-quantity';
    quantity.setAttribute('aria-label', `Quantity: ${item.quantity}`);
    const decreaseButton = createActionButton('decrease', `Remove one ${item.name}`, '−', key);
    decreaseButton.disabled = item.quantity <= 1;
    quantity.append(decreaseButton);
    const quantityValue = document.createElement('span');
    quantityValue.textContent = String(item.quantity);
    quantity.append(quantityValue);
    const increaseButton = createActionButton('increase', `Add one ${item.name}`, '+', key);
    increaseButton.disabled = item.quantity === Number.MAX_SAFE_INTEGER;
    quantity.append(increaseButton);
    const removeButton = createActionButton('remove', `Remove ${item.name} from bag`, 'Remove', key);
    controls.append(quantity, removeButton);

    const lineTotal = document.createElement('strong');
    lineTotal.className = 'apparel-cart-line-total';
    lineTotal.textContent = formatPrice(item.price * item.quantity);
    row.append(media, details, controls, lineTotal);
    return row;
  }

  function getTotals(items) {
    const itemCount = items.reduce((total, item) => total + item.quantity, 0);
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
    if (!Number.isSafeInteger(itemCount) || !Number.isFinite(subtotal)) {
      throw new RangeError('Apparel bag total is too large.');
    }
    return { itemCount, subtotal };
  }

  function setBagLocked(locked) {
    cartItems.querySelectorAll('button[data-cart-action]').forEach((button) => {
      const quantity = Number(button.closest('.apparel-cart-item')
        ?.querySelector('.apparel-cart-quantity span')?.textContent);
      button.disabled = locked
        || (button.dataset.cartAction === 'decrease' && quantity <= 1)
        || (button.dataset.cartAction === 'increase' && quantity >= Number.MAX_SAFE_INTEGER);
    });
    clearCartButton.disabled = locked;
    editCartButton.disabled = locked;
  }

  function getDeliveryLabel() {
    return document.querySelector('input[name="deliveryChoice"]:checked')?.value === 'express'
      ? 'Express · rate to be confirmed'
      : 'Standard · rate to be confirmed';
  }

  function updatePaymentAmounts(subtotal) {
    const amount = formatPrice(subtotal);
    ['mpesaAmount', 'cardAmount', 'otherAmount'].forEach((id) => {
      document.getElementById(id).textContent = amount;
    });
    ['mpesaDelivery', 'cardDelivery', 'otherDelivery'].forEach((id) => {
      document.getElementById(id).textContent = 'To be confirmed';
    });
  }

  function updateProgress() {
    const stages = ['delivery', 'payment', 'review'];
    const activeIndex = stages.indexOf(currentStage);
    progressSteps.forEach((step) => {
      const key = step.dataset.progressStep;
      const index = stages.indexOf(key);
      const complete = key === 'cart' || index < activeIndex;
      const current = index === activeIndex;
      step.classList.toggle('is-complete', complete);
      step.classList.toggle('is-current', current);
      if (current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    Object.entries(checkoutStages).forEach(([key, stage]) => {
      stage.hidden = key !== currentStage;
    });
    mobileCheckoutBar.hidden = currentStage === 'review';
    updateMobileAction();
  }

  function updateMobileAction() {
    if (currentStage === 'delivery') {
      mobileStepAction.textContent = 'Choose a payment method';
      return;
    }
    if (selectedPaymentMethod === 'M-Pesa') {
      mobileStepAction.textContent = mpesaPromptSent.hidden ? 'Simulate payment prompt' : 'Simulate payment confirmation';
    } else if (selectedPaymentMethod === 'Card') {
      mobileStepAction.textContent = 'Simulate card payment';
    } else {
      mobileStepAction.textContent = otherPaymentReady.hidden
        ? 'Continue with this preference'
        : 'Simulate payment confirmation';
    }
  }

  function setStage(stage, statusMessage = '') {
    currentStage = stage;
    updateProgress();
    setStatus(statusMessage);
    const focusTarget = stage === 'delivery'
      ? document.getElementById('shippingTitle')
      : stage === 'payment'
        ? document.querySelector(`#${selectedPaymentMethod === 'M-Pesa' ? 'mpesaPanel' : selectedPaymentMethod === 'Card' ? 'cardPanel' : 'otherPanel'} h3`)
        : document.getElementById('reviewTitle');
    focusTarget?.setAttribute('tabindex', '-1');
    focusTarget?.focus({ preventScroll: true });
  }

  function validateDelivery() {
    const firstInvalid = deliveryInputs.find((input) => !input.checkValidity());
    if (firstInvalid) {
      firstInvalid.reportValidity();
      return false;
    }
    if (!isValidPhone(document.getElementById('checkoutPhone').value)) {
      const phone = document.getElementById('checkoutPhone');
      phone.setCustomValidity('Enter a phone number with 7 to 15 digits.');
      phone.reportValidity();
      phone.addEventListener('input', () => phone.setCustomValidity(''), { once: true });
      return false;
    }
    return true;
  }

  function isValidPhone(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  function updatePaymentPanel() {
    const panels = {
      'M-Pesa': mpesaPanel,
      Card: cardPanel,
      Other: otherPanel
    };
    Object.entries(panels).forEach(([method, panel]) => {
      panel.hidden = method !== selectedPaymentMethod;
    });
    const amount = getTotals(readCart()).subtotal;
    updatePaymentAmounts(amount);
    if (selectedPaymentMethod === 'M-Pesa') {
      mpesaPhone.value = document.getElementById('checkoutPhone').value;
    }
    updateMobileAction();
  }

  function createReceipt(items, subtotal) {
    const customerName = [
      document.getElementById('firstName').value.trim(),
      document.getElementById('lastName').value.trim()
    ].filter(Boolean).join(' ');
    const address = [
      document.getElementById('deliveryAddress').value.trim(),
      document.getElementById('checkoutCity').value.trim(),
      document.getElementById('checkoutPostcode').value.trim(),
      document.getElementById('countryRegion').value
    ].join(', ');
    const method = selectedPaymentMethod === 'Other'
      ? document.getElementById('otherPaymentMethod').value
      : selectedPaymentMethod;
    const confirmation = document.getElementById('receiptConfirmation');
    confirmation.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = 'Demo payment confirmed';
    const description = document.createElement('p');
    description.textContent = 'This status was simulated in your browser. No payment provider verified it.';
    confirmation.append(title, description);

    const details = document.getElementById('receiptDetails');
    details.replaceChildren();
    [
      ['Receipt', `DEMO-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`],
      ['Customer', customerName],
      ['Email', document.getElementById('checkoutEmail').value.trim()],
      ['Phone', document.getElementById('checkoutPhone').value.trim()],
      ...(selectedPaymentMethod === 'M-Pesa' ? [['M-Pesa phone', mpesaPhone.value.trim()]] : []),
      ['Delivery address', address],
      ['Delivery method', getDeliveryLabel()],
      ['Payment method', method],
      ['Items subtotal', formatPrice(subtotal)],
      ['Delivery fee', 'To be confirmed'],
      ['Amount simulated', formatPrice(subtotal)]
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      details.append(row);
    });

    const receiptItems = document.getElementById('receiptItems');
    receiptItems.replaceChildren(...items.map((item) => {
      const row = document.createElement('li');
      const description = document.createElement('span');
      const price = document.createElement('strong');
      description.textContent = `${item.name} · ${item.color} · ${item.size} · Qty ${item.quantity}`;
      price.textContent = formatPrice(item.price * item.quantity);
      row.append(description, price);
      return row;
    }));
  }

  function confirmDemoPayment() {
    let items;
    try {
      items = readCart();
    } catch (error) {
      render();
      return;
    }
    if (!items.length) {
      render();
      return;
    }
    if (selectedPaymentMethod === 'M-Pesa' && !isValidPhone(mpesaPhone.value)) {
      mpesaPhone.setCustomValidity('Enter a phone number with 7 to 15 digits.');
      mpesaPhone.reportValidity();
      mpesaPhone.addEventListener('input', () => mpesaPhone.setCustomValidity(''), { once: true });
      return;
    }
    const subtotal = getTotals(items).subtotal;
    paymentConfirmed = true;
    createReceipt(items, subtotal);
    setBagLocked(true);
    setStage('review', 'Demo payment confirmation simulated. No real payment was made.');
  }

  function render(focusTarget, statusMessage = '') {
    try {
      const items = readCart();
      const { itemCount, subtotal } = getTotals(items);
      const snapshot = JSON.stringify(items);
      if (lastCartSnapshot && snapshot !== lastCartSnapshot && currentStage !== 'delivery') {
        paymentConfirmed = false;
        selectedPaymentMethod = '';
        mpesaPromptSent.hidden = true;
        otherPaymentReady.hidden = true;
        setStage('delivery', 'Your bag changed. Please review delivery and payment again.');
      }
      lastCartSnapshot = snapshot;

      cartItems.replaceChildren(...items.map(createCartItem));
      cartSubtotal.textContent = formatPrice(subtotal);
      cartTotal.textContent = formatPrice(subtotal);
      cartDelivery.textContent = 'To confirm';
      mobileItemCount.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
      mobileSubtotal.textContent = formatPrice(subtotal);
      mobileSubmitTotal.textContent = formatPrice(subtotal);
      mobileDelivery.textContent = 'To confirm';
      cartEmpty.hidden = items.length > 0;
      checkoutForm.hidden = items.length === 0;
      cartSummary.hidden = items.length === 0;
      clearCartButton.hidden = items.length === 0;
      clearCartButton.textContent = 'Clear bag';
      cartItems.hidden = items.length === 0;
      updatePaymentAmounts(subtotal);
      setBagLocked(paymentConfirmed);
      setStatus(statusMessage);

      if (focusTarget) {
        const target = Array.from(cartItems.querySelectorAll('[data-cart-action]')).find((button) => (
          button.dataset.cartKey === focusTarget.key
          && button.dataset.cartAction === focusTarget.action
        ));
        (target || editCartButton).focus({ preventScroll: true });
      }
      updateProgress();
    } catch (error) {
      console.error('Unable to load the apparel bag:', error);
      cartItems.replaceChildren();
      cartItems.hidden = true;
      cartEmpty.hidden = true;
      checkoutForm.hidden = false;
      cartSummary.hidden = true;
      clearCartButton.hidden = false;
      clearCartButton.textContent = 'Clear saved bag';
      setStatus('The saved bag could not be read. Clear it to start a new apparel bag.');
    }
  }

  cartItems.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cart-action]');
    if (!button) return;

    let items;
    try {
      items = readCart();
    } catch (error) {
      render();
      return;
    }

    const index = items.findIndex((item) => itemKey(item) === button.dataset.cartKey);
    if (index < 0) {
      render(undefined, 'That item is no longer in your bag. The latest bag is shown.');
      return;
    }

    const item = items[index];
    let nextItems = items;
    let message = '';
    if (button.dataset.cartAction === 'increase') {
      if (item.quantity === Number.MAX_SAFE_INTEGER) return;
      nextItems = items.map((entry, entryIndex) => entryIndex === index
        ? { ...entry, quantity: entry.quantity + 1 }
        : entry);
      message = `${item.name} quantity increased.`;
    } else if (button.dataset.cartAction === 'decrease') {
      if (item.quantity <= 1) return;
      nextItems = items.map((entry, entryIndex) => entryIndex === index
        ? { ...entry, quantity: entry.quantity - 1 }
        : entry);
      message = `${item.name} quantity decreased.`;
    } else if (button.dataset.cartAction === 'remove') {
      nextItems = items.filter((_, entryIndex) => entryIndex !== index);
      message = `${item.name} removed from your bag.`;
    } else {
      return;
    }

    if (saveCart(nextItems)) {
      render({ key: button.dataset.cartKey, action: button.dataset.cartAction }, message);
    }
  });

  clearCartButton.addEventListener('click', () => {
    if (saveCart([])) render(undefined, 'Your apparel bag has been cleared.');
  });

  editCartButton.addEventListener('click', () => {
    if (paymentConfirmed) return;
    if (currentStage !== 'delivery') setStage('delivery');
    const firstControl = cartItems.querySelector('[data-cart-action]');
    if (firstControl) firstControl.focus({ preventScroll: false });
    else cartItems.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setStatus('Adjust quantities or remove apparel items in your order summary.');
  });

  document.querySelectorAll('input[name="deliveryChoice"]').forEach((input) => {
    input.addEventListener('change', () => {
      document.querySelectorAll('.delivery-option').forEach((option) => {
        option.classList.toggle('is-selected', option.contains(input) && input.checked);
      });
      cartDelivery.textContent = 'To confirm';
      mobileDelivery.textContent = 'To confirm';
      updatePaymentPanel();
    });
  });

  paymentMethodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!validateDelivery()) {
        setStatus('Complete the delivery information before choosing payment.');
        return;
      }
      selectedPaymentMethod = button.dataset.paymentMethod;
      paymentConfirmed = false;
      mpesaPromptSent.hidden = true;
      otherPaymentReady.hidden = true;
      paymentMethodButtons.forEach((option) => {
        const selected = option === button;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
      updatePaymentPanel();
      setStage('payment', `${selectedPaymentMethod} selected. Review the details before continuing.`);
    });
  });

  document.querySelectorAll('[data-back-to-delivery]').forEach((button) => {
    button.addEventListener('click', () => setStage('delivery', 'You can update your delivery details or choose another payment method.'));
  });

  document.getElementById('sendMpesaPrompt').addEventListener('click', () => {
    if (!isValidPhone(mpesaPhone.value)) {
      mpesaPhone.setCustomValidity('Enter a phone number with 7 to 15 digits.');
      mpesaPhone.reportValidity();
      mpesaPhone.addEventListener('input', () => mpesaPhone.setCustomValidity(''), { once: true });
      return;
    }
    mpesaPromptSent.hidden = false;
    updateMobileAction();
    setStatus('Demo payment prompt simulated. Nothing was sent to your phone.');
  });

  document.getElementById('simulateCardPayment').addEventListener('click', () => {
    if (!demoCardConsent.checked) {
      setStatus('Select the built-in demo card option to continue.');
      demoCardConsent.focus();
      return;
    }
    confirmDemoPayment();
  });

  document.getElementById('confirmOtherPayment').addEventListener('click', () => {
    otherPaymentReady.hidden = false;
    updateMobileAction();
    setStatus(`${document.getElementById('otherPaymentMethod').value} selected for the demo. No order has been submitted.`);
  });

  document.querySelectorAll('[data-simulate-confirmation]').forEach((button) => {
    button.addEventListener('click', confirmDemoPayment);
  });

  mobileStepAction.addEventListener('click', () => {
    if (currentStage === 'delivery') {
      paymentMethodButtons[0].focus();
      paymentMethodButtons[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (selectedPaymentMethod === 'M-Pesa') {
      if (mpesaPromptSent.hidden) document.getElementById('sendMpesaPrompt').click();
      else mpesaPromptSent.querySelector('[data-simulate-confirmation]').click();
    } else if (selectedPaymentMethod === 'Card') {
      document.getElementById('simulateCardPayment').click();
    } else if (selectedPaymentMethod === 'Other') {
      if (otherPaymentReady.hidden) document.getElementById('confirmOtherPayment').click();
      else otherPaymentReady.querySelector('[data-simulate-confirmation]').click();
    }
  });

  mobileSummaryToggle.addEventListener('click', () => {
    const expanded = mobileSummaryToggle.getAttribute('aria-expanded') === 'true';
    mobileSummaryToggle.setAttribute('aria-expanded', String(!expanded));
    mobileSummaryDetails.hidden = expanded;
  });

  function handleCartUpdate() {
    if (currentStage !== 'delivery') {
      selectedPaymentMethod = '';
      paymentConfirmed = false;
      mpesaPromptSent.hidden = true;
      otherPaymentReady.hidden = true;
      setStage('delivery', 'Your bag changed. Please review delivery and payment again.');
    }
    render();
  }

  window.addEventListener('storage', (event) => {
    if (event.key === cartKey || event.key === null) handleCartUpdate();
  });
  window.addEventListener('rafa:apparel-cart-change', handleCartUpdate);

  render();
})();
