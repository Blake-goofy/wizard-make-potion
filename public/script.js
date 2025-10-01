const stripe = Stripe('pk_test_51SC2u8GaeO9L2D8a0XXFh8DB9z0XwRPd2fDCA66xVOyegHBVXH4LL4K3HqAiYCW5A9ofvxJQd2Pko2DdYHp3asqC00dV2B05SY'); // Replace with your publishable key

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

// Configure Stripe Elements appearance for dark theme
const appearance = {
  variables: {
    colorPrimary: '#4ecdc4',
    colorBackground: 'rgba(255, 255, 255, 0.05)',
    colorText: '#ffffff',
    colorTextSecondary: '#e0e0e0',
    colorTextPlaceholder: '#cccccc',
    colorDanger: '#ff6b6b',
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    spacingUnit: '4px',
    borderRadius: '10px',
    fontSizeBase: '16px'
  }
};

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

// Load config on page load
loadConfig();

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

  submitButton.disabled = true;
  submitButton.textContent = 'Processing...';

  const quantity = parseInt(quantityInput.value) || CONFIG.minQuantity;
  const email = emailInput.value;
  const eventId = CURRENT_EVENT.id;

  try {
    // Backend calculates amount with tax
    const response = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, quantity, eventId }),
    });

    const { clientSecret, pricing } = await response.json();
    
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