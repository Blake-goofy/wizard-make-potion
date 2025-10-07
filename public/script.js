// Initialize Stripe with appropriate key based on test mode
const isTestMode = sessionStorage.getItem('testMode') === 'true';
let stripe = null; // Will be initialized after fetching key

// Fetch Stripe publishable key from backend
async function initializeStripe() {
  const headers = {};
  if (isTestMode) {
    headers['X-Test-Mode'] = 'true';
  }
  
  const response = await fetch('/api/stripe-key', { headers });
  const { publishableKey } = await response.json();
  stripe = Stripe(publishableKey);
  
  // Mount card element after Stripe is initialized
  const elements = stripe.elements();
  const cardElement = elements.create('card', {
    style: {
      base: {
        color: '#ffffff',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        '::placeholder': {
          color: '#cccccc'
        }
      },
      invalid: {
        color: '#ff6b6b'
      }
    }
  });
  cardElement.mount('#card-element');
  
  // Auto-fill test card notice if in test mode
  if (isTestMode) {
    const cardElementContainer = document.getElementById('card-element');
    if (cardElementContainer) {
      const testNotice = document.createElement('div');
      testNotice.style.cssText = 'margin-top: 10px; padding: 10px; background: rgba(255, 152, 0, 0.2); border-radius: 8px; color: #ff9800; font-size: 14px; text-align: center;';
      testNotice.innerHTML = 'Test Mode: Use card <strong>4242 4242 4242 4242</strong>, any future date, any CVC';
      cardElementContainer.parentNode.insertBefore(testNotice, cardElementContainer.nextSibling);
    }
  }
  
  return cardElement;
}

// Global config
let CURRENT_EVENT = null;
let CONFIG = {
  ticketPrice: 10.00,
  minQuantity: 1,
  maxQuantity: 10
};

// Get event ID from URL parameter
function getEventIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('event');
}

// Load event-specific configuration
async function loadConfig() {
  const eventId = getEventIdFromURL();
  
  if (!eventId) {
    alert('No event selected. Please select an event from the home page.');
    window.location.href = '/';
    return;
  }
  
  try {
    const response = await fetch(`/api/events/${eventId}`);
    
    if (!response.ok) {
      throw new Error('Event not found');
    }
    
    const event = await response.json();
    CURRENT_EVENT = event;
    
    // Check if event is in the past
    if (event.isPast) {
      alert('This event has already occurred. Please select a different event.');
      window.location.href = '/';
      return;
    }
    
    // Update CONFIG with event-specific values
    CONFIG.ticketPrice = event.ticketPrice;
    CONFIG.minQuantity = event.minQuantity;
    CONFIG.maxQuantity = event.maxQuantity;
    
    // Update page with event details
    document.title = 'Purchase Tickets - ' + event.name;
    document.getElementById('event-name').textContent = event.name;
    document.getElementById('event-datetime').textContent = event.day + ', ' + event.date + ' at ' + event.time;
    document.getElementById('event-address').textContent = event.address;
    
    // Update quantity limits
    quantityInput.min = CONFIG.minQuantity;
    quantityInput.max = CONFIG.maxQuantity;
    quantityInput.value = CONFIG.minQuantity;
    
    updateTotalPrice();
  } catch (error) {
    console.error('Error loading event:', error);
    alert('Failed to load event details. Please try again.');
    window.location.href = '/';
  }
}

// Initialize Stripe and card element (will be set after fetching key)
let cardElement = null;

const form = document.getElementById('payment-form');
const submitButton = document.getElementById('submit-button');
const paymentResult = document.getElementById('payment-result');
const emailInput = document.getElementById('email');
const quantityInput = document.getElementById('quantity');
const decrementBtn = document.getElementById('decrement-btn');
const incrementBtn = document.getElementById('increment-btn');
const subtotalElement = document.getElementById('subtotal-price');
const taxElement = document.getElementById('tax-amount');
const totalPriceElement = document.getElementById('total-price');

// Sales tax rate
const SALES_TAX_RATE = 0.09;

// Initialize the page
async function initializePage() {
  await loadConfig();
  cardElement = await initializeStripe();
}

// Load config and Stripe on page load
initializePage();

// Update total price when quantity changes
function updateTotalPrice() {
  const quantity = parseInt(quantityInput.value) || CONFIG.minQuantity;
  const subtotal = quantity * CONFIG.ticketPrice;
  const tax = Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
  const total = subtotal + tax;
  
  subtotalElement.textContent = subtotal.toFixed(2);
  taxElement.textContent = tax.toFixed(2);
  totalPriceElement.textContent = total.toFixed(2);
  
  // Update button text
  submitButton.textContent = `Purchase ${quantity} Ticket${quantity > 1 ? 's' : ''}`;
}

// Handle increment button
incrementBtn.addEventListener('click', () => {
  const currentValue = parseInt(quantityInput.value) || CONFIG.minQuantity;
  if (currentValue < CONFIG.maxQuantity) {
    quantityInput.value = currentValue + 1;
    updateTotalPrice();
  }
});

// Handle decrement button
decrementBtn.addEventListener('click', () => {
  const currentValue = parseInt(quantityInput.value) || CONFIG.minQuantity;
  if (currentValue > CONFIG.minQuantity) {
    quantityInput.value = currentValue - 1;
    updateTotalPrice();
  }
});

// Handle manual input changes
quantityInput.addEventListener('input', () => {
  let value = parseInt(quantityInput.value) || CONFIG.minQuantity;
  // Ensure value stays within bounds
  if (value < CONFIG.minQuantity) value = CONFIG.minQuantity;
  if (value > CONFIG.maxQuantity) value = CONFIG.maxQuantity;
  quantityInput.value = value;
  updateTotalPrice();
});

quantityInput.addEventListener('blur', () => {
  // Ensure valid value on blur
  let value = parseInt(quantityInput.value) || CONFIG.minQuantity;
  if (value < CONFIG.minQuantity) value = CONFIG.minQuantity;
  if (value > CONFIG.maxQuantity) value = CONFIG.maxQuantity;
  quantityInput.value = value;
  updateTotalPrice();
});

// Initialize total price
updateTotalPrice();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!CURRENT_EVENT) {
    alert('Event information not loaded. Please refresh the page.');
    return;
  }

  if (!stripe || !cardElement) {
    alert('Payment system is still loading. Please wait a moment and try again.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Processing...';

  const quantity = parseInt(quantityInput.value) || CONFIG.minQuantity;
  const email = emailInput.value;
  const eventId = CURRENT_EVENT.id;

  try {
    // Backend calculates amount with tax
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add test mode header if enabled
    if (isTestMode) {
      headers['X-Test-Mode'] = 'true';
    }
    
    const response = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ email, quantity, eventId })
    });

    const responseData = await response.json();
    
    // Check for errors
    if (!response.ok || responseData.error) {
      throw new Error(responseData.error || 'Failed to create payment intent');
    }
    
    const { clientSecret, pricing } = responseData;
    
    if (!clientSecret) {
      throw new Error('No client secret received from server');
    }
    
    // Verify the pricing matches what we displayed
    const displayedTotal = parseFloat(totalPriceElement.textContent);
    if (pricing && Math.abs(pricing.total - displayedTotal) > 0.01) {
      console.warn('Price mismatch - refreshing display');
      subtotalElement.textContent = pricing.subtotal.toFixed(2);
      taxElement.textContent = pricing.salesTax.toFixed(2);
      totalPriceElement.textContent = pricing.total.toFixed(2);
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (result.error) {
      paymentResult.textContent = `Payment failed: ${result.error.message}`;
    } else {
      paymentResult.textContent = `Payment successful! Generating your tickets...`;
      
      const paymentIntentId = result.paymentIntent.id;
      
      // Trigger ticket generation (fallback for when webhooks don't work in dev)
      try {
        await fetch('/api/check-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId })
        });
      } catch (e) {
        console.error('Check payment error:', e);
      }
      
      // Redirect to confirmation page
      setTimeout(() => {
        window.location.href = `/confirmation?payment_intent=${paymentIntentId}`;
      }, 2000);
    }
  } catch (error) {
    paymentResult.textContent = `Error: ${error.message}`;
  }

  submitButton.disabled = false;
  updateTotalPrice(); // Reset button text
});